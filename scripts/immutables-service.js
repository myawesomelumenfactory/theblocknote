import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs, runIndexer, runIndexerUntilTip } from '../services/ImmutableIndexer.js'
import { publishImmutables } from '../services/immutables/publishImmutables.js'

const PROTOCOL_START = 906867
const DEFAULT_PORT = 8788

function envNumber(name, fallback) {
  const parsed = Number.parseInt(process.env[name] || '', 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function json(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  })
  res.end(payload)
}

function sendFile(res, filePath, contentType) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      json(res, 404, { error: 'Not found' })
      return
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    })
    res.end(data)
  })
}

const status = {
  running: true,
  once: false,
  lastHeight: null,
  tip: null,
  count: 0,
  caughtUp: false,
  cid: null,
  ipfsUrl: null,
  updatedAt: null,
  error: null,
}

async function indexPass(options) {
  const result = options.to != null
    ? await runIndexer(options)
    : await runIndexerUntilTip(options)
  status.lastHeight = result.lastHeight ?? status.lastHeight
  status.tip = result.tip ?? status.tip
  status.count = result.count ?? status.count
  status.caughtUp = Boolean(result.caughtUp)
  status.updatedAt = new Date().toISOString()
  status.error = null

  try {
    const published = await publishImmutables(options.out)
    if (!published.skipped) {
      status.cid = published.cid
      status.ipfsUrl = published.url
      console.log(`Published to IPFS (${published.provider}): ${published.cid}`)
    }
  } catch (error) {
    console.warn(`IPFS publish skipped: ${error.message}`)
  }

  return result
}

function startHttpServer(port, host) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

    if (req.method === 'GET' && url.pathname === '/health') {
      json(res, 200, { ok: true, running: status.running })
      return
    }
    if (req.method === 'GET' && url.pathname === '/status') {
      json(res, 200, status)
      return
    }
    if (req.method === 'GET' && url.pathname === '/data/immutables.json') {
      sendFile(res, path.resolve('data/immutables.json'), 'application/json; charset=utf-8')
      return
    }
    if (req.method === 'GET' && url.pathname === '/data/immutables-state.json') {
      sendFile(res, path.resolve('data/immutables-state.json'), 'application/json; charset=utf-8')
      return
    }

    json(res, 404, {
      error: 'Not found',
      routes: ['/health', '/status', '/data/immutables.json', '/data/immutables-state.json'],
    })
  })

  server.listen(port, host, () => {
    console.log(`Immutables service listening on http://${host}:${port}`)
  })
  return server
}

const cli = parseArgs()
if (cli.help) {
  console.log(`Fetch every The Block Note message through Blockstream and write immutables.json.

Usage:
  npm run immutables:service -- [options]

This process:
  1. Resumes from the local checkpoint
  2. Walks Blockstream blocks until chain tip
  3. Writes data/immutables.json (and the public copy)
  4. Stays running and polls for new blocks
  5. Publishes to IPFS when IPFS_API or PINATA_JWT is set

Options:
  --once              Index to tip once, then exit
  --from <height>     Start block (default: ${PROTOCOL_START})
  --overlap <n>       Re-scan last n blocks each pass (default: 8)
  --concurrency <n>   Parallel blocks (default: 8)
  --max-blocks <n>    Blocks per pass (default: 2500)

Env:
  BLOCKSTREAM_CLIENT_ID / BLOCKSTREAM_CLIENT_SECRET
  IMMUTABLES_POLL_MS       Poll interval after catch-up (default: 60000)
  IMMUTABLES_HTTP_PORT     Status server port (default: ${DEFAULT_PORT}, 0 to disable)
  IMMUTABLES_HTTP_HOST     Bind address (default: 127.0.0.1)
  IPFS_API                 Kubo API, e.g. http://127.0.0.1:5001
  PINATA_JWT               Pinata JWT if you prefer a pinning service
`)
  process.exit(0)
}

const once = process.argv.includes('--once')
const passedConcurrency = process.argv.includes('--concurrency')
const passedDelay = process.argv.includes('--delay')
const options = {
  ...cli,
  from: Number.isFinite(cli.from) ? cli.from : PROTOCOL_START,
  overlap: cli.overlap || 8,
  concurrency: passedConcurrency ? cli.concurrency : 2,
  delay: passedDelay ? cli.delay : 200,
  maxBlocks: cli.maxBlocks || envNumber('IMMUTABLES_MAX_BLOCKS', 2500),
  untilTip: cli.to == null,
  resume: true,
  protocolOnly: true,
  blockstreamOnly: true,
  out: cli.out || path.resolve('data/immutables.json'),
}

status.once = once
const pollMs = envNumber('IMMUTABLES_POLL_MS', 60_000)
const port = envNumber('IMMUTABLES_HTTP_PORT', DEFAULT_PORT)
const host = process.env.IMMUTABLES_HTTP_HOST || '127.0.0.1'
const server = port > 0 ? startHttpServer(port, host) : null

let stopping = false
const stop = () => {
  if (stopping) return
  stopping = true
  status.running = false
  console.log('Stopping immutables service…')
  if (server) server.close()
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)

console.log(
  `Immutables service starting (${options.blockstreamOnly ? 'Blockstream only' : 'multi-explorer'}, overlap ${options.overlap}, concurrency ${options.concurrency})`
)

try {
  do {
    try {
      const result = await indexPass(options)
      if (once || stopping) break
      if (result.caughtUp) {
        console.log(`Caught up at block ${result.lastHeight}. Next poll in ${pollMs}ms`)
      }
    } catch (error) {
      status.error = error.message
      console.error(error.message)
      if (once) throw error
      console.log(`Indexer error; retrying in ${pollMs}ms`)
    }
    if (once || stopping) break
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, pollMs)
      const onStop = () => {
        clearTimeout(timer)
        resolve()
      }
      process.once('SIGINT', onStop)
      process.once('SIGTERM', onStop)
    })
  } while (!stopping && !once)
} catch (error) {
  status.error = error.message
  console.error(error.message)
  process.exitCode = 1
} finally {
  stop()
}
