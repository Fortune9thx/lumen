# Lumen

**Insurance written in language. Claims judged by decentralized AI. Settled in minutes on GenLayer.**

**Live app:** [lumen-x9.vercel.app](https://lumen-x9.vercel.app)
**Live contract (Bradbury):** [`0xC6821Dae5728D8980a74De406C11925C38c59934`](https://explorer-bradbury.genlayer.com/address/0xC6821Dae5728D8980a74De406C11925C38c59934)

## What Lumen does

Lumen lets a policyholder write their coverage in plain English instead of filling out a rigid form, and settles claims by having GenLayer's decentralized validator network independently reason over the claim, the policy text, and submitted evidence — reaching consensus on a payout without a human adjuster or a centralized oracle. Two products are supported:

- **Flight Delay & Cancellation** — "Pay me 500 GEN if flight BA287 is delayed more than 3 hours or cancelled." Owner-submitted: the policyholder files a claim with evidence, then the owner or Lumen triggers judgment.
- **Weather & Drought** — "Pay me 2,000 GEN if Nakuru County receives less than 5mm of rain over any 15 consecutive days." Fully automatic and permissionless: anyone can poll `check_weather_trigger` at any time — it's a safe no-op until the parametric condition is genuinely met, at which point that same call settles the policy. There is no manual claim path for weather.

Coverage is real, fund-backed insurance, not a simulation: premiums are paid in GEN into a shared pool at policy creation, the promised payout is reserved against that pool immediately, and an approved claim transfers GEN to the policyholder in the same transaction as the judgment — no separate withdrawal step, no IOU.

## Architecture

**Intelligent contract** (`contracts/LumenInsurance.py`) — policies, claims, and a shared payout pool, with GenLayer's Equivalence Principle used for claim adjudication. Judgment runs as a bound extraction stage, a binding gate, then an intent stage:

1. **Bound factual extraction** — objective facts only (flight delay minutes / cancellation, or dry-day count / rainfall), verified against the *exact* flight number/date or location/period stored on the policy — via an independent leader/validator agreement (`gl.vm.run_nondet_unsafe`).
2. **Binding gate** — if the verified record doesn't match the policy's own stored identity fields, or falls outside its expiry window, judgment stops here. Rejected, no intent stage runs.
3. **Intent judgment** — an LLM call (`gl.eq_principle.prompt_non_comparative`) decides whether those already-agreed, already-bound facts satisfy the policy's plain-English intent, gated by a confidence threshold and strict JSON-boolean parsing before any payout is possible.

**Frontend** (`src/`) — React + Vite + Tailwind, talking to the contract directly via `genlayer-js` (`src/lib/genlayer.js`). No backend, no database — every read and write goes straight to the chain.

```
contracts/LumenInsurance.py        Intelligent contract: policies, claims, settlement pool
tests/direct/                      gltest suite (74 tests)
src/pages/                         Landing + app pages (Dashboard, Create Policy, Claims, Wallet)
src/lib/genlayer.js                genlayer-js client + typed contract call wrappers
src/lib/WalletContext.jsx          Wallet connect state + chain-mismatch detection
src/components/ErrorBoundary.jsx   Catches unexpected render errors app-wide
scripts/deploy.mjs                 Deploys the contract from a local private key
scripts/check-deploy.mjs           Polls a deploy tx until it finalizes (waitForTransactionReceipt)
scripts/peek-tx.mjs                Reads a tx's current status without blocking on FINALIZED — use
                                    this when Bradbury's finality wait times out but the tx already
                                    reached ACCEPTED (a known testnet flakiness, not a failed deploy)
scripts/probe-contract.mjs         Verifies a deployed contract is actually readable
SECURITY.md                        Trust model, access-control matrix, judgment architecture
```

## Running locally

```bash
npm install
npm run dev
```

Runs at `http://localhost:5183`. Works without deploying your own contract — point `.env` at the live address above (see `.env.example`) and connect a wallet on Bradbury.

**Frontend tests:**

```bash
npm run test
```

**Contract tests:**

```bash
pip install genlayer-test genvm-linter Pillow
genvm-lint check contracts/LumenInsurance.py
gltest tests/direct -v
```

## Interacting with the live contract

Set `.env` from `.env.example`:

```bash
VITE_GENLAYER_CHAIN=bradbury
VITE_LUMEN_CONTRACT_ADDRESS=0xC6821Dae5728D8980a74De406C11925C38c59934
```

Then `npm run dev` and connect any EIP-1193 browser wallet (MetaMask, OKX Wallet, Coinbase Wallet, Rabby, etc.) funded with Bradbury testnet GEN — the app discovers your wallet via EIP-6963 and handles network switching (including adding the chain if your wallet doesn't know it yet) automatically. To deploy your own instance instead, see `SECURITY.md` and the `scripts/deploy.mjs` → `check-deploy.mjs` → `probe-contract.mjs` flow (never trust a receipt alone — always read-verify a fresh deploy).

## Security highlights

Full detail in [SECURITY.md](./SECURITY.md). In summary:

- **Bound to the policy's own stored details** — fact extraction is verified against the exact flight number/date or location/period stored on the policy (never the claimant's free text), and a binding gate rejects immediately — before intent judgment ever runs — if the record doesn't match or falls outside the expiry window.
- **One settlement path per product, no ambiguity** — flight is owner-submitted (`submit_claim` → `judge_claim`); weather is fully automatic and permissionless (`check_weather_trigger`, callable by anyone). Neither product can settle through the other's path.
- **Two-stage, confidence-gated judgment** — a single hijacked LLM response can't buy a payout alone; it must survive independent fact-extraction agreement, clear a `CONFIDENCE_THRESHOLD` (0.85), report a payout amount consistent with the policy's own reserved coverage, and pass a deterministic Python backstop against the agreed facts.
- **Strict JSON-boolean parsing** — `approved` and every other critical boolean field must be a real JSON `true`/`false`; a string, number, or missing value is never coerced into an approval the way Python's own permissive `bool()` would allow.
- **Prompt-injection hardening in layers** — untrusted text is fenced with per-claim tokens and an explicit "treat as data, not instructions" preamble, then further sanitized (angle brackets, braces, backticks, control characters, and the fence-marker prefix itself all stripped) so even a claimant who predicts the fence token can't forge a fence close.
- **Fail-closed everywhere** — malformed or non-JSON judgment output, an out-of-enum decision, a binding mismatch, or an inconsistent payout amount all degrade to a safe rejection, never a default approval.
- **Full access-control matrix** — every protected write is guarded, proven by a funded-random-wallet test suite (`tests/direct/test_access_control_matrix.py`) that asserts both the revert and that state is unchanged.
- **Real fund custody with CEI ordering** — state updates (pool debit, policy status) happen before the external GEN transfer, so a failed transfer rolls back the whole judgment atomically.

Disclosed, not hidden: if every validator's LLM were fooled by the same novel jailbreak across both judgment stages, GenLayer's consensus would register that as agreement — this is an inherent property of LLM-adjudicated systems. `SECURITY.md` documents this and every other known limitation explicitly.

## Built on GenLayer

Lumen is an Intelligent Contract application built for [GenLayer](https://genlayer.com)'s adjudication layer — settlement without a centralized oracle or human adjuster, using GenLayer's Equivalence Principle to reach validator consensus over natural-language claims and real-world evidence.

## License

MIT — see [LICENSE](./LICENSE).

## Author

Built and maintained solely by [Fortunex9](https://github.com/Fortune9thx).
