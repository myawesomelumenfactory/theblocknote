import { decodeOpReturn } from './TheBlockNote.js'

export const PROTOCOL_RE = /^t\s+-?\d+\s+-?\d+/

/** First hex chars of parent txid used in comment OP_RETURNs. */
export const COMMENT_TXID_PREFIX_LEN = 12

/** Max comment body length so `t 0 2 <txid12> <vout> "<text>"` stays ≤ 80 bytes. */
export const COMMENT_TEXT_MAX = 50

export function isProtocolMessage(text) {
  return typeof text === 'string' && PROTOCOL_RE.test(text.trim())
}

export function parentTxidPrefix(txid) {
  return String(txid || '')
    .toLowerCase()
    .replace(/[^a-f0-9]/g, '')
    .slice(0, COMMENT_TXID_PREFIX_LEN)
}

export function cleanCommentText(text) {
  return String(text || '')
    .replace(/"/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, COMMENT_TEXT_MAX)
}

/**
 * Single-comment OP_RETURN:
 *   t 0 2 <txid12> <vout> "<text≤50>"
 */
export function encodeComment(parentTxid, vout, text) {
  const prefix = parentTxidPrefix(parentTxid)
  const cleaned = cleanCommentText(text)
  if (prefix.length < COMMENT_TXID_PREFIX_LEN) {
    throw new Error('Invalid parent transaction id')
  }
  if (!cleaned) {
    throw new Error('Comment is empty')
  }
  const encoded = `t 0 2 ${prefix} ${vout} "${cleaned}"`
  const bytes =
    typeof Buffer !== 'undefined'
      ? Buffer.byteLength(encoded, 'utf8')
      : new TextEncoder().encode(encoded).length
  if (bytes > 80) {
    throw new Error('Comment exceeds the 80-byte OP_RETURN limit')
  }
  return encoded
}

/**
 * Parse a protocol line into tokens (quoted strings stay intact).
 */
export function tokenizeProtocolValue(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const matched = value.trim().match(/"([^"]*)"|[^\s"]+/g)
  if (!matched) return null
  return matched.map((part) => part.replace(/^"|"$/g, ''))
}

/**
 * Parse comment OP_RETURN. Accepts txid12 (preferred) or longer legacy prefixes.
 */
export function parseCommentValue(value) {
  const parts = tokenizeProtocolValue(value)
  if (!parts || parts.length < 6) return null
  if (parts[0] !== 't') return null
  if (String(parts[2]) !== '2') return null

  const prefix = String(parts[3] || '')
    .toLowerCase()
    .replace(/[^a-f0-9]/g, '')
  const vout = Number.parseInt(parts[4], 10)
  const text = parts.slice(5).join(' ').trim()
  if (prefix.length < 8 || !Number.isFinite(vout) || !text) return null

  return {
    kind: 'comment',
    prefix: prefix.slice(0, COMMENT_TXID_PREFIX_LEN),
    prefixRaw: prefix,
    vout,
    text: text.slice(0, COMMENT_TEXT_MAX),
  }
}

export function commentBelongsToMessage(comment, messageIndex) {
  if (!comment?.prefix || !messageIndex) return false
  const [txid, vout] = String(messageIndex).split('_')
  if (!txid) return false
  const parent = String(txid).toLowerCase()
  const matchesPrefix =
    parent.startsWith(comment.prefix) ||
    parent.startsWith(comment.prefixRaw) ||
    comment.prefixRaw?.startsWith(parent.slice(0, comment.prefixRaw.length))
  return Boolean(matchesPrefix) && Number(vout) === Number(comment.vout)
}

/**
 * Classify a stored protocol value for indexers / UI reconstruction.
 */
export function parseProtocolValue(value) {
  const parts = tokenizeProtocolValue(value)
  if (!parts || parts.length < 3 || parts[0] !== 't') return null

  const type = String(parts[2])
  if (type === '0') {
    return { kind: 'message', text: parts.slice(3).join(' ').trim() }
  }
  if (type === '1' || type === '-1') {
    return {
      kind: type === '1' ? 'vote_up' : 'vote_down',
      hash: parts[3],
      vout: Number.parseInt(parts[4], 10),
    }
  }
  if (type === '2') {
    return parseCommentValue(value)
  }
  return { kind: 'other', type, parts }
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

      const parsed = parseProtocolValue(value)
      records.push({
        index: `${txid}_${index}`,
        time,
        value,
        ...(parsed?.kind ? { kind: parsed.kind } : {}),
      })
    })
  }

  return records
}
