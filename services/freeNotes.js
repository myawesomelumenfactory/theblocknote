import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { SimplePool } from 'nostr-tools/pool'
import { npubEncode } from 'nostr-tools/nip19'
import {
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  hexToBytes,
  stampDigest,
  upgradeProof,
  verifyProof,
} from './opentimestamps'

/**
 * Free, server-less notes:
 * - the note is a Nostr event signed by a key generated in this browser,
 * - public relays act as the queue and storage,
 * - the event id (a SHA-256) is stamped by OpenTimestamps calendars, which
 *   batch everyone's stamps into one Bitcoin transaction every few hours,
 * - once anchored, the proof is published as a NIP-03 event (kind 1040)
 *   so any visitor can verify it against Bitcoin.
 */

export const FREE_NOTE_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://nostr.mom',
  'wss://offchain.pub',
]
export const FREE_NOTE_TAG = 'theblocknote'
export const FREE_NOTE_MAX = 280

const KIND_NOTE = 1
const KIND_OTS = 1040

const KEY_STORAGE = 'theblocknote:free-notes:key'
const PROOFS_STORAGE = 'theblocknote:free-notes:proofs'
const PUBLISHED_STORAGE = 'theblocknote:free-notes:published'
const VERIFIED_STORAGE = 'theblocknote:free-notes:verified'

let pool = null
function getPool() {
  if (!pool) pool = new SimplePool()
  return pool
}

function readJson(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

export function getFreeNoteIdentity() {
  let skHex = localStorage.getItem(KEY_STORAGE)
  if (!skHex || !/^[0-9a-f]{64}$/.test(skHex)) {
    skHex = bytesToHex(generateSecretKey())
    localStorage.setItem(KEY_STORAGE, skHex)
  }
  const sk = hexToBytes(skHex)
  const pubkey = getPublicKey(sk)
  return { sk, pubkey, npub: npubEncode(pubkey) }
}

export function readLocalProof(eventId) {
  const b64 = readJson(PROOFS_STORAGE)[eventId]
  return b64 ? base64ToBytes(b64) : null
}

function saveLocalProof(eventId, proof) {
  const proofs = readJson(PROOFS_STORAGE)
  proofs[eventId] = bytesToBase64(proof)
  writeJson(PROOFS_STORAGE, proofs)
}

function readVerified() {
  return readJson(VERIFIED_STORAGE)
}

function saveVerified(eventId, result) {
  const verified = readVerified()
  verified[eventId] = result
  writeJson(VERIFIED_STORAGE, verified)
}

async function publishEverywhere(event) {
  const results = await Promise.allSettled(getPool().publish(FREE_NOTE_RELAYS, event))
  const accepted = results.filter((r) => r.status === 'fulfilled').length
  if (accepted === 0) throw new Error('No relay accepted the note')
  return accepted
}

/**
 * Sign, publish, and stamp a note.
 * @param {string} text
 * @param {(step: 'publishing' | 'stamping') => void} [onStep]
 */
export async function postFreeNote(text, onStep) {
  const content = String(text || '').trim()
  if (!content) throw new Error('Write something first')
  if (content.length > FREE_NOTE_MAX) throw new Error(`Notes are limited to ${FREE_NOTE_MAX} characters`)

  const { sk } = getFreeNoteIdentity()
  const event = finalizeEvent(
    {
      kind: KIND_NOTE,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['t', FREE_NOTE_TAG]],
      content,
    },
    sk
  )

  onStep?.('publishing')
  const relays = await publishEverywhere(event)

  onStep?.('stamping')
  const proof = await stampDigest(hexToBytes(event.id))
  saveLocalProof(event.id, proof)

  return { event, relays }
}

export async function fetchFreeNotes(limit = 60) {
  const events = await getPool().querySync(
    FREE_NOTE_RELAYS,
    { kinds: [KIND_NOTE], '#t': [FREE_NOTE_TAG], limit },
    { maxWait: 4000 }
  )
  const byId = new Map(events.map((e) => [e.id, e]))
  return [...byId.values()].sort((a, b) => b.created_at - a.created_at)
}

/** NIP-03 proofs published by anyone for these note ids. */
async function fetchPublishedProofs(eventIds) {
  if (eventIds.length === 0) return new Map()
  const events = await getPool().querySync(
    FREE_NOTE_RELAYS,
    { kinds: [KIND_OTS], '#e': eventIds },
    { maxWait: 4000 }
  )
  const byNote = new Map()
  for (const e of events) {
    const target = e.tags.find((t) => t[0] === 'e')?.[1]
    if (!target || !e.content) continue
    try {
      const list = byNote.get(target) || []
      list.push(base64ToBytes(e.content))
      byNote.set(target, list)
    } catch {
      // Not base64; ignore.
    }
  }
  return byNote
}

async function publishProof(eventId, proof) {
  const { sk } = getFreeNoteIdentity()
  const event = finalizeEvent(
    {
      kind: KIND_OTS,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['e', eventId, FREE_NOTE_RELAYS[0]],
        ['k', String(KIND_NOTE)],
        ['alt', 'OpenTimestamps attestation for a The Block Note free note'],
      ],
      content: bytesToBase64(proof),
    },
    sk
  )
  await publishEverywhere(event)
  const published = readJson(PUBLISHED_STORAGE)
  published[eventId] = event.id
  writeJson(PUBLISHED_STORAGE, published)
}

/**
 * Upgrade this browser's pending proofs; publish the ones Bitcoin has confirmed.
 * @returns {Promise<number>} how many proofs were newly anchored
 */
export async function upgradeLocalProofs() {
  const proofs = readJson(PROOFS_STORAGE)
  const published = readJson(PUBLISHED_STORAGE)
  let anchored = 0

  for (const [eventId, b64] of Object.entries(proofs)) {
    if (published[eventId]) continue
    try {
      const { proof, changed } = await upgradeProof(base64ToBytes(b64))
      if (changed) saveLocalProof(eventId, proof)
      const result = await verifyProof(proof, eventId)
      if (result.status === 'anchored') {
        saveVerified(eventId, result)
        await publishProof(eventId, proof)
        anchored += 1
      }
    } catch (error) {
      console.warn('Free note proof upgrade failed:', eventId, error.message)
    }
  }
  return anchored
}

/**
 * Anchor status for each note: 'anchored' | 'pending' | 'unverified' | 'invalid' | 'none'.
 * @returns {Promise<Map<string, { status: string, height?: number, time?: number, blockHash?: string, proof?: Uint8Array }>>}
 */
export async function resolveAnchorStatuses(notes) {
  const ids = notes.map((n) => n.id)
  const verified = readVerified()
  const published = await fetchPublishedProofs(ids.filter((id) => !verified[id]))
  const statuses = new Map()

  for (const id of ids) {
    const local = readLocalProof(id)
    if (verified[id]) {
      statuses.set(id, { ...verified[id], proof: local || published.get(id)?.[0] })
      continue
    }

    const candidates = [...(published.get(id) || []), ...(local ? [local] : [])]
    if (candidates.length === 0) {
      statuses.set(id, { status: 'none' })
      continue
    }

    let best = { status: 'invalid' }
    for (const proof of candidates) {
      try {
        const result = await verifyProof(proof, id)
        if (result.status === 'anchored') {
          saveVerified(id, result)
          best = { ...result, proof }
          break
        }
        if (result.status === 'pending' || (result.status === 'unverified' && best.status !== 'pending')) {
          best = { ...result, proof }
        }
      } catch {
        // Malformed proof; keep looking.
      }
    }
    statuses.set(id, best)
  }

  return statuses
}
