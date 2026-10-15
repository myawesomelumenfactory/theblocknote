import fs from 'node:fs/promises'
import path from 'node:path'
import WebSocket from 'ws'
import { verifyEvent } from 'nostr-tools/pure'
import { SimplePool, useWebSocketImplementation } from 'nostr-tools/pool'
import {
  DECLARATION_TAG,
  KIND_COMMENT,
  KIND_EVENT_REACTION,
  KIND_EXTERNAL_REACTION,
  MAP_VOTE_TAG,
  REPLY_TAG,
  VOTE_TAG,
  textToBytes,
  validateDeclarationEvent,
  validateMapVoteEvent,
  validateReplyEvent,
  validateVoteEvent,
} from '../services/declarationCore.js'
import { base64ToBytes, bytesToBase64, describeProof, upgradeProof, verifyProof } from '../services/opentimestamps.js'

const RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://nostr.mom',
  'wss://offchain.pub',
]
const COLLECTIONS = [
  { label: 'Declarations', file: 'declarations.json', tag: DECLARATION_TAG, validate: validateDeclarationEvent },
  { label: 'Map votes', file: 'map-votes.json', tag: MAP_VOTE_TAG, validate: validateMapVoteEvent },
  { label: 'Replies', file: 'replies.json', tag: REPLY_TAG, validate: validateReplyEvent, kinds: [1, KIND_COMMENT] },
  {
    label: 'Votes',
    file: 'votes.json',
    tag: VOTE_TAG,
    validate: validateVoteEvent,
    kinds: [KIND_EVENT_REACTION, KIND_EXTERNAL_REACTION],
  },
]

function archivePaths(collection) {
  return [path.resolve('data', collection.file), path.resolve('public/data', collection.file)]
}

function readEnv(name) {
  const value = process.env[name]
  return value && value.trim() ? value.trim() : ''
}

async function readArchive(collection) {
  try {
    const rows = JSON.parse(await fs.readFile(archivePaths(collection)[0], 'utf8'))
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

async function writeArchive(collection, rows) {
  const sorted = [...rows].sort((a, b) => b.created_at - a.created_at)
  const payload = `${JSON.stringify(sorted, null, 2)}\n`
  for (const file of archivePaths(collection)) {
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, payload)
  }
}

/** Pin raw bytes so the resulting CID is the raw sha2-256 CID the browser computed. */
async function pinText(text, cid) {
  const bytes = textToBytes(text)
  const api = readEnv('IPFS_API').replace(/\/$/, '')
  if (api) {
    const body = new FormData()
    body.append('file', new Blob([bytes]), `${cid}.txt`)
    const res = await fetch(`${api}/api/v0/add?cid-version=1&raw-leaves=true&pin=true`, { method: 'POST', body })
    const data = JSON.parse(await res.text())
    if (!res.ok) throw new Error(data.Message || `Kubo add failed (${res.status})`)
    if (data.Hash !== cid) throw new Error(`Kubo returned ${data.Hash}, expected ${cid}`)
    return 'kubo'
  }
  const jwt = readEnv('PINATA_JWT')
  if (jwt) {
    const body = new FormData()
    body.append('file', new Blob([bytes]), `${cid}.txt`)
    body.append('pinataOptions', JSON.stringify({ cidVersion: 1 }))
    body.append('pinataMetadata', JSON.stringify({ name: `theblocknote-declaration-${cid}` }))
    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
      body,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error?.details || data.error || `Pinata failed (${res.status})`)
    if (data.IpfsHash !== cid) throw new Error(`Pinata returned ${data.IpfsHash}, expected ${cid}`)
    return 'pinata'
  }
  return null
}

async function completeProof(row) {
  const { proof, changed } = await upgradeProof(base64ToBytes(row.ots))
  if (changed) row.ots = bytesToBase64(proof)
  const result = await verifyProof(proof, row.digest)
  if (result.status !== 'anchored') return false
  const { bitcoinAnchors } = await describeProof(proof)
  row.anchor = {
    height: result.height,
    time: result.time,
    blockHash: result.blockHash,
    txid: bitcoinAnchors.find((a) => a.height === result.height)?.txid || null,
  }
  return true
}

async function syncOnce(pool, collection) {
  const archive = await readArchive(collection)
  const byId = new Map(archive.map((row) => [row.eventId, row]))

  const events = await pool.querySync(
    RELAYS,
    { kinds: collection.kinds || [1], '#t': [collection.tag], limit: 2000 },
    { maxWait: 6000 },
  )
  const texts = new Map()
  let added = 0
  for (const event of events) {
    if (texts.has(event.id) || !event.content || !verifyEvent(event)) continue
    const valid = await collection.validate(event)
    if (!valid || !valid.ots) continue
    texts.set(event.id, valid.text ?? event.content)
    if (!byId.has(event.id)) {
      byId.set(event.id, {
        eventId: event.id,
        pubkey: event.pubkey,
        created_at: event.created_at,
        ...(valid.code ? { code: valid.code } : {}),
        ...(valid.root ? { root: valid.root } : {}),
        ...(valid.target ? { target: valid.target, direction: valid.direction } : {}),
        cid: valid.cid,
        digest: valid.digestHex,
        ots: valid.ots,
        anchor: null,
        pinned: null,
      })
      added += 1
    }
  }

  let pinned = 0
  let anchored = 0
  for (const row of byId.values()) {
    if (!row.pinned && texts.has(row.eventId)) {
      try {
        row.pinned = await pinText(texts.get(row.eventId), row.cid)
        if (row.pinned) pinned += 1
      } catch (error) {
        console.warn(`Pin failed for ${row.cid}: ${error.message}`)
      }
    }
    if (!row.anchor) {
      try {
        if (await completeProof(row)) anchored += 1
      } catch (error) {
        console.warn(`Proof upgrade failed for ${row.digest}: ${error.message}`)
      }
    }
  }

  await writeArchive(collection, [...byId.values()])
  const unpinned = [...byId.values()].filter((r) => !r.pinned).length
  console.log(
    `${collection.label}: ${byId.size} total, ${added} new, ${pinned} pinned, ${anchored} newly anchored, ${unpinned} not pinned yet`,
  )
  return unpinned
}

if (process.argv.includes('--help')) {
  console.log(`Collect The Block Note declarations, anchored replies, free votes and free map
votes from Nostr, pin their text on IPFS, complete their OpenTimestamps proofs, and
write data/declarations.json, data/replies.json, data/votes.json and data/map-votes.json.

Usage:
  npm run declarations:pin              # one pass
  npm run declarations:pin -- --watch   # keep running

Env:
  IPFS_API                Kubo API, e.g. http://127.0.0.1:5001 (IPFS Desktop)
  PINATA_JWT              Pinata JWT if you prefer a pinning service
  DECLARATIONS_POLL_MS    Interval for --watch (default: 600000)`)
  process.exit(0)
}

// Node's built-in WebSocket recurses when nostr-tools closes a relay that failed to connect.
useWebSocketImplementation(WebSocket)
const pool = new SimplePool()
const watch = process.argv.includes('--watch')
const pollMs = Number.parseInt(process.env.DECLARATIONS_POLL_MS || '', 10) || 600_000

do {
  let unpinned = 0
  for (const collection of COLLECTIONS) {
    try {
      unpinned += await syncOnce(pool, collection)
    } catch (error) {
      console.error(`${collection.label}: ${error.message}`)
      if (!watch) process.exitCode = 1
    }
  }
  if (unpinned > 0 && !readEnv('IPFS_API') && !readEnv('PINATA_JWT')) {
    console.log('Set IPFS_API (e.g. http://127.0.0.1:5001) or PINATA_JWT to pin texts on IPFS.')
  }
  if (watch) await new Promise((resolve) => setTimeout(resolve, pollMs))
} while (watch)

pool.close(RELAYS)
process.exit(process.exitCode || 0)
