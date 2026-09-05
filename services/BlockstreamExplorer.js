const ENTERPRISE_PROXY = '/blockstream-api'
const BLOCKSTREAM_PUBLIC = 'https://blockstream.info/api'
const MEMPOOL_PUBLIC = 'https://mempool.space/api'

function isStaticOrigin() {
  if (typeof location === 'undefined') return true
  return location.protocol === 'file:' || location.protocol === 'ipfs:' || location.protocol === 'ipns:'
}

function explorerBases() {
  const bases = [MEMPOOL_PUBLIC, BLOCKSTREAM_PUBLIC]
  if (!isStaticOrigin()) bases.push(ENTERPRISE_PROXY)
  return bases
}

export async function explorerFetch(path) {
  for (const base of explorerBases()) {
    try {
      const response = await fetch(`${base}${path}`)
      if (!response.ok) continue
      const raw = await response.text()
      if (!raw) continue
      try {
        const data = JSON.parse(raw)
        if (data?.error) continue
        return { data, text: raw }
      } catch {
        return { data: null, text: raw }
      }
    } catch {
      // Try the next public explorer.
    }
  }
  return null
}

export async function explorerJson(path) {
  const result = await explorerFetch(path)
  return result?.data ?? null
}

export async function explorerText(path) {
  const result = await explorerFetch(path)
  if (result?.text != null) return result.text
  if (typeof result?.data === 'string') return result.data
  return null
}

export async function explorerTipHeight() {
  const result = await explorerFetch('/blocks/tip/height')
  if (typeof result?.data === 'number') return result.data
  const parsed = Number.parseInt(result?.text, 10)
  return Number.isFinite(parsed) ? parsed : 0
}
