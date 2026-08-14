# Lumen — Security Model

This document is the pre-submission security artifact for `contracts/LumenInsurance.py`. It reflects the contract as of the steward-review round that made Stage A actually fetch and authenticate a real, policy-bound flight/weather record in contract code (`gl.nondet.web.render` against FlightAware/Open-Meteo) instead of trusting an LLM self-report, on top of the earlier rounds that added record binding, deterministic expiry enforcement, sibling-claim closing, and cross-policy reserve isolation (`TestBindingToPolicyDetails`, `TestParentPolicyActiveRequirement`, `TestSiblingClaimClosing`, `TestCrossPolicyReserveIsolation`, `TestStrictBooleanHandling`, `TestClaimFlowSeparation` in `tests/direct/test_lumen_insurance.py`), and the original audit that produced `tests/direct/test_access_control_matrix.py`, `tests/direct/test_e2e_critical_path.py`, and `tests/direct/test_security_audit_regressions.py`. Every claim below is backed by a passing test — treat this file as a map to those tests, not a substitute for reading them.

## Trust model

- **The contract trusts nothing from the frontend.** Every write validates its own inputs (non-empty, length-bounded, amount-bounded) independent of whatever client-side validation exists in `src/`. A caller hitting the contract directly (curl, a script, a malicious frontend fork) gets the exact same guarantees as the real UI.
- **`gl.message.sender_address` is the only source of identity.** No method accepts a caller-supplied "who am I" parameter. Ownership is always resolved from the message sender or from a stored `owner` field set at creation time from the message sender.
- **The LLM judgment is adversarial input, not a trusted oracle.** Anyone can write a policy or a claim; the judgment prompt treats both as untrusted data (see "Prompt-injection mitigations" below), and the parsed decision is validated against a closed enum before any state change or fund movement is permitted.
- **The pool is a shared, mutual-liability fund**, not a per-policy escrow. A policy is only accepted if the *pool as a whole* could cover it (`_available_to_reserve_after_credit`); this is the same design GenLayer's Hedgix submission uses, adapted for free-text (not fixed-registry) coverage.

## Access control matrix

| Method | Guard | Enforced by |
|---|---|---|
| `create_flight_policy` | none (permissionless — anyone may buy their own coverage) | input validation + payable capacity check only |
| `create_weather_policy` | none (same as above) | same |
| `cancel_policy` | caller must be the policy's `owner` | `NOT_POLICY_OWNER` |
| `submit_claim` | **flight policies only**; caller must be the policy's `owner`; policy must be `active` | `WEATHER_POLICIES_USE_AUTOMATIC_TRIGGER`, `NOT_POLICY_OWNER`, `POLICY_NOT_ACTIVE` |
| `judge_claim` | caller must be the policy's `owner` **or** the contract `owner` | `NOT_AUTHORIZED_TO_TRIGGER_JUDGMENT` |
| `check_weather_trigger` | none (permissionless by design — see "Claim flows" below) | policy must be type `weather` and `active`; `NOT_A_WEATHER_POLICY`, `POLICY_NOT_ACTIVE` |
| `add_pool_funds` | none (permissionless — anyone may donate to the shared pool) | payable value check only |
| `withdraw_from_pool` | caller must be the contract `owner` | `NOT_OWNER` |
| `pause_contract` / `unpause_contract` | caller must be the contract `owner` | `NOT_OWNER` |

`judge_claim`'s dual-caller design (policy owner or contract owner) is deliberate, not an oversight: the judgment itself is deterministic-input/non-deterministic-output (the LLM evaluates whatever evidence was already submitted, regardless of who calls the trigger), so allowing the contract owner to act as a permissionless keeper — settling a claim even if the claimant never calls back — does not weaken the claimant's guarantees. It **does** exclude arbitrary third parties, closing the original finding that anyone could trigger judgment on anyone's claim.

Every row above is proven by a dedicated test in `tests/direct/test_access_control_matrix.py::TestAccessControlMatrix`, using a random unauthorized wallet (gltest's `direct_bob`/`direct_alice` fixtures) and asserting both the revert **and** that contract state is unchanged afterward.

## Claim flows: flight vs weather (no ambiguity between the two)

Lumen deliberately implements **two different, non-overlapping settlement paths** — one per product — rather than a single generic "submit a claim" flow for both, closing a specific steward-review finding that the frontend advertised "automatic" settlement for weather without a contract-level implementation to back it:

| Product | Path | Who can trigger it | What happens |
|---|---|---|---|
| Flight | `submit_claim` → `judge_claim` | Policy owner submits; policy owner or contract owner triggers judgment | Owner-submitted, since a flight claim is inherently something a specific traveler experienced and can describe/evidence — there's no parametric feed to poll unprompted. |
| Weather | `check_weather_trigger` | **Anyone** — a keeper bot, the owner, a third party | Fully automatic and permissionless: no claim submission exists for weather at all. Polling it is a safe no-op (no state change, no claim record, no `claim_id` consumed) until the parametric condition is genuinely met, at which point the same call settles the policy and writes an audit-trail claim record tagged `"source": "auto_trigger"`. |

`submit_claim` explicitly rejects any non-flight policy (`WEATHER_POLICIES_USE_AUTOMATIC_TRIGGER`), and `check_weather_trigger` explicitly rejects any non-weather policy (`NOT_A_WEATHER_POLICY`) — a weather policy can never be paid through `judge_claim`+`submit_claim`, and a flight policy can never be paid through the automatic trigger. This closes the possibility of the same policy being payable through two different pipelines with two different security postures. Proven by `tests/direct/test_lumen_insurance.py::TestClaimFlowSeparation`.

## Fetching and authenticating the flight/weather record, and deterministic expiry enforcement

Earlier revisions asked the model to *assert* facts (delay/cancellation, dry-days/rainfall) via `gl.nondet.exec_prompt` alone — the model could claim to have verified a record without the contract ever actually fetching one. This is closed: **Stage A now fetches a real, policy-bound record in contract code** (`gl.nondet.web.render`) before any LLM interpretation happens, and `record_matches_*` is gated deterministically on that fetch, not on an LLM self-report.

- **Flight** — `_extract_claim_facts` builds `https://www.flightaware.com/live/flight/{flight_number}` from the policy's own stored `flight_number` (never the claimant's text) and fetches it via `gl.nondet.web.render(url, mode="text")`. `record_matches_flight` is then a **plain Python check** on the fetched page — length > 200 chars, contains the flight number, doesn't contain "could not find"/"no results" — computed before any LLM call. Only if that check passes does the model see the fetched page text (sanitized the same way claimant text is, since a compromised external page is untrusted input too) and extract `record_date`/`delay_minutes`/`is_cancelled` from it — grounded interpretation of real content, not free invention.
- **Weather** — two fetches: Open-Meteo's free geocoding API (`geocoding-api.open-meteo.com/v1/search?name=...`) turns the policy's stored `location` into coordinates (`record_matches_location` is deterministically `False` if geocoding returns no results — no LLM call needed for that check), then Open-Meteo's free historical archive API (`archive-api.open-meteo.com/v1/archive?...&daily=precipitation_sum`) is queried for the window from the start of the policy expiry's year through the expiry date itself. The model then extracts `dry_days`/`rainfall_mm`/`record_period_end` from that fetched, real precipitation record — again, interpretation of real fetched data, not invention. Both are free, public, no-API-key-required endpoints; a manual `_url_encode` percent-encoder handles the free-text location query param (no `urllib` import — same "avoid an unverified stdlib dependency this close to deploy" reasoning already applied to `re`).
- **Deterministic expiry check, not an LLM judgment call.** Once Stage A returns `record_date`/`record_period_end` (the record's own reported date), `_is_iso_date_on_or_before(record_date, policy_expiry)` — pure Python string comparison, no model involved — decides whether the record falls on or before the policy's stored expiry. This is a real, verified constraint: `gl.message` in the pinned SDK (v0.2.16) exposes only `contract_address`/`sender_address`/`origin_address`/`value`/`chain_id` — **no block or wall-clock timestamp at all** (confirmed by reading the SDK source directly). A GenVM contract in this runtime cannot deterministically know "today's date," so this checks the record's own reported date against the policy's own stored expiry (both bound to policy-controlled data), not "now" against expiry. `_is_iso_date_on_or_before` relies on ISO 8601 lexicographic-equals-chronological ordering, the same property the frontend's own expiry-vs-flight-date form validation already depends on.
- **The binding gate runs before Stage B is ever invoked.** If `record_matches_*` is not `True`, or the deterministic expiry check fails, `judge_claim`/`check_weather_trigger` reject immediately — `gl.eq_principle.prompt_non_comparative` (Stage B) is never called, so a failed fetch, mismatched record, or expired record can never even reach intent judgment, let alone a payout. Proven by `tests/direct/test_lumen_insurance.py::TestBindingToPolicyDetails`, which registers **no Stage-B mock** — if the binding gate ever regressed and execution fell through to Stage B anyway, the test would fail with `MockNotFoundError` rather than silently passing.
- The verified record (including `record_summary` and the raw `record_date`/`record_period_end`) is stored on the claim as `verified_facts`, so the binding decision is fully auditable after the fact.
- `gl.vm.run_nondet_unsafe`'s leader/validator pair now covers the fetch itself, not just its interpretation: the validator independently re-fetches (a fresh `gl.nondet.web.render` call) and re-extracts, and `_facts_match` requires agreement on `record_matches_*` and the exact `record_date`/`record_period_end` string, not just the numeric facts. Two nodes hitting genuinely different live data disagree and consensus fails, rather than one node's read silently winning.
- **Honest limitation, disclosed rather than overstated:** the *interpretation* of fetched content (parsing delay minutes from FlightAware's page text; summarizing a dry-day streak from Open-Meteo's precipitation array) is still LLM-performed — unstructured/semi-structured real-world text still needs a model to read it. What changed is the input to that interpretation: it is now genuinely fetched, policy-bound content the contract retrieved itself, not an ungrounded assertion. `SECURITY.md`'s "Judgment architecture" section's residual-risk disclosure (LLM consensus proves agreement, not correctness) still applies to how that fetched content gets interpreted.
- `create_weather_policy` gained a required `expiry: str` parameter in an earlier revision (previously weather policies had no explicit expiry, only a free-text `period` description) — the binding gate needs a strict cutoff to check against; `period` alone is descriptive, not something a check can reliably parse a boundary from. Already reflected in every caller (tests, `src/lib/genlayer.js`, `CreatePolicyWeather.jsx`); no signature change in this revision.

## Parent-policy-ACTIVE requirement

`judge_claim` checks `policy_record.get("status") == "active"` — deterministically, before any Stage A extraction or LLM work runs — and reverts with `POLICY_NOT_ACTIVE` otherwise. (`check_weather_trigger` already had this check, since it loads and validates the policy before doing anything else.)

In practice, composed with sibling-claim closing (below), a *pending* claim whose parent policy has already left `"active"` is not reachable via the public API today — `cancel_policy` and a successful `judge_claim`/`check_weather_trigger` both eagerly close every other pending claim on that policy the moment it leaves `"active"`, so there's no surviving pending claim left to attempt judging afterward. That is a **stronger** guarantee than "reverts on attempt": the claim is proactively resolved to `"rejected"`, not left dangling to fail repeatedly. The `POLICY_NOT_ACTIVE` check in `judge_claim` remains as defense-in-depth — cheap, deterministic, and a safeguard against any future code path that might flip policy status without also wiring in sibling-claim closing.

`tests/direct/test_lumen_insurance.py::TestParentPolicyActiveRequirement::test_cannot_judge_a_claim_whose_policy_was_cancelled` proves the reachable end-to-end version of this: a claim submitted against a policy that's later cancelled is proactively rejected (not left pending), and any attempt to judge it afterward reverts.

## Sibling-claim closing

When a claim is approved and paid (`judge_claim`'s or `check_weather_trigger`'s approval branch), or when a policy is cancelled (`cancel_policy`), `_close_sibling_pending_claims(policy_id, exclude_claim_id, reason)` finds every OTHER claim against the same `policy_id` still in `"pending"` state and flips it to `"rejected"` with an explicit reason (`"sibling claim settled..."` or `"...policy was cancelled..."`). Without this, a policy with multiple pending claims (a real possibility — nothing stops a claimant from filing more than one claim attempt against a still-active policy, e.g. after an initial rejection) could have one claim paid while its siblings sit in `"pending"` forever, misleadingly implying they might still be judged.

This is deterministic and cheap: it iterates `claim_ids` once, filtering to the target `policy_id` per-claim (no separate per-policy claim index needed at the scale free-text policy claims operate at). Combined with the parent-policy-ACTIVE check above, a closed sibling can never later be paid — attempting to judge it reverts with `CLAIM_ALREADY_JUDGED`.

Proven by `tests/direct/test_lumen_insurance.py::TestSiblingClaimClosing`:
- Approving one of three pending claims on a policy closes the other two, each with a `"sibling claim settled"` reason, and exactly one payout occurs (not three).
- A *rejected* (not approved) claim does **not** close its siblings — the policy stays active and other pending claims remain pending, since a genuine claim attempt should still be judgeable.
- Cancelling a policy closes its one pending claim with a `"...policy was cancelled..."` reason.

## Per-policy reserve isolation

The pool is shared (see "Trust model" above — a deliberate design choice, matching GenLayer's Hedgix reference pattern), but **every payout amount is sourced exclusively from the specific policy being judged's own `coverage_amount_wei`**, fixed at that policy's creation time and never read from, or influenced by, any other policy's record. There is no code path in `judge_claim` or `check_weather_trigger` that reads a different policy's stored fields — the loaded `policy_record` is always the one identified by the claim's own `policy_id` (`judge_claim`) or the caller's own `policy_id` argument (`check_weather_trigger`).

`reserved_liability` and `pool_balance` are pool-wide aggregates, not per-policy sub-accounts — but this is safe precisely *because* the debit on payout is always exactly one policy's own `coverage_amount_wei`, never a computed or borrowed amount. Paying policy A can only ever subtract A's own fixed reserved amount from the pool-wide totals, leaving whatever the rest of the pool (including B's own untouched reservation) was before.

Proven explicitly by `tests/direct/test_lumen_insurance.py::TestCrossPolicyReserveIsolation`:
- Paying policy A's claim leaves policy B's stored record (`coverage_amount_wei`, `status`, every field) byte-for-byte unchanged, and the pool's `reserved_liability_wei` after A's payout equals exactly B's own reserved amount — not zero, not A+B, not anything else.
- Policy B can still be paid its own full coverage amount afterward — A settling first didn't silently consume any part of B's reserve.
- Even when policy A is *cancelled* (releasing its reserve back to the shared pool, correct shared-pool behavior), policy B's own claim still pays out exactly B's own amount — A's cancellation neither helps nor hurts B's own accounting.

## Judgment architecture: two-stage, confidence-gated

`judge_claim` (and `check_weather_trigger`, for weather's automatic path) deliberately split into two independent non-deterministic stages plus a binding gate between them, hardening against the residual risk that a single hijacked LLM response could buy a payout on its own:

- **Stage A — fetch-and-extract** (`_extract_claim_facts`, via `gl.vm.run_nondet_unsafe` with an explicit leader/validator pair). Fetches a real record bound to the policy's own identity fields (FlightAware for flight, Open-Meteo for weather — see "Fetching and authenticating the flight/weather record" above), gates `record_matches_*` deterministically on the fetch itself, then extracts objective facts (`delay_minutes`/`is_cancelled` for flight, `dry_days`/`rainfall_mm` for weather) plus the record's own reported date (`record_date`/`record_period_end`) from that fetched content — never a decision. The validator independently re-fetches and re-extracts, and must agree with the leader within numeric tolerance **and** on every binding/boolean/date field (`_facts_match`), or the whole call fails.
- **Binding gate.** If the agreed facts don't confirm `record_matches_flight`/`record_matches_location`, or the deterministic date check (`_is_iso_date_on_or_before`) fails against the policy's own stored expiry, judgment stops here — rejected, Stage B never runs.
- **Stage B — intent judgment** (`judge_intent`, via `gl.eq_principle.prompt_non_comparative`). Receives Stage A's *already-agreed, already-bound* facts plus the sanitized policy/claim text, and must return `{"approved": bool, "payout_amount": int, "confidence": <quoted decimal string>, "reasoning": str}`.

**Honest limitation on Stage A's "strict" half:** because Lumen's policies are free-text (not a fixed registry of parameterized products with a canonical price feed the way Hedgix's Binance-backed contract is), there is no deterministic ground-truth API to `strict_eq` against here. The "strict" part is strict *agreement between two independent extractions*, not strict comparison against a fixed external source — disclosed here rather than overstated as literal `strict_eq` certainty.

A single hijacked response can no longer buy a payout by itself. To succeed, an attack now has to simultaneously:
1. Survive Stage A's independent-extraction agreement (tolerance-checked, separate LLM calls),
2. Claim confidence ≥ `CONFIDENCE_THRESHOLD` (0.85, a top-of-file constant) in Stage B,
3. Report a `payout_amount` consistent with the policy's own pre-reserved coverage amount (never trusted to *set* the transfer amount — only used as a consistency signal; the real transfer always uses the policy's own `coverage_amount_wei`, fixed at creation time), and
4. Stay consistent with Stage A's facts via a deterministic Python backstop (e.g. flight: `not is_cancelled and delay_minutes <= 0` forces rejection regardless of what Stage B claims) — this can't be talked around by prompt wording since it's plain comparison against already-agreed values, not another LLM call.

This raises the cost of a successful attack; it does not claim to eliminate the residual risk below.

## Prompt-injection mitigations

Layered, because any single one alone is breakable:

1. **Delimiter + instruction framing.** Both stages, and Stage A's fetched-content interpretation, wrap attacker-controlled text in per-claim `FENCE-<token>-START`/`FENCE-<token>-END` markers with an explicit instruction telling the model to treat that content strictly as data, never as instructions — covers "ignore previous instructions" style attacks.
2. **Character-level sanitization (`_sanitize_evidence`).** Strips `<`, `>`, `{`, `}`, backticks, and control characters (collapsing newlines to spaces) from the prompt-bound copies of policy/claim text — the stored record keeps the claimant's original text for transparency. This closes tag/markdown/code-fence breakout attempts regardless of how the prompt's wording changes in the future. The same sanitizer runs on the **fetched external content** (FlightAware page text, Open-Meteo response text) before it's interpolated into a prompt — a compromised or adversarially-crafted external page is exactly as untrusted as claimant-supplied text, and gets the same treatment.
3. **Fence-marker stripping, because the token isn't secret.** The per-claim fence token is derived from `claim_id`/`policy_id` — both small, sequential, *public* identifiers. A claimant can read the public `claim_count` before submitting, predict their own upcoming `claim_id`, and pre-compute the exact token in advance — so the token provides no cryptographic secrecy, only defense-in-depth against naive copy-paste attempts. `_sanitize_evidence` additionally strips every literal occurrence of the `fence-` marker prefix (case-insensitive) from user content, which closes a forged-fence-close attempt *regardless* of whether the attacker predicted the token correctly. This is the actual security boundary here, not the token's unpredictability — documented explicitly rather than overstating what the token buys.

All three are proven with tests that assert the *actual constructed prompt*, not just the final outcome: `mock_llm` is registered with a pattern that only matches if the sanitization/fencing property actually holds — including exact-occurrence-count patterns (e.g. "exactly two, not three" `FENCE-<token>-END` occurrences) rather than naive absence checks, since the real contract-generated fence and a forged one are textually identical by construction. A regression fails with `MockNotFoundError` (proving the property broke) rather than silently passing.

**Known non-mitigable limit (residual risk):** determinism collapse. If every validator's LLM is susceptible to the *same* novel jailbreak across *both* stages simultaneously, GenLayer's equivalence principle would see them "agree" and accept it as consensus — consensus proves agreement, not correctness. The two-stage/confidence-threshold/backstop design above raises the cost and narrows the surface of such an attack; it does not claim to make it impossible by construction. This is an inherent property of LLM-adjudicated systems, not specific to this contract.

## Malformed-output handling (fail-closed)

- Both Stage A's extraction result and Stage B's `outcome_str` (the equivalence-principle-agreed judgment) are defensively coerced: Stage A's `leader_fn` replaces any non-dict LLM response with safe zero/false defaults before it ever reaches numeric comparison; Stage B's `json.loads` runs inside a `try/except`, and a non-JSON or non-object result degrades to `{"approved": False, "payout_amount": 0, "confidence": "0.0", ...}`.
- **Strict boolean parsing, not Python's `bool()`.** `approved` (Stage B) and every Stage-A boolean field (`is_cancelled`, `record_matches_flight`/`record_matches_location`) must be a real JSON boolean. Python's own `bool()` is dangerously permissive for this — `bool("false")` is `True`, `bool(1)` is `True` — so a string, number, `null`, or missing value is never silently coerced into an approval-favoring `True`. `approved` uses an explicit `isinstance(value, bool)` check that records a distinct rejection reason ("approved field was not a valid JSON boolean") when the type is wrong; the Stage-A fields use `_coerce_strict_bool` (`value is True`), the same safe-default-False behavior without needing individual reason text since the binding gate and backstop already surface why. Proven by `tests/direct/test_lumen_insurance.py::TestStrictBooleanHandling` — a Stage B response with `"approved": "true"` (the string) or `"approved": 1` is rejected exactly like `"approved": false` would be, and a Stage-A `"is_cancelled": "true"` still fails the deterministic backstop rather than satisfying it.
- `confidence` MUST be requested from the model as a quoted JSON string (`"0.85"`, never a bare `0.85`) — GenVM calldata encoding has no float type, and `gl.nondet.exec_prompt(response_format="json")` auto-parses the model's own JSON, so a bare numeric decimal in the model's *own* output becomes a Python `float` and blows up at the calldata boundary the instant it crosses a `gl_call`. `_coerce_confidence` parses the string after decode and clamps to `[0.0, 1.0]`.
- `reasoning` is coerced to `str` and length-capped (1000 chars) before being stored, so a malformed response can't store an arbitrarily large or non-string value.

Tests: `TestMalformedJudgmentOutputFailsClosed` (non-JSON string, and valid-JSON-but-not-object cases — both now flow through the two-stage pipeline and still fail closed), `TestPromptInjectionHardening::test_low_confidence_approval_falls_back_to_rejected`, `test_payout_amount_inconsistent_with_policy_coverage_falls_back_to_rejected`, `test_negative_verified_facts_force_rejection_regardless_of_stage_b`.

## State-machine invariants

- **Idempotent judgment.** `judge_claim` requires `claim.status == "pending"`; an already-judged claim (`approved` or `rejected`) can never be re-judged. This closes a double-payout path: without this guard, re-judging an approved claim would re-run the payout branch and drain the pool a second time for the same claim (proven by `TestJudgeIdempotency::test_cannot_double_pay_by_rejudging_after_approval`).
- **Terminal policy states block further claims.** `submit_claim` requires `policy.status == "active"`; a `paid` or `cancelled` policy can never receive a new claim.
- **Cancellation is owner-gated and only valid from `active`.** A `paid` policy cannot be "cancelled" to bypass the payout accounting.

## Fund safety / Checks-Effects-Interactions

`judge_claim`'s approval branch follows CEI strictly: `policy.status = "paid"`, `reserved_liability -=`, `pool_balance -=`, and `total_payouts_paid +=` all happen **before** the external `_Recipient(...).emit_transfer(...)` call. If the transfer reverts, GenVM's transaction atomicity rolls back the whole call including those state changes — there is no window where state says "paid" but funds didn't move, or vice versa.

- Every payable method (`create_flight_policy`, `create_weather_policy`, `add_pool_funds`) reads `gl.message.value` and validates it against the declared amount (`PREMIUM_PAYMENT_MISMATCH` if attached value ≠ declared premium).
- No withdrawal path is ever unreachable: `withdraw_from_pool` is capped at `_available_to_withdraw()` (pool minus reserved liability), so the owner can always recover unreserved funds, and every policy's coverage is reserved (not just hoped for) at creation time.
- **Known, deliberately unverifiable-by-testing gap:** `gltest`'s direct-mode WASI mock has no hook for `gl.evm.contract_interface` cross-contract calls, so the actual on-chain `emit_transfer` cannot be exercised in the test suite (confirmed by direct probing — the same gap exists in this project's sibling `agent-intent-settlement` test suite). All *state accounting* around the transfer (reservation, capacity checks, CEI ordering) is fully tested; the transfer call itself was verified by live deployment (see "Live verification" below), not by `gltest`.

## Storage discipline

- All persistent fields are class-level annotations (`owner: str`, `policies: TreeMap[str, str]`, etc.) — confirmed by direct file read, not assumed.
- `policies` and `claims` (`TreeMap[str, str]`) are explicitly initialized in `__init__` (`self.policies = TreeMap()`, `self.claims = TreeMap()`) — added during this audit; the prior version relied on implicit GenVM default-initialization of TreeMap-typed storage, which behaved correctly in testing and in the live deployment, but explicit initialization removes any ambiguity for a reviewer.
- Only `TreeMap[str, str]` value types are used (see `genlayer-allow-storage-broken` in project memory: non-`str` TreeMap value types have been observed to deploy successfully but become permanently unreadable on Bradbury). Complex records are JSON-serialized strings.
- All counters/amounts use `u256`. Every user-supplied string is length-bounded (`_require_nonempty`'s `max_len`, default 2000).
- `MAX_GEN_AMOUNT` (10¹⁵ GEN) bounds every GEN amount (coverage, premium, withdrawal) as a defensive ceiling — see the comment at its definition for why this can't be verified safe purely by testing (gltest's `u256` shim doesn't enforce real 256-bit overflow either).

## Header integrity

- Runner header: `# v0.2.16` (version comment) then `# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }`. Confirmed 0 CRLF line endings (`grep -c $'\r'` → 0).
- **Verified discrepancy, documented rather than "fixed" blind:** the canonical docs example (fetched live from docs.genlayer.com during this audit) shows only the `Depends` comment as line 1, with no leading version-comment line. Our header adds that leading `# v0.2.16` comment first. This is **not a defect** — the currently deployed contract at `0x2c4EBb5a06c5DAaf67d5165C37348E2E0b3ca6D4` used this exact header and achieved unanimous 5/5 validator `AGREE` votes on live Bradbury, and remains readable post-deployment. Removing the redundant line to match the minimal docs example exactly would be purely cosmetic and was not done in this pass, to avoid an unnecessary redeploy against an already-flaky testnet for a change with no functional effect.
- `genvm-lint check` reports a newer runner is available (`1zr6nqk597...`) — informational, not a failure; the pinned hash is the one with live-verified consensus behavior, and bumping it without re-running the full deploy+probe verification would trade a proven-working pin for an unverified one.

## Known limitations

1. **No live emit_transfer test coverage** (see "Fund safety" above) — inherent to the test harness, mitigated by live-network verification at deploy time.
2. **LLM consensus proves agreement, not correctness** (see "Judgment architecture" / "Prompt-injection mitigations") — inherent to any LLM-adjudicated contract; the two-stage design raises the cost of this but does not eliminate it.
3. **No price oracle.** "GEN" is the settlement currency directly; there is no USD/GEN conversion. This is a product decision (documented in `README.md`), not an oversight.
4. **Interpretation of fetched content is still LLM-performed.** Record existence (`record_matches_*`) and expiry are now deterministic Python gates on real fetched data (see "Fetching and authenticating..."), but reading delay-minutes off FlightAware's page text or summarizing a dry-day streak from Open-Meteo's precipitation array still needs a model to parse real-world, semi-structured content. This is narrower than the prior "the model might not have checked anything real" gap — the input is now genuinely fetched and policy-bound — but the interpretation step itself carries the same LLM-consensus caveat as the rest of Stage A/B (see limitation #2).
5. **External data source availability is not guaranteed.** FlightAware and Open-Meteo are third-party services Lumen doesn't control; if either is unreachable or changes its page/response format, `_extract_claim_facts` degrades to `record_matches_*: False` (fail-closed — a claim can't be wrongly approved from a broken fetch, only wrongly held pending until the source recovers or the claimant/owner tries again).
6. **The per-claim fence token is not secret** (see "Prompt-injection mitigations" #3) — mitigated by stripping the marker prefix from user content directly, not by relying on the token's unpredictability.
7. **No wall-clock "now" — expiry is record-date-vs-policy-expiry, not date-vs-today.** Verified directly from the GenVM SDK source: `gl.message` (v0.2.16) exposes no timestamp field. A contract in this runtime cannot know today's date deterministically, so `_is_iso_date_on_or_before` compares the verified record's own reported date against the policy's stored expiry — both policy-controlled values — not against "the current date." A policy past its expiry with no claim ever filed against it does not auto-transition to any "expired" status; expiry is enforced at judgment time, not by a background state transition.

## Running the tests

```bash
pip install genlayer-test genvm-linter Pillow
genvm-lint check contracts/LumenInsurance.py
gltest tests/direct -v
```

Frontend:

```bash
npm run test
```

Deploy / live verification:

```bash
npm run deploy                                   # scripts/deploy.mjs
node scripts/check-deploy.mjs <tx_hash>          # if it times out waiting for FINALIZED
node scripts/probe-contract.mjs <address>        # never trust a receipt alone — read-verify it
```
