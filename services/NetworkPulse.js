import { explorerJson } from './BlockstreamExplorer.js'
import { applyChainTip } from './ChainTipStore.js'

const MEMPOOL = 'https://mempool.space/api'

async function mempoolJson(path) {
  try {
    const response = await fetch(`${MEMPOOL}${path}`, { cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } catch {
    // Fall back to shared explorer helper (mempool first in the list).
    return explorerJson(path)
  }
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
