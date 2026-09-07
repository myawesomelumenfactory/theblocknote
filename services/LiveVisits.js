import { LIVE_KIND_COUNT } from '../src/i18n/translations'

const VISIT_KEY = 'theblocknoteLiveVisitId'

function presenceBases() {
  const bases = []
  const configured = import.meta.env.VITE_PRESENCE_URL
  if (configured) bases.push(String(configured).replace(/\/$/, ''))
  if (typeof location !== 'undefined' && location.protocol !== 'file:') {
    bases.push('')
  }
  bases.push('http://127.0.0.1:8788')
  return [...new Set(bases)]
}

export function visitId() {
  try {
    const existing = sessionStorage.getItem(VISIT_KEY)
    if (existing) return existing
    const id = crypto.randomUUID()
    sessionStorage.setItem(VISIT_KEY, id)
    return id
  } catch {
    return `anon-${Math.random().toString(36).slice(2)}`
  }
}

export function randomKindIndex(count = LIVE_KIND_COUNT) {
  const total = Math.max(1, count)
  return Math.floor(Math.random() * total)
}

export function randomKind() {
  return randomKindIndex()
}

export async function sendHeartbeat() {
  const body = JSON.stringify({ id: visitId() })
  for (const base of presenceBases()) {
    try {
      const response = await fetch(`${base}/__presence/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        cache: 'no-store',
      })
      if (!response.ok) continue
      const data = await response.json()
      if (Number.isFinite(data?.count)) return data.count
    } catch {
      // Try the next presence host.
    }
  }
  return null
}

export function subscribeLiveCount(onCount) {
  const bases = presenceBases()
  let source = null
  let index = 0
  let stopped = false

  const connect = () => {
    if (stopped || index >= bases.length) return
    const base = bases[index]
    index += 1
    try {
      source = new EventSource(`${base}/__presence/stream`)
    } catch {
      connect()
      return
    }
    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (Number.isFinite(data?.count)) onCount(data.count)
      } catch {
        // Ignore a bad frame.
      }
    }
    source.onerror = () => {
      source.close()
      source = null
      connect()
    }
  }

  connect()

  return () => {
    stopped = true
    source?.close()
  }
}
