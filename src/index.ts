import {
  AddressLookupTableAccount,
  Connection,
  Keypair,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js'
import bs58 from 'bs58'
import { Configuration, getOrFail } from './config'
import {
  QuoteResponse,
  deserializeInstruction,
  getAddressLookupTableAccounts,
  getQuoteResponse,
  getSwapInstructions,
} from './jupiter'
import { Wallet } from '@coral-xyz/anchor'

const WSOL_SCALER = 1e9

async function main() {
  const rpcUrl = getOrFail(Configuration.RpcUrl)

  const keypair = Keypair.fromSecretKey(
    bs58.decode(getOrFail(Configuration.TradingPrivateKey))
  )
  const wallet = new Wallet(keypair)
  const connection = new Connection(rpcUrl)

  const wsolMint = 'So11111111111111111111111111111111111111112'

  // Set the token to atomically swap to and from
  const targetTokenMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

  // Setting how much Sol to trade
  const solTradeSize = 0.005 * WSOL_SCALER

  // For demonstration, we target the out required from the atomic operation as less than the input
  // Solana.
  const outRequired = solTradeSize * 0.99

  // Again this is a demonstration value - do not set slippage to 5% for anything real
  const slippage = 500

  const legOneQuote = await getQuoteResponse(
    wsolMint,
    targetTokenMint,
    `${solTradeSize}`,
    slippage,
    'ExactIn'
  )

  const legTwoQuote = await getQuoteResponse(
    targetTokenMint,
    wsolMint,
    outRequired.toFixed(0),
    slippage,
    'ExactOut',
  )

  const blockhash = (await connection.getLatestBlockhash()).blockhash
  const tx = await getTransaction(
    wallet,
    connection,
    blockhash,
    legOneQuote,
    legTwoQuote
  )

  tx.sign([keypair])
  const txSignature = await connection.sendTransaction(tx, {
    skipPreflight: true,
  })

  console.log('Transaction signature:', txSignature)

  while (true) {
    const r = await connection.getTransaction(txSignature)
    console.log(r)
    await new Promise(res => setTimeout(res, 1000))
  }
}

main()

async function getTransaction(
  wallet: Wallet,
  connection: Connection,
  blockhash: string,
  firstQuote: QuoteResponse,
  secondQuote: QuoteResponse,
): Promise<VersionedTransaction> {
  const firstInstruction = await getSwapInstructions(
    firstQuote,
    wallet.publicKey
  )

  const secondInstruction = await getSwapInstructions(
    secondQuote,
    wallet.publicKey
  )

  const addressLookupTableAccounts: AddressLookupTableAccount[] = []
  addressLookupTableAccounts.push(
    ...(await getAddressLookupTableAccounts(
      connection,
      firstInstruction.addressLookupTableAddresses
    ))
  )
  addressLookupTableAccounts.push(
    ...(await getAddressLookupTableAccounts(
      connection,
      secondInstruction.addressLookupTableAddresses
    ))
  )

  const txInstructions = [
    ...firstInstruction.computeBudgetInstructions.map(deserializeInstruction),
    ...firstInstruction.setupInstructions.map(deserializeInstruction),
    deserializeInstruction(firstInstruction.swapInstruction),
    deserializeInstruction(secondInstruction.swapInstruction),
  ]

  const messageV0 = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash,
    instructions: txInstructions,
  }).compileToV0Message(addressLookupTableAccounts)

  return new VersionedTransaction(messageV0)
}
