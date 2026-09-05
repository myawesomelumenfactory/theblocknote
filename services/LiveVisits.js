const VISIT_KEY = 'theblocknoteLiveVisitId'

const KINDS = [
  'a human',
  'a connected device',
  'a robot',
  'a smart cat',
  'a smart dog',
  'a squirrel',
  'a toaster with opinions',
  'a passing comet',
  'a very small satellite',
  'an unsigned wallet',
  'a curious raccoon',
  'a midnight owl',
  'a polite crawler',
  'a whispering modem',
  'a neighborhood fox',
  'a lightning bug',
  'an honest node',
  'a time-traveling pigeon',
  'a garden gnome',
  'a block of cheese',
]

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

export function randomKind() {
  return KINDS[Math.floor(Math.random() * KINDS.length)]
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
