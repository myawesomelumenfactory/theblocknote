import { explorerJson, explorerText } from './BlockstreamExplorer.js'
import { applyChainTip } from './ChainTipStore.js'
import { isProtocolMessage } from './immutableProtocol.js'

const MEMPOOL = 'https://mempool.space/api'

async function mempoolJson(path) {
  try {
    const response = await fetch(`${MEMPOOL}${path}`, { cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const raw = await response.text()
    if (!raw) throw new Error('Empty response')
    try {
      return JSON.parse(raw)
    } catch {
      // Esplora sometimes returns bare strings/numbers (e.g. tip height).
      const asNum = Number.parseInt(raw, 10)
      if (Number.isFinite(asNum) && String(asNum) === raw.trim()) return asNum
      return raw.trim()
    }
  } catch {
    // Fall back to shared explorer helper (mempool first in the list).
    return explorerJson(path)
  }
}

async function mempoolText(path) {
  try {
    const response = await fetch(`${MEMPOOL}${path}`, { cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const raw = await response.text()
    if (raw != null && String(raw).trim()) return String(raw).trim()
  } catch {
    /* fall through */
  }
  const fallback = await explorerText(path)
  return fallback != null ? String(fallback).trim() : null
}

function normalizeBlock(row) {
  if (!row || typeof row !== 'object') return null
  const height = Number(row.height)
  if (!Number.isFinite(height)) return null
  const extras = row.extras || {}
  return {
    id: row.id || row.hash || null,
    height,
    timestamp: Number(row.timestamp) || Number(row.time) || null,
    txCount: Number(row.tx_count ?? row.txCount) || 0,
    size: Number(row.size) || 0,
    weight: Number(row.weight) || 0,
    difficulty: Number(row.difficulty) || null,
    medianFee: Number(extras.medianFee ?? row.medianFee) || null,
    totalFees: Number(extras.totalFees ?? row.totalFees) || null,
    reward: Number(extras.reward ?? row.reward) || null,
    pool: extras.pool?.name || extras.miner || null,
  }
}

/** Blocks returned per mempool/esplora `/v1/blocks` page. */
export const BLOCKS_PAGE_SIZE = 15

/** Famous heights with notable on-chain messages. */
export const NETWORK_LANDMARKS = [
  { id: 'genesis', height: 0 },
  { id: 'block666666', height: 666_666 },
]

/** Genesis coinbase text (block 0) — baked so the shortcut works offline. */
export const GENESIS_COINBASE = {
  height: 0,
  txid: '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',
  text: 'The Times 03/Jan/2009 Chancellor on brink of second bailout for banks',
}

/** Witness commitment OP_RETURN prefix (segwit). */
const WITNESS_COMMITMENT_HEX = '6a24aa21a9ed'

/**
 * Recent mined blocks (newest first).
 * Pass `startHeight` to page backward from that height (inclusive).
 * Omit / null for the tip page.
 */
export async function fetchRecentBlocks(limit = BLOCKS_PAGE_SIZE, startHeight = null) {
  const path =
    Number.isFinite(startHeight) && startHeight >= 0
      ? `/v1/blocks/${Math.floor(startHeight)}`
      : '/v1/blocks'
  const raw = await mempoolJson(path)
  if (!Array.isArray(raw)) return []
  return raw
    .map(normalizeBlock)
    .filter(Boolean)
    .slice(0, limit)
}

/** Fetch a single block summary by height (via the blocks page window). */
export async function fetchBlockByHeight(height) {
  const h = Math.floor(Number(height))
  if (!Number.isFinite(h) || h < 0) return null
  const page = await fetchRecentBlocks(BLOCKS_PAGE_SIZE, h)
  return page.find((block) => block.height === h) || page[0] || null
}

/**
 * Pull printable ASCII from a coinbase scriptsig (skips BIP34 height push noise).
 * Prefers real script pushes over a raw longest-run scan (avoids length-byte junk).
 */
export function decodeCoinbaseScriptSig(hex) {
  const pushes = extractScriptPushes(hex)
  let best = ''
  for (const push of pushes) {
    const ascii = longestAsciiRun(push)
    if (ascii.length > best.length) best = ascii
  }
  if (best.length >= 4) return best

  // Fallback: raw scan for older / unusual coinbases.
  const raw = String(hex || '').replace(/[^0-9a-fA-F]/g, '')
  if (!raw) return ''
  best = ''
  let current = ''
  for (let i = 0; i < raw.length; i += 2) {
    const byte = Number.parseInt(raw.slice(i, i + 2), 16)
    if (!Number.isFinite(byte)) continue
    if (byte >= 32 && byte <= 126) {
      current += String.fromCharCode(byte)
      if (current.length > best.length) best = current
    } else {
      current = ''
    }
  }
  return best.trim()
}

/** Decode Bitcoin script pushdatas (shared by coinbase scriptsig + OP_RETURN). */
function extractScriptPushes(scriptHex) {
  const hex = String(scriptHex || '').toLowerCase().replace(/[^0-9a-f]/g, '')
  const bytes = hexToBytes(hex)
  if (!bytes.length) return []

  const chunks = []
  let i = 0
  while (i < bytes.length) {
    const op = bytes[i]
    i += 1
    let len = 0
    if (op === 0x00) {
      chunks.push([])
      continue
    }
    if (op >= 1 && op <= 75) {
      len = op
    } else if (op === 0x4c && i < bytes.length) {
      len = bytes[i]
      i += 1
    } else if (op === 0x4d && i + 1 < bytes.length) {
      len = bytes[i] | (bytes[i + 1] << 8)
      i += 2
    } else if (op === 0x4e && i + 3 < bytes.length) {
      len = bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)
      i += 4
    } else {
      // Opcodes that are not pushes (OP_1..OP_16, etc.) — skip.
      continue
    }
    if (len < 0 || i + len > bytes.length) break
    chunks.push(bytes.slice(i, i + len))
    i += len
  }
  return chunks
}

function hexToBytes(hex) {
  const raw = String(hex || '').replace(/[^0-9a-fA-F]/g, '')
  if (!raw || raw.length % 2) return []
  const out = []
  for (let i = 0; i < raw.length; i += 2) {
    out.push(Number.parseInt(raw.slice(i, i + 2), 16))
  }
  return out
}

function bytesToHex(bytes) {
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('')
}

function bytesToUtf8(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(Uint8Array.from(bytes))
  } catch {
    return ''
  }
}

function longestAsciiRun(bytes) {
  let best = ''
  let current = ''
  for (const byte of bytes) {
    if (byte >= 32 && byte <= 126) {
      current += String.fromCharCode(byte)
      if (current.length > best.length) best = current
    } else {
      current = ''
    }
  }
  return best.trim()
}

function printableRatio(text) {
  const s = String(text || '')
  if (!s.length) return 0
  let printable = 0
  for (const ch of s) {
    const code = ch.charCodeAt(0)
    if (code >= 32 && code < 127) printable += 1
  }
  return printable / s.length
}

function truncateHex(hex, max = 96) {
  const value = String(hex || '')
  if (value.length <= max) return value
  return `${value.slice(0, max)}…`
}

/**
 * Extract OP_RETURN data pushes from a scriptpubkey hex.
 * Returns [] when the script is not OP_RETURN or pushes are truncated/invalid.
 */
export function extractOpReturnPayloads(scriptHex) {
  const hex = String(scriptHex || '').toLowerCase().replace(/[^0-9a-f]/g, '')
  if (!hex.startsWith('6a')) return []
  const bytes = hexToBytes(hex)
  if (bytes.length < 1 || bytes[0] !== 0x6a) return []

  // Bare OP_RETURN with no data.
  if (bytes.length === 1) return [[]]

  // Reuse push decoder on the bytes after OP_RETURN.
  return extractScriptPushes(bytesToHex(bytes.slice(1)))
}


function chooseOpReturnDisplay(payload) {
  const payloadHex = bytesToHex(payload)
  if (!payload.length) {
    return { text: '(empty)', encoding: 'label', payloadHex: '' }
  }

  const utf8 = bytesToUtf8(payload).replace(/\u0000/g, '')
  const ascii = longestAsciiRun(payload)
  const utf8Trim = utf8.trim()
  const utf8Ok = utf8Trim.length >= 2 && printableRatio(utf8Trim) >= 0.85

  if (utf8Ok) {
    return {
      text: utf8Trim,
      encoding: 'utf8',
      payloadHex,
    }
  }

  // Prefer a readable ASCII tag (e.g. RSKBLOCK:) over random binary runs.
  const looksLikeTag =
    /^[A-Za-z][A-Za-z0-9._-]{2,}:$/.test(ascii) ||
    /^[A-Za-z][A-Za-z0-9._ -]{7,}$/.test(ascii)
  const coversEnough = ascii.length >= Math.max(8, Math.ceil(payload.length * 0.4))

  if (ascii.length >= 4 && (looksLikeTag || coversEnough)) {
    const rest = payloadHex.slice(ascii.length * 2)
    const text =
      rest && looksLikeTag && !coversEnough
        ? `${ascii} · ${truncateHex(rest, 48)}`
        : ascii
    return { text, encoding: 'ascii', payloadHex }
  }

  return {
    text: truncateHex(payloadHex),
    encoding: 'hex',
    payloadHex,
  }
}

/**
 * Parse one OP_RETURN script into a displayable note payload.
 * Always returns something when the script starts with OP_RETURN (6a).
 */
export function parseOpReturnScript(scriptHex) {
  const hex = String(scriptHex || '').toLowerCase().replace(/[^0-9a-f]/g, '')
  if (!hex.startsWith('6a')) return null

  const isWitnessCommitment = hex.startsWith(WITNESS_COMMITMENT_HEX)
  if (isWitnessCommitment) {
    return {
      scriptHex: hex,
      payloadHex: hex.slice(2),
      text: 'Witness commitment',
      encoding: 'label',
      isWitnessCommitment: true,
      isProtocol: false,
    }
  }

  const chunks = extractOpReturnPayloads(hex)
  const payload = chunks.length ? chunks.flat() : []
  // If pushes could not be decoded, fall back to raw bytes after OP_RETURN
  // only when the remainder does not look like a truncated push header.
  const fallback = !chunks.length ? hexToBytes(hex).slice(1) : payload
  const display = chooseOpReturnDisplay(fallback.length ? fallback : payload)
  const protocolCandidate =
    display.encoding === 'utf8' || display.encoding === 'ascii'
      ? String(display.text || '').split(' · ')[0]
      : ''
  const protocol = protocolCandidate && isProtocolMessage(protocolCandidate)

  return {
    scriptHex: hex,
    payloadHex: display.payloadHex,
    text: display.text,
    encoding: display.encoding,
    isWitnessCommitment: false,
    isProtocol: Boolean(protocol),
  }
}

/** @deprecated use parseOpReturnScript */
export function decodeOpReturnScript(scriptHex) {
  const parsed = parseOpReturnScript(scriptHex)
  if (!parsed || parsed.isWitnessCommitment || parsed.encoding === 'hex') return null
  return parsed.text
}

async function fetchBlockTxPage(blockHash, startIndex) {
  if (startIndex <= 0) return mempoolJson(`/block/${blockHash}/txs`)
  return mempoolJson(`/block/${blockHash}/txs/${startIndex}`)
}

/**
 * Fetch every OP_RETURN in a block by walking all transactions (25/tx page).
 * Also includes a coinbase ASCII note when present.
 *
 * @param {number} height
 * @param {{ includeWitnessCommitment?: boolean, onProgress?: Function, onNotes?: Function }} [options]
 * @returns {Promise<Array<{kind, source, index, txid, text, height, vout?, encoding?, payloadHex?}>>}
 */
export async function fetchBlockOpReturns(height, { includeWitnessCommitment = false, onProgress, onNotes } = {}) {
  const h = Math.floor(Number(height))
  if (!Number.isFinite(h) || h < 0) return []

  const blockHash = await mempoolText(`/block-height/${h}`)
  if (!blockHash || !/^[0-9a-f]{64}$/i.test(blockHash)) {
    // Genesis is often needed offline — fall back to the baked Times headline.
    if (h === 0) {
      const genesis = [
        {
          kind: 'coinbase',
          source: 'original',
          index: `coinbase_${h}`,
          txid: GENESIS_COINBASE.txid,
          text: GENESIS_COINBASE.text,
          height: h,
          encoding: 'ascii',
        },
        {
          kind: 'op_return',
          source: 'original',
          index: `genesis_data_${GENESIS_COINBASE.txid}`,
          txid: GENESIS_COINBASE.txid,
          text: GENESIS_COINBASE.text,
          height: h,
          encoding: 'ascii',
        },
      ]
      if (typeof onNotes === 'function') onNotes(genesis)
      return genesis
    }
    throw new Error(`No block hash for height ${h}`)
  }

  let txCount = null
  try {
    const summary = await mempoolJson(`/block/${blockHash}`)
    txCount = Number(summary?.tx_count)
  } catch {
    /* optional */
  }

  const notes = []
  const seen = new Set()
  const maxPages = Number.isFinite(txCount) ? Math.max(1, Math.ceil(txCount / 25)) : 500

  const emit = () => {
    if (typeof onNotes === 'function') onNotes([...notes])
  }

  for (let page = 0; page < maxPages; page += 1) {
    const startIndex = page * 25
    const txs = await fetchBlockTxPage(blockHash, startIndex)
    if (!Array.isArray(txs) || txs.length === 0) break

    for (const tx of txs) {
      const txid = tx?.txid || null

      if (page === 0 && Array.isArray(tx?.vin) && tx.vin[0]?.is_coinbase) {
        const script = tx.vin[0]?.scriptsig || tx.vin[0]?.scriptSig || ''
        const text = decodeCoinbaseScriptSig(script)
        if (text) {
          const key = `coinbase:${txid}`
          if (!seen.has(key)) {
            seen.add(key)
            notes.push({
              kind: 'coinbase',
              source: 'original',
              index: `coinbase_${h}`,
              txid,
              text,
              height: h,
              encoding: 'ascii',
            })
          }
        }

        // Genesis exception: the Times headline lives in the coinbase scriptsig
        // (there are no OP_RETURN outputs on block 0). Surface each meaningful
        // data push as an OP_RETURN-style note so Original can list it.
        if (h === 0) {
          const pushes = extractScriptPushes(script)
          pushes.forEach((push, pushIndex) => {
            if (!push.length) return
            const display = chooseOpReturnDisplay(push)
            if (!display?.text || display.text === '(empty)') return
            // Skip tiny non-text pushes (version / extranonce noise).
            if (display.encoding === 'hex' && push.length < 8) return
            if (display.encoding !== 'hex' && String(display.text).length < 4) return

            const key = `genesis_data:${txid}:${pushIndex}`
            if (seen.has(key)) return
            seen.add(key)
            notes.push({
              kind: 'op_return',
              source: 'original',
              index: key,
              txid,
              text: display.text,
              height: h,
              vout: pushIndex,
              encoding: display.encoding,
              payloadHex: display.payloadHex,
              scriptHex: bytesToHex(push),
            })
          })
        }
      }

      for (const [voutIndex, out] of (tx?.vout || []).entries()) {
        const script = out?.scriptpubkey || out?.scriptPubKey || ''
        const isOpReturn =
          out?.scriptpubkey_type === 'op_return' ||
          out?.scriptPubKeyType === 'op_return' ||
          String(script).toLowerCase().startsWith('6a')
        if (!isOpReturn) continue

        const parsed = parseOpReturnScript(script)
        if (!parsed) continue
        if (parsed.isWitnessCommitment && !includeWitnessCommitment) continue

        const key = `${txid}_${voutIndex}`
        if (seen.has(key)) continue
        seen.add(key)

        const source = parsed.isProtocol ? 'protocol' : 'original'
        notes.push({
          kind: parsed.isProtocol ? 'protocol_op_return' : 'op_return',
          source,
          index: key,
          txid,
          text: parsed.text || truncateHex(parsed.payloadHex || parsed.scriptHex || ''),
          height: h,
          vout: voutIndex,
          encoding: parsed.encoding,
          payloadHex: parsed.payloadHex,
          scriptHex: parsed.scriptHex,
          isWitnessCommitment: parsed.isWitnessCommitment,
        })
      }
    }

    if (typeof onProgress === 'function') {
      onProgress({
        height: h,
        scanned: Math.min((page + 1) * 25, Number.isFinite(txCount) ? txCount : (page + 1) * 25),
        total: Number.isFinite(txCount) ? txCount : null,
        found: notes.length,
      })
    }
    emit()

    if (txs.length < 25) break
  }

  // Genesis: guarantee the Times headline even if explorers omit scriptsig ASCII.
  if (h === 0) {
    if (!notes.some((note) => note.kind === 'coinbase')) {
      notes.unshift({
        kind: 'coinbase',
        source: 'original',
        index: `coinbase_${h}`,
        txid: GENESIS_COINBASE.txid,
        text: GENESIS_COINBASE.text,
        height: h,
        encoding: 'ascii',
      })
    }
    if (!notes.some((note) => note.kind === 'op_return')) {
      notes.push({
        kind: 'op_return',
        source: 'original',
        index: `genesis_data_${GENESIS_COINBASE.txid}`,
        txid: GENESIS_COINBASE.txid,
        text: GENESIS_COINBASE.text,
        height: h,
        encoding: 'ascii',
      })
    }
    emit()
  }

  return notes
}

/**
 * Original (non-TheBlockNote) notes for a block — full tx walk.
 */
export async function fetchOriginalBlockNotes(height, options = {}) {
  const all = await fetchBlockOpReturns(height, options)
  return all.filter((note) => note.source === 'original')
}

/**
 * Coinbase message only (first page). Prefer fetchBlockOpReturns for full OP_RETURNs.
 */
export async function fetchCoinbaseMessage(height) {
  const notes = await fetchBlockOpReturns(height)
  return notes.find((note) => note.kind === 'coinbase') || null
}

/**
 * Network snapshot: hashrate, difficulty progress, fee ladder.
 */
export async function fetchNetworkSnapshot() {
  const [hashratePayload, difficulty, fees, tipHeight] = await Promise.all([
    mempoolJson('/v1/mining/hashrate/3d'),
    mempoolJson('/v1/difficulty-adjustment'),
    mempoolJson('/v1/fees/recommended'),
    mempoolJson('/blocks/tip/height'),
  ])

  const tip =
    typeof tipHeight === 'number'
      ? tipHeight
      : Number.parseInt(String(tipHeight ?? ''), 10)

  if (Number.isFinite(tip)) applyChainTip(tip)

  return {
    tip: Number.isFinite(tip) ? tip : null,
    hashrate: Number(hashratePayload?.currentHashrate) || null,
    difficulty: Number(hashratePayload?.currentDifficulty) || null,
    progressPercent: Number(difficulty?.progressPercent) || null,
    difficultyChange: Number(difficulty?.difficultyChange) || null,
    remainingBlocks: Number(difficulty?.remainingBlocks) || null,
    estimatedRetargetDate: Number(difficulty?.estimatedRetargetDate) || null,
    timeAvg: Number(difficulty?.timeAvg) || null,
    fees: {
      fastest: Number(fees?.fastestFee) || null,
      halfHour: Number(fees?.halfHourFee) || null,
      hour: Number(fees?.hourFee) || null,
      economy: Number(fees?.economyFee) || null,
      minimum: Number(fees?.minimumFee) || null,
    },
  }
}

export function formatHashrate(hps, locale = 'en-US') {
  const value = Number(hps)
  if (!Number.isFinite(value) || value <= 0) return '—'
  const units = [
    { div: 1e24, label: 'YH/s' },
    { div: 1e21, label: 'ZH/s' },
    { div: 1e18, label: 'EH/s' },
    { div: 1e15, label: 'PH/s' },
    { div: 1e12, label: 'TH/s' },
  ]
  for (const unit of units) {
    if (value >= unit.div) {
      return `${(value / unit.div).toLocaleString(locale, {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      })} ${unit.label}`
    }
  }
  return `${value.toLocaleString(locale)} H/s`
}

export function formatDifficulty(value, locale = 'en-US') {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return '—'
  if (n >= 1e12) return `${(n / 1e12).toLocaleString(locale, { maximumFractionDigits: 2 })} T`
  if (n >= 1e9) return `${(n / 1e9).toLocaleString(locale, { maximumFractionDigits: 2 })} B`
  return n.toLocaleString(locale, { maximumFractionDigits: 0 })
}

export function formatBytes(bytes, locale = 'en-US') {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toLocaleString(locale, { maximumFractionDigits: 2 })} MB`
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toLocaleString(locale, { maximumFractionDigits: 1 })} KB`
  }
  return `${n.toLocaleString(locale)} B`
}

export function formatBlockTime(timestamp) {
  if (!Number.isFinite(timestamp)) return '—'
  const date = new Date(timestamp * 1000)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')
}

export function relativeBlockAge(timestamp, nowMs = Date.now()) {
  if (!Number.isFinite(timestamp)) return null
  const seconds = Math.max(0, Math.floor(nowMs / 1000 - timestamp))
  if (seconds < 60) return { unit: 'seconds', value: seconds }
  if (seconds < 3600) return { unit: 'minutes', value: Math.floor(seconds / 60) }
  return { unit: 'hours', value: Math.floor(seconds / 3600) }
}
