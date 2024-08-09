import {
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  TransactionInstruction,
} from '@solana/web3.js'
import { Configuration, getOrFail } from './config'

export interface QuoteResponse {
  inputMint: string
  inAmount: string
  outputMint: string
  outAmount: string
  otherAmountThreshold: string
  swapMode: 'ExactIn' | 'ExactOut'
  slippageBps: number
  priceImpactPct: string
  contextSlot: number
  timeTaken: number
}

export interface SwapInstructions {
  tokenLedgerInstruction: any // If you are using `useTokenLedger = true`.
  computeBudgetInstructions: any // The necessary instructions to setup the compute budget.
  setupInstructions: any // Setup missing ATA for the users.
  swapInstruction: any // The actual swap instruction.
  cleanupInstruction: any // Unwrap the SOL if `wrapAndUnwrapSol = true`.
  addressLookupTableAddresses: any // The lookup table addresses that you can use if you are using versioned transaction.
}

export async function getQuoteResponse(
  inputMint: string,
  outputMint: string,
  amount: string,
  slippage: number,
  swapMode: 'ExactIn' | 'ExactOut',
): Promise<QuoteResponse> {
  const quoteResponse = await (
    await fetch(
      `${getOrFail(Configuration.JupiterApiPath)}/quote?inputMint=${inputMint}\
&outputMint=${outputMint}\
&amount=${amount}\
&slippageBps=${slippage}\
&onlyDirectRoutes=true
&swapMode=${swapMode}`
    )
  ).json()

  return quoteResponse
}

export function deserializeInstruction(instruction: any) {
  return new TransactionInstruction({
    programId: new PublicKey(instruction.programId),
    keys: instruction.accounts.map((key: any) => ({
      pubkey: new PublicKey(key.pubkey),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })),
    data: Buffer.from(instruction.data, 'base64'),
  })
}

export async function getAddressLookupTableAccounts(
  connection: Connection,
  keys: string[]
): Promise<AddressLookupTableAccount[]> {
  const addressLookupTableAccountInfos =
    await connection.getMultipleAccountsInfo(
      keys.map((key) => new PublicKey(key))
    )

  return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
    const addressLookupTableAddress = keys[index]
    if (accountInfo) {
      const addressLookupTableAccount = new AddressLookupTableAccount({
        key: new PublicKey(addressLookupTableAddress),
        state: AddressLookupTableAccount.deserialize(accountInfo.data),
      })
      acc.push(addressLookupTableAccount)
    }

    return acc
  }, new Array<AddressLookupTableAccount>())
}

export async function getSwapInstructions(
  quoteResponse: QuoteResponse,
  publicKey: PublicKey
): Promise<SwapInstructions> {
  const instructions = await (
    await fetch(
      `${getOrFail(Configuration.JupiterApiPath)}/swap-instructions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quoteResponse,
          userPublicKey: publicKey.toBase58(),
          wrapAndUnwrapSol: false,
          // Very aggressive priority fees for demo purposes
          computeUnitPriceMicroLamports: 100_000_000_000,
        }),
      }
    )
  ).json()

  if (instructions.error) {
    throw new Error('Failed to get swap instructions: ' + instructions.error)
  }

  return instructions
}
