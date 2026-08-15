import 'dotenv/config'
import { createClient, createAccount } from 'genlayer-js'
import { testnetBradbury, studionet } from 'genlayer-js/chains'

const chainName = process.env.VITE_GENLAYER_CHAIN === 'studionet' ? 'studionet' : 'bradbury'
const chain = chainName === 'studionet' ? studionet : testnetBradbury
const address = process.env.VITE_LUMEN_CONTRACT_ADDRESS

const account = createAccount(process.env.DEPLOYER_PRIVATE_KEY)
const client = createClient({ chain, account })
const GEN_WEI = 1_000_000_000_000_000_000n

console.log(`Creating weather policy on ${chainName} at ${address}...`)
const hash = await client.writeContract({
  address,
  functionName: 'create_weather_policy',
  args: [
    'Aswan, Egypt',
    '15 consecutive days between 2026-01-01 and 2026-01-20',
    'Pay 1 GEN if Aswan, Egypt receives less than 5mm of total rainfall over any 15 consecutive days between 2026-01-01 and 2026-01-20.',
    1,
    1,
    '2026-01-20',
  ],
  value: 1n * GEN_WEI,
})
console.log('create_weather_policy tx hash:', hash)
