import fs from 'node:fs'
import path from 'node:path'

const APPEND_PATH = '/__immutables/append'
const FILES = [
  path.resolve('data/immutables.json'),
  path.resolve('public/data/immutables.json'),
]

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function readRecords(file) {
  if (!fs.existsSync(file)) return []
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  return Array.isArray(parsed) ? parsed : []
}

function appendRecord(entry) {
  for (const file of FILES) {
    const dir = path.dirname(file)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const records = readRecords(file)
    if (records.some((row) => row?.index === entry.index)) continue
    records.push(entry)
    fs.writeFileSync(file, `${JSON.stringify(records, null, 2)}\n`)
  }
}

export function immutablesAppend() {
  return {
    name: 'immutables-append',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'POST' || req.url?.split('?')[0] !== APPEND_PATH) return next()
        try {
          const entry = JSON.parse(await readBody(req) || '{}')
          if (!entry.index || !entry.value) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'index and value are required' }))
            return
          }
          appendRecord({
            index: String(entry.index),
            time: Number(entry.time) || Math.floor(Date.now() / 1000),
            value: String(entry.value),
          })
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true }))
        } catch (error) {
          console.warn('Failed to append immutables.json:', error.message)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: error.message }))
        }
      })
    },
  }
}
