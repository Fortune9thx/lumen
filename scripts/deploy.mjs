import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient, createAccount } from 'genlayer-js'
import { testnetBradbury, studionet } from 'genlayer-js/chains'

const __dirname = dirname(fileURLToPath(import.meta.url))

const chainName = process.env.VITE_GENLAYER_CHAIN === 'studionet' ? 'studionet' : 'bradbury'
const chain = chainName === 'studionet' ? studionet : testnetBradbury

const privateKey = process.env.DEPLOYER_PRIVATE_KEY
if (!privateKey) {
  console.error('Set DEPLOYER_PRIVATE_KEY in .env (never commit this file) before deploying.')
  process.exit(1)
}

const account = createAccount(privateKey)
const client = createClient({ chain, account })

const contractCode = readFileSync(resolve(__dirname, '../contracts/LumenInsurance.py'), 'utf-8')

console.log(`Deploying LumenInsurance to ${chainName} from ${account.address}...`)

const hash = await client.deployContract({ code: contractCode, args: [] })
console.log('Deploy tx:', hash)

const receipt = await client.waitForTransactionReceipt({ hash, status: 'FINALIZED' })
const address = receipt.data?.contract_address ?? receipt.contractAddress

console.log('Contract address:', address)
console.log(`\nAdd this to .env:\nVITE_LUMEN_CONTRACT_ADDRESS=${address}`)
