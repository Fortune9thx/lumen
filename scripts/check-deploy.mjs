import 'dotenv/config'
import { createClient, createAccount } from 'genlayer-js'
import { testnetBradbury, studionet } from 'genlayer-js/chains'

const chainName = process.env.VITE_GENLAYER_CHAIN === 'studionet' ? 'studionet' : 'bradbury'
const chain = chainName === 'studionet' ? studionet : testnetBradbury

const hash = process.argv[2]
if (!hash) {
  console.error('Usage: node scripts/check-deploy.mjs <tx_hash>')
  process.exit(1)
}

const account = createAccount(process.env.DEPLOYER_PRIVATE_KEY)
const client = createClient({ chain, account })

const receipt = await client.waitForTransactionReceipt({ hash, status: 'FINALIZED', retries: 60, interval: 5000 })
console.log('Status:', receipt.statusName ?? receipt.status)
console.log('Full receipt:', JSON.stringify(receipt, (_key, value) => (typeof value === 'bigint' ? value.toString() : value), 2))

const address = receipt.data?.contract_address ?? receipt.contractAddress ?? receipt.to_address
console.log('\nLikely contract address:', address)
