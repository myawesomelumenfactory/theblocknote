import * as bitcoin from 'bitcoinjs-lib'
import { decodeOpReturn } from './TheBlockNote.js'
import { isProtocolMessage, recordsFromEsploraTxs } from './immutableProtocol.js'

const Block = bitcoin.Block || bitcoin.default?.Block
const HASKOIN = 'https://api.blockchain.info/haskoin-store/btc'
const MEMPOOL = 'https://mempool.space/api'
const BLOCKSTREAM = 'https://blockstream.info/api'
const ESPLORA = [MEMPOOL, BLOCKSTREAM]

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchText(url, ms = 8_000) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(ms) })
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return (await response.text()).trim()
}

async function fetchJson(url, ms = 12_000) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(ms) })
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return response.json()
}

async function fetchBuffer(url, ms = 25_000) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(ms) })
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return new Uint8Array(await response.arrayBuffer())
}

function recordsFromBitcoinBlock(block) {
  const records = []
  const time = block.timestamp

  for (const tx of block.transactions || []) {
    const txid = tx.getId()
    for (const [index, out] of (tx.outs || []).entries()) {
      const script = out.script
      if (!script || script[0] !== 0x6a) continue
      const value = decodeOpReturn(Buffer.from(script).toString('hex'))
      if (!value || !isProtocolMessage(value)) continue
      records.push({
        index: `${txid}_${index}`,
        time,
        value,
      })
    }
  }

  return records
}

function parseRawBlock(bytes) {
  if (!Block?.fromBuffer) throw new Error('bitcoinjs Block.fromBuffer is unavailable')
  const block = Block.fromBuffer(Buffer.from(bytes))
  if (!block.transactions?.length) throw new Error('Empty raw block')
  return recordsFromBitcoinBlock(block)
}

async function recordsFromHaskoin(height) {
  const load = async () => {
    const payload = await fetchJson(`${HASKOIN}/block/height/${height}?notx=true`, 8_000)
    const header = Array.isArray(payload)
      ? payload.find((row) => row?.mainchain && row.height === height) || payload[0]
      : payload
    const hash = header?.hash
    if (!hash) throw new Error(`No haskoin hash at ${height}`)
    const raw = await fetchJson(`${HASKOIN}/block/${hash}/raw`, 25_000)
    const hex = typeof raw === 'string' ? raw : raw?.result
    if (!hex || typeof hex !== 'string') throw new Error(`Empty haskoin raw at ${height}`)
    return parseRawBlock(Buffer.from(hex, 'hex'))
  }

  try {
    return await load()
  } catch (error) {
    if (!String(error.message).startsWith('429')) throw error
    await sleep(800)
    return load()
  }
}

async function recordsFromEsploraRaw(base, hash) {
  const raw = await fetchBuffer(`${base}/block/${hash}/raw`)
  return parseRawBlock(raw)
}

async function recordsFromTxPages(base, hash) {
  const header = await fetchJson(`${base}/block/${hash}`)
  const blockTime = header?.timestamp
  const txCount = header?.tx_count || 0
  const pageSize = 25
  let records = []

  for (let start = 0; start < txCount; start += pageSize) {
    const pathSuffix = start === 0 ? '' : `/${start}`
    const txs = await fetchJson(`${base}/block/${hash}/txs${pathSuffix}`)
    records = records.concat(recordsFromEsploraTxs(txs, blockTime, true))
  }

  return records
}

async function esploraHash(height) {
  let lastError
  for (const base of ESPLORA) {
    try {
      const hash = await fetchText(`${base}/block-height/${height}`)
      if (hash && /^[0-9a-f]{64}$/i.test(hash)) return hash
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error(`No esplora hash at ${height}`)
}

async function recordsFromHeight(height) {
  let lastError

  try {
    return await recordsFromHaskoin(height)
  } catch (error) {
    lastError = error
  }

  let hash
  try {
    hash = await esploraHash(height)
  } catch (error) {
    throw lastError || error
  }

  for (const base of ESPLORA) {
    try {
      return await recordsFromEsploraRaw(base, hash)
    } catch (error) {
      lastError = error
    }
  }

  for (const base of ESPLORA) {
    try {
      return await recordsFromTxPages(base, hash)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error(`Failed to read block ${height}`)
}

export async function mempoolTipHeight() {
  try {
    const best = await fetchJson(`${HASKOIN}/block/best?notx=true`, 8_000)
    const tip = Number(best?.height)
    if (Number.isFinite(tip) && tip > 0) return tip
  } catch {
    // Fall through to public esplora.
  }

  for (const base of ESPLORA) {
    try {
      const tip = Number.parseInt(await fetchText(`${base}/blocks/tip/height`), 10)
      if (Number.isFinite(tip) && tip > 0) return tip
    } catch {
      // Try the next explorer.
    }
  }
  return 0
}

export async function catchUpImmutables(lastHeight, { onBlock } = {}) {
  const tip = await mempoolTipHeight()
  if (!Number.isFinite(lastHeight) || !tip || tip <= lastHeight) {
    return { extra: [], tip, lastHeight: Number.isFinite(lastHeight) ? lastHeight : null }
  }

  const extra = []
  let scannedTo = lastHeight
  for (let height = lastHeight + 1; height <= tip; height++) {
    const added = await recordsFromHeight(height)
    extra.push(...added)
    scannedTo = height
    await onBlock?.({ height, tip, added })
    if (height < tip) await sleep(150)
  }

  return { extra, tip, lastHeight: scannedTo }
}
