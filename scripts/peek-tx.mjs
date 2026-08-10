import 'dotenv/config'
import { createClient, createAccount } from 'genlayer-js'
import { testnetBradbury, studionet } from 'genlayer-js/chains'

const chainName = process.env.VITE_GENLAYER_CHAIN === 'studionet' ? 'studionet' : 'bradbury'
const chain = chainName === 'studionet' ? studionet : testnetBradbury

const hash = process.argv[2]
if (!hash) {
  console.error('Usage: node scripts/peek-tx.mjs <tx_hash>')
  process.exit(1)
}

const account = createAccount(process.env.DEPLOYER_PRIVATE_KEY)
const client = createClient({ chain, account })

const tx = await client.getTransaction({ hash })
console.log('Status:', tx.statusName ?? tx.status)
console.log('Full tx:', JSON.stringify(tx, (_key, value) => (typeof value === 'bigint' ? value.toString() : value), 2))
