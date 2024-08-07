// Load env before anything else
import * as dotenv from 'dotenv'
dotenv.config()

export enum Configuration {
  RpcUrl = 'RPC_URL',
  TradingPrivateKey = 'TRADING_PRIVATE_KEY',
  JupiterApiPath = 'JUPITER_API_PATH',
}

export function getOrFail(key: Configuration): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`)
  }
  return value
}
