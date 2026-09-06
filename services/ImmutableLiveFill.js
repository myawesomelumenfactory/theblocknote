import { recordsFromEsploraTxs } from './immutableProtocol.js'

const MEMPOOL = 'https://mempool.space/api'
const EXPLORERS = [MEMPOOL, 'https://blockstream.info/api']

async function fetchText(url) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(12_000) })
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return (await response.text()).trim()
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(12_000) })
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return response.json()
}

async function recordsFromHeight(height) {
  let lastError

  for (const base of EXPLORERS) {
    try {
      const hash = await fetchText(`${base}/block-height/${height}`)
      if (!hash) throw new Error(`No block hash at ${height}`)
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
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error(`Failed to read block ${height}`)
}

export async function mempoolTipHeight() {
  for (const base of EXPLORERS) {
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
  }

  return { extra, tip, lastHeight: scannedTo }
}
