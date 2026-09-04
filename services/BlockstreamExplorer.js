const ENTERPRISE_PROXY = '/blockstream-api'
const BLOCKSTREAM_PUBLIC = 'https://blockstream.info/api'
const MEMPOOL_PUBLIC = 'https://mempool.space/api'

let proxyAvailable = null

function isStaticOrigin() {
  if (typeof location === 'undefined') return true
  return location.protocol === 'file:' || location.protocol === 'ipfs:' || location.protocol === 'ipns:'
}

async function hasEnterpriseProxy() {
  if (proxyAvailable != null) return proxyAvailable
  if (isStaticOrigin()) {
    proxyAvailable = false
    return false
  }

  try {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 1500)
    const response = await fetch(`${ENTERPRISE_PROXY}/blocks/tip/height`, { signal: controller.signal })
    window.clearTimeout(timer)
    const text = (await response.text()).trim()
    proxyAvailable = response.ok && /^\d+$/.test(text)
  } catch {
    proxyAvailable = false
  }
  return proxyAvailable
}

async function explorerBases() {
  const bases = []
  if (await hasEnterpriseProxy()) bases.push(ENTERPRISE_PROXY)
  bases.push(BLOCKSTREAM_PUBLIC, MEMPOOL_PUBLIC)
  return bases
}

export async function explorerFetch(path) {
  for (const base of await explorerBases()) {
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
