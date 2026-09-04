import { explorerJson, explorerText, explorerTipHeight } from './BlockstreamExplorer.js'
import { recordsFromEsploraTxs } from './immutableProtocol.js'

export const LIVE_FILL_MAX_BLOCKS = 8

let liveFillCache = { key: '', extra: [] }

async function recordsFromHeight(height) {
  const hash = String((await explorerText(`/block-height/${height}`)) || '').trim()
  if (!hash) return []
  const header = await explorerJson(`/block/${hash}`)
  const blockTime = header?.timestamp
  const txCount = header?.tx_count || 0
  const pageSize = 25
  let records = []

  for (let start = 0; start < txCount; start += pageSize) {
    const pathSuffix = start === 0 ? '' : `/${start}`
    const txs = await explorerJson(`/block/${hash}/txs${pathSuffix}`)
    records = records.concat(recordsFromEsploraTxs(txs, blockTime, true))
  }

  return records
}

export async function fillRecentImmutables(lastHeight) {
  if (!Number.isFinite(lastHeight)) return []
  const tip = await explorerTipHeight()
  if (!tip || tip <= lastHeight) return []
  if (tip - lastHeight > LIVE_FILL_MAX_BLOCKS) return []

  const key = `${lastHeight}:${tip}`
  if (liveFillCache.key === key) return liveFillCache.extra

  const extra = []
  for (let height = lastHeight + 1; height <= tip; height++) {
    extra.push(...(await recordsFromHeight(height)))
  }
  liveFillCache = { key, extra }
  return extra
}
