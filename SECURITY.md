# Lumen — Security Model

This document is the pre-submission security artifact for `contracts/LumenInsurance.py`. It reflects the contract as of the audit that produced `tests/direct/test_access_control_matrix.py`, `tests/direct/test_e2e_critical_path.py`, and the additions to `tests/direct/test_security_audit_regressions.py`. Every claim below is backed by a passing test — treat this file as a map to those tests, not a substitute for reading them.

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
| `submit_claim` | caller must be the policy's `owner`; policy must be `active` | `NOT_POLICY_OWNER`, `POLICY_NOT_ACTIVE` |
| `judge_claim` | caller must be the policy's `owner` **or** the contract `owner` | `NOT_AUTHORIZED_TO_TRIGGER_JUDGMENT` |
| `add_pool_funds` | none (permissionless — anyone may donate to the shared pool) | payable value check only |
| `withdraw_from_pool` | caller must be the contract `owner` | `NOT_OWNER` |
| `pause_contract` / `unpause_contract` | caller must be the contract `owner` | `NOT_OWNER` |

`judge_claim`'s dual-caller design (policy owner or contract owner) is deliberate, not an oversight: the judgment itself is deterministic-input/non-deterministic-output (the LLM evaluates whatever evidence was already submitted, regardless of who calls the trigger), so allowing the contract owner to act as a permissionless keeper — settling a claim even if the claimant never calls back — does not weaken the claimant's guarantees. It **does** exclude arbitrary third parties, closing the original finding that anyone could trigger judgment on anyone's claim.

Every row above is proven by a dedicated test in `tests/direct/test_access_control_matrix.py::TestAccessControlMatrix`, using a random unauthorized wallet (gltest's `direct_bob`/`direct_alice` fixtures) and asserting both the revert **and** that contract state is unchanged afterward.

## Judgment architecture: two-stage, confidence-gated

`judge_claim` deliberately splits into two independent non-deterministic stages, hardening against the residual risk that a single hijacked LLM response could buy a payout on its own:

- **Stage A — factual extraction** (`_extract_claim_facts`, via `gl.vm.run_nondet_unsafe` with an explicit leader/validator pair). Extracts only objective facts (`delay_minutes`/`is_cancelled` for flight, `dry_days`/`rainfall_mm` for weather) — never a decision. The validator independently re-runs the extraction and must agree with the leader within numeric tolerance (`_facts_match`), or the whole call fails.
- **Stage B — intent judgment** (`judge_intent`, via `gl.eq_principle.prompt_non_comparative`, same pattern as before). Receives Stage A's *already-agreed* facts plus the sanitized policy/claim text, and must return `{"approved": bool, "payout_amount": int, "confidence": <quoted decimal string>, "reasoning": str}`.

**Honest limitation on Stage A's "strict" half:** because Lumen's policies are free-text (not a fixed registry of parameterized products with a canonical price feed the way Hedgix's Binance-backed contract is), there is no deterministic ground-truth API to `strict_eq` against here. The "strict" part is strict *agreement between two independent extractions*, not strict comparison against a fixed external source — disclosed here rather than overstated as literal `strict_eq` certainty.

A single hijacked response can no longer buy a payout by itself. To succeed, an attack now has to simultaneously:
1. Survive Stage A's independent-extraction agreement (tolerance-checked, separate LLM calls),
2. Claim confidence ≥ `CONFIDENCE_THRESHOLD` (0.85, a top-of-file constant) in Stage B,
3. Report a `payout_amount` consistent with the policy's own pre-reserved coverage amount (never trusted to *set* the transfer amount — only used as a consistency signal; the real transfer always uses the policy's own `coverage_amount_wei`, fixed at creation time), and
4. Stay consistent with Stage A's facts via a deterministic Python backstop (e.g. flight: `not is_cancelled and delay_minutes <= 0` forces rejection regardless of what Stage B claims) — this can't be talked around by prompt wording since it's plain comparison against already-agreed values, not another LLM call.

This raises the cost of a successful attack; it does not claim to eliminate the residual risk below.

## Prompt-injection mitigations

Layered, because any single one alone is breakable:

1. **Delimiter + instruction framing.** Both stages wrap attacker-controlled text in per-claim `FENCE-<token>-START`/`FENCE-<token>-END` markers with an explicit instruction telling the model to treat that content strictly as data, never as instructions — covers "ignore previous instructions" style attacks.
2. **Character-level sanitization (`_sanitize_evidence`).** Strips `<`, `>`, `{`, `}`, backticks, and control characters (collapsing newlines to spaces) from the prompt-bound copies of policy/claim text — the stored record keeps the claimant's original text for transparency. This closes tag/markdown/code-fence breakout attempts regardless of how the prompt's wording changes in the future.
3. **Fence-marker stripping, because the token isn't secret.** The per-claim fence token is derived from `claim_id`/`policy_id` — both small, sequential, *public* identifiers. A claimant can read the public `claim_count` before submitting, predict their own upcoming `claim_id`, and pre-compute the exact token in advance — so the token provides no cryptographic secrecy, only defense-in-depth against naive copy-paste attempts. `_sanitize_evidence` additionally strips every literal occurrence of the `fence-` marker prefix (case-insensitive) from user content, which closes a forged-fence-close attempt *regardless* of whether the attacker predicted the token correctly. This is the actual security boundary here, not the token's unpredictability — documented explicitly rather than overstating what the token buys.

All three are proven with tests that assert the *actual constructed prompt*, not just the final outcome: `mock_llm` is registered with a pattern that only matches if the sanitization/fencing property actually holds — including exact-occurrence-count patterns (e.g. "exactly two, not three" `FENCE-<token>-END` occurrences) rather than naive absence checks, since the real contract-generated fence and a forged one are textually identical by construction. A regression fails with `MockNotFoundError` (proving the property broke) rather than silently passing.

**Known non-mitigable limit (residual risk):** determinism collapse. If every validator's LLM is susceptible to the *same* novel jailbreak across *both* stages simultaneously, GenLayer's equivalence principle would see them "agree" and accept it as consensus — consensus proves agreement, not correctness. The two-stage/confidence-threshold/backstop design above raises the cost and narrows the surface of such an attack; it does not claim to make it impossible by construction. This is an inherent property of LLM-adjudicated systems, not specific to this contract.

## Malformed-output handling (fail-closed)

- Both Stage A's extraction result and Stage B's `outcome_str` (the equivalence-principle-agreed judgment) are defensively coerced: Stage A's `leader_fn` replaces any non-dict LLM response with safe zero/false defaults before it ever reaches numeric comparison; Stage B's `json.loads` runs inside a `try/except`, and a non-JSON or non-object result degrades to `{"approved": False, "payout_amount": 0, "confidence": "0.0", ...}`.
- `approved` is coerced to `bool`; a value outside the two expected states can never accidentally evaluate truthy in a way that skips the confidence/consistency/backstop checks below it.
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
4. **Stage A's extraction is agreement-based, not ground-truth-based** (see "Judgment architecture") — Lumen's free-text policies have no fixed canonical data feed to `strict_eq` against, unlike registry-based contracts with a real price oracle.
5. **The per-claim fence token is not secret** (see "Prompt-injection mitigations" #3) — mitigated by stripping the marker prefix from user content directly, not by relying on the token's unpredictability.

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
