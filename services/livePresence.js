const TTL_MS = 12_000

const visits = new Map()
const streams = new Set()

function prune(now = Date.now()) {
  for (const [id, seen] of visits) {
    if (now - seen > TTL_MS) visits.delete(id)
  }
}

function snapshot() {
  prune()
  return {
    count: visits.size,
    updatedAt: new Date().toISOString(),
  }
}

function emit() {
  const payload = `data: ${JSON.stringify(snapshot())}\n\n`
  for (const res of streams) {
    try {
      res.write(payload)
    } catch {
      streams.delete(res)
    }
  }
}

export function beat(id) {
  const token = String(id || '').trim()
  if (!token) return snapshot()
  visits.set(token, Date.now())
  prune()
  emit()
  return snapshot()
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
}

export async function handleLivePresence(req, res) {
  const path = String(req.url || '').split('?')[0]
  if (!path.startsWith('/__presence')) return false

  cors(res)

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return true
  }

  if (req.method === 'POST' && path === '/__presence/heartbeat') {
    try {
      const body = JSON.parse((await readBody(req)) || '{}')
      const data = beat(body.id)
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(data))
    } catch (error) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: error.message }))
    }
    return true
  }

  if (req.method === 'GET' && path === '/__presence') {
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(snapshot()))
    return true
  }

  if (req.method === 'GET' && path === '/__presence/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    })
    res.write(`data: ${JSON.stringify(snapshot())}\n\n`)
    streams.add(res)
    req.on('close', () => streams.delete(res))
    return true
  }

  return false
}

setInterval(() => {
  const before = visits.size
  prune()
  if (visits.size !== before) emit()
}, 2000).unref?.()
