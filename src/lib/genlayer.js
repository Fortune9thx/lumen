import { createClient, createAccount } from 'genlayer-js'
import { testnetBradbury, studionet } from 'genlayer-js/chains'

const CHAIN = import.meta.env.VITE_GENLAYER_CHAIN === 'studionet' ? studionet : testnetBradbury
const CONTRACT_ADDRESS = import.meta.env.VITE_LUMEN_CONTRACT_ADDRESS

export const TARGET_CHAIN = CHAIN
export const TARGET_CHAIN_ID = CHAIN.id

/** Reads the wallet's current chain id (as a number), or null if no wallet is connected. */
export async function getWalletChainId() {
  if (!window.ethereum) return null
  const hex = await window.ethereum.request({ method: 'eth_chainId' })
  return parseInt(hex, 16)
}

/** Prompts the wallet to switch to Lumen's target GenLayer chain, adding it first if the wallet doesn't know it yet. */
export async function switchToTargetChain() {
  if (!window.ethereum) {
    throw new Error('No wallet found.')
  }
  const chainIdHex = `0x${TARGET_CHAIN_ID.toString(16)}`
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }],
    })
  } catch (err) {
    if (err.code !== 4902) throw err // 4902 = chain unknown to the wallet
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: chainIdHex,
        chainName: TARGET_CHAIN.name,
        nativeCurrency: TARGET_CHAIN.nativeCurrency,
        rpcUrls: TARGET_CHAIN.rpcUrls.default.http,
        blockExplorerUrls: TARGET_CHAIN.blockExplorers ? [TARGET_CHAIN.blockExplorers.default.url] : undefined,
      }],
    })
  }
}

let clientPromise = null

function getReadOnlyAccount() {
  return createAccount()
}

/**
 * Connects via the browser wallet. Resolves once per session.
 *
 * genlayer-js's client.connect() helper is MetaMask-only (it installs a
 * MetaMask Snap via wallet_getSnaps/wallet_requestSnaps), but that snap is
 * only used by genlayer-js for chain add/switch convenience and for
 * cancelTransaction() on studio networks — neither of which this app uses.
 * The actual read/write path (readContract/writeContract) signs through the
 * standard eth_sendTransaction RPC, which every EIP-1193 wallet supports.
 * So instead of calling client.connect(), request accounts and switch chain
 * ourselves, which works identically across MetaMask, OKX Wallet, Coinbase
 * Wallet, Rabby, and any other injected wallet.
 */
export async function connectWallet() {
  if (!window.ethereum) {
    throw new Error('No wallet found. Install a browser wallet (MetaMask, OKX Wallet, Coinbase Wallet, etc.) to create or manage policies.')
  }
  const [address] = await window.ethereum.request({ method: 'eth_requestAccounts' })
  const chainId = await getWalletChainId()
  if (chainId !== TARGET_CHAIN_ID) {
    await switchToTargetChain()
  }
  const client = createClient({ chain: CHAIN, account: address, provider: window.ethereum })
  clientPromise = Promise.resolve(client)
  return address
}

async function getClient() {
  if (clientPromise) return clientPromise
  // Read-only fallback client for pages that only need view calls before a wallet connects.
  const client = createClient({ chain: CHAIN, account: getReadOnlyAccount() })
  clientPromise = Promise.resolve(client)
  return clientPromise
}

function requireContractAddress() {
  if (!CONTRACT_ADDRESS) {
    throw new Error('VITE_LUMEN_CONTRACT_ADDRESS is not set — deploy LumenInsurance.py and add its address to .env')
  }
  return CONTRACT_ADDRESS
}

const ERROR_MESSAGES = {
  POLICY_NOT_FOUND: 'That policy could not be found.',
  NOT_POLICY_OWNER: "You're not the owner of this policy.",
  POLICY_NOT_ACTIVE: 'This policy is no longer active.',
  CLAIM_NOT_FOUND: 'That claim could not be found.',
  CLAIM_ALREADY_JUDGED: 'This claim has already been judged.',
  PREMIUM_PAYMENT_MISMATCH: "The premium sent doesn't match the declared amount.",
  INSUFFICIENT_POOL_CAPACITY: "Lumen's payout pool doesn't have enough capacity to cover this policy yet.",
  INSUFFICIENT_POOL_BALANCE: "Lumen's payout pool balance is insufficient to pay this claim.",
  CONTRACT_PAUSED: 'Lumen is temporarily paused for maintenance.',
  INVALID_FLIGHT_NUMBER: 'Enter a valid flight number.',
  INVALID_FLIGHT_DATE: 'Enter a valid flight date.',
  INVALID_COVERAGE_TEXT: 'Coverage description is required.',
  INVALID_COVERAGE_AMOUNT: 'Enter a valid coverage amount.',
  INVALID_PREMIUM: 'Enter a valid premium amount.',
  INVALID_EXPIRY: 'Enter a valid expiry date.',
  INVALID_LOCATION: 'Location is required.',
  INVALID_PERIOD: 'Coverage period is required.',
  INVALID_DESCRIPTION: 'A claim description is required.',
  INVALID_EVIDENCE_URLS: 'At least one evidence URL is required.',
}

/**
 * GenLayer RPC errors from a reverted contract call surface as a raw GenVM
 * execution dump — a Go %v struct repr like
 * `ReturnData:[]uint8{0x50, 0x4f, 0x4c, ...}`. The UserError's own code
 * string (e.g. "POLICY_NOT_FOUND") is IN there, but as a comma-separated
 * list of hex byte values, not literal text — decode those bytes back to a
 * string first, then extract the code and map it to friendly copy instead
 * of showing the raw dump to the user.
 */
export function friendlyContractError(err) {
  const raw = err?.message || String(err)
  const hexBytes = [...raw.matchAll(/0x([0-9a-fA-F]{1,2})\b/g)].map((m) => parseInt(m[1], 16))
  const decoded = hexBytes.length > 0 ? String.fromCharCode(...hexBytes) : ''
  const match = decoded.match(/\b([A-Z][A-Z0-9_]{4,})\b/) || raw.match(/\b([A-Z][A-Z0-9_]{4,})\b/)
  const code = match?.[1]
  if (code && ERROR_MESSAGES[code]) return new Error(ERROR_MESSAGES[code])
  if (code) return new Error(code.replace(/_/g, ' ').toLowerCase())
  return err instanceof Error ? err : new Error(raw)
}

async function readContract(functionName, args = []) {
  const client = await getClient()
  try {
    return await client.readContract({ address: requireContractAddress(), functionName, args })
  } catch (err) {
    throw friendlyContractError(err)
  }
}

async function writeContract(functionName, args = [], value) {
  const client = await getClient()
  try {
    const hash = await client.writeContract({ address: requireContractAddress(), functionName, args, value })
    await client.waitForTransactionReceipt({ hash, status: 'FINALIZED' })
    return hash
  } catch (err) {
    throw friendlyContractError(err)
  }
}

export const GEN_WEI = 1_000_000_000_000_000_000n

/** Whole-GEN amount (no decimals — GenVM calldata has no float type) to wei as a BigInt. */
export function genToWei(genAmount) {
  return BigInt(genAmount) * GEN_WEI
}

export async function createFlightPolicy({ flightNumber, flightDate, coverageText, coverageAmountGen, premiumGen, expiry }) {
  return writeContract(
    'create_flight_policy',
    [flightNumber, flightDate, coverageText, Number(coverageAmountGen), Number(premiumGen), expiry],
    genToWei(premiumGen),
  )
}

export async function createWeatherPolicy({ location, period, coverageText, coverageAmountGen, premiumGen }) {
  return writeContract(
    'create_weather_policy',
    [location, period, coverageText, Number(coverageAmountGen), Number(premiumGen)],
    genToWei(premiumGen),
  )
}

export async function getPolicy(policyId) {
  const raw = await readContract('get_policy', [policyId])
  return JSON.parse(raw)
}

export async function listPoliciesByOwner(owner) {
  const raw = await readContract('list_policies_by_owner', [owner])
  return JSON.parse(raw)
}

export async function submitClaim({ policyId, description, evidenceUrls }) {
  return writeContract('submit_claim', [policyId, description, evidenceUrls])
}

export async function judgeClaim(claimId) {
  return writeContract('judge_claim', [claimId])
}

export async function getClaim(claimId) {
  const raw = await readContract('get_claim', [claimId])
  return JSON.parse(raw)
}

export async function listClaimsByPolicy(policyId) {
  const raw = await readContract('list_claims_by_policy', [policyId])
  return JSON.parse(raw)
}

export async function cancelPolicy(policyId) {
  return writeContract('cancel_policy', [policyId])
}

export async function getPoolStatus() {
  const raw = await readContract('get_pool_status', [])
  return JSON.parse(raw)
}

/**
 * No contract-level list_claims_by_owner view exists (claims are indexed by
 * policy, not by claimant), so this aggregates client-side: fetch the
 * owner's policies, then each policy's claims, and flatten. Each claim is
 * tagged with its parent policy's id/type/coverage for display.
 */
export async function listClaimsByOwner(owner) {
  const policies = await listPoliciesByOwner(owner)
  const claimLists = await Promise.all(
    policies.map((policy) =>
      listClaimsByPolicy(policy.id).then((claims) =>
        claims.map((claim) => ({ ...claim, policy_type: policy.type, policy_coverage_text: policy.coverage_text, policy_coverage_amount: policy.coverage_amount })),
      ),
    ),
  )
  return claimLists.flat()
}
