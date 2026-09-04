import { decodeOpReturn } from './TheBlockNote.js'

export const PROTOCOL_RE = /^t\s+-?\d+\s+-?\d+/

export function isProtocolMessage(text) {
  return typeof text === 'string' && PROTOCOL_RE.test(text.trim())
}

export function recordsFromEsploraTxs(txs, blockTime, protocolOnly = true) {
  const records = []

  for (const tx of txs || []) {
    const txid = tx.txid
    const time = tx.status?.block_time || blockTime
    const vouts = tx.vout || []

    vouts.forEach((out, index) => {
      const script = out.scriptpubkey
      if (out.scriptpubkey_type !== 'op_return' && !String(script || '').startsWith('6a')) {
        return
      }

      const value = decodeOpReturn(script)
      if (!value) return
      if (protocolOnly && !isProtocolMessage(value)) return

      records.push({
        index: `${txid}_${index}`,
        time,
        value,
      })
    })
  }

  return records
}
