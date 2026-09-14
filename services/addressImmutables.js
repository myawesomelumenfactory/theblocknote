import { explorerJson } from './BlockstreamExplorer.js'
import { isValidAddress } from './BitcoinUtils.js'
import {
  parseProtocolValue,
  recordsFromEsploraTxs,
} from './immutableProtocol.js'

const PAGE_SIZE = 25
const MAX_PAGES = 40

function txPaysAddress(tx, address) {
  return (tx.vout || []).some(
    (out) => out.scriptpubkey_address === address && Number(out.value) > 0
  )
}

function paidAmountInTx(tx, address) {
  if (!tx) return null
  return (tx.vout || []).reduce((sum, out) => {
    if (out.scriptpubkey_address !== address) return sum
    return sum + (Number(out.value) || 0)
  }, 0)
}

/**
 * Fetch address transaction history via Esplora (mempool / blockstream), with chain pagination.
 */
export async function fetchAddressTransactions(address, { maxPages = MAX_PAGES } = {}) {
  const all = []
  let path = `/address/${encodeURIComponent(address)}/txs`

  for (let page = 0; page < maxPages; page += 1) {
    const batch = await explorerJson(path)
    if (!Array.isArray(batch) || batch.length === 0) break

    all.push(...batch)

    if (batch.length < PAGE_SIZE) break

    const last = batch[batch.length - 1]
    if (!last?.txid || !last?.status?.confirmed) break

    path = `/address/${encodeURIComponent(address)}/txs/chain/${last.txid}`
  }

  return all
}

/**
 * Immutable protocol messages paid to a specific address (direct-message shape:
 * payment output to address + OP_RETURN in the same tx).
 */
export async function fetchAddressDirectMessages(address) {
  const trimmed = String(address || '').trim()
  if (!trimmed || !isValidAddress(trimmed)) {
    throw new Error('Invalid Bitcoin address')
  }

  const txs = await fetchAddressTransactions(trimmed)
  const incoming = txs.filter((tx) => txPaysAddress(tx, trimmed))
  const byTxid = new Map(incoming.map((tx) => [tx.txid, tx]))
  const records = recordsFromEsploraTxs(incoming, Math.floor(Date.now() / 1000), true)

  return records
    .map((record) => {
      const parsed = parseProtocolValue(record.value)
      if (parsed?.kind !== 'message') return null

      const txid = String(record.index || '').split('_')[0]
      const vout = Number.parseInt(String(record.index || '').split('_')[1], 10)

      return {
        index: record.index,
        txid,
        vout,
        time: record.time,
        value: record.value,
        text: parsed.text,
        amountPaid: paidAmountInTx(byTxid.get(txid), trimmed),
      }
    })
    .filter(Boolean)
    .sort((a, b) => (b.time || 0) - (a.time || 0))
}
