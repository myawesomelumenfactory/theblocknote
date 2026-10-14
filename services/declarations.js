import { finalizeEvent, verifyEvent } from 'nostr-tools/pure'
import { SimplePool } from 'nostr-tools/pool'
import { npubEncode } from 'nostr-tools/nip19'
import {
  base64ToBytes,
  bytesToBase64,
  describeProof,
  stampDigest,
  upgradeProof,
  verifyProof,
} from './opentimestamps'
import {
  DECLARATION_MAX,
  DECLARATION_TAG,
  REPLY_TAG,
  VOTE_TAG,
  fingerprintText,
  replyRoot,
  validateDeclarationEvent,
  validateReplyEvent,
  validateVoteEvent,
  voteText,
} from './declarationCore'
import { fetchTextByCid } from './ipfs'
import { FREE_NOTE_RELAYS, getFreeNoteIdentity } from './freeNotes'

export const DECLARATION_REPLY_MAX = 280

const KIND_NOTE = 1
const KIND_REACTION = 7

const PROOFS_STORAGE = 'theblocknote:declarations:proofs'
const VERIFIED_STORAGE = 'theblocknote:declarations:verified'
const TEXT_CACHE_STORAGE = 'theblocknote:declarations:texts'
const CHECKED_STORAGE = 'theblocknote:declarations:checked'
const UPGRADE_EVERY_MS = 10 * 60 * 1000

let pool = null
export function getPool() {
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

function patchJson(key, id, value) {
  const data = readJson(key)
  data[id] = value
  localStorage.setItem(key, JSON.stringify(data))
}

async function publishEverywhere(event) {
  const results = await Promise.allSettled(getPool().publish(FREE_NOTE_RELAYS, event))
  const accepted = results.filter((r) => r.status === 'fulfilled').length
  if (accepted === 0) throw new Error('No relay accepted the event')
  return accepted
}

export function shortNpub(pubkey) {
  const npub = npubEncode(pubkey)
  return `${npub.slice(0, 10)}…${npub.slice(-4)}`
}

/**
 * Stamp the text's SHA-256 with the calendars, then announce it on Nostr with
 * its IPFS CID and pending proof so pinners and readers can pick it up.
 * `fingerprint` is the text that gets hashed and pinned when it differs from the event content.
 * @param {{ content: string, fingerprint?: string, kind?: number, topic: string, tags?: string[][], alt: string, createdAt?: number }} note
 * @param {(step: 'stamping' | 'publishing') => void} [onStep]
 */
export async function stampAndPublish(
  { content, fingerprint = content, kind = KIND_NOTE, topic, tags = [], alt, createdAt },
  onStep,
) {
  const { digest, digestHex, cid } = await fingerprintText(fingerprint)
  onStep?.('stamping')
  const proof = await stampDigest(digest)

  onStep?.('publishing')
  const { sk } = getFreeNoteIdentity()
  const event = finalizeEvent(
    {
      kind,
      created_at: createdAt || Math.floor(Date.now() / 1000),
      tags: [
        ['t', topic],
        ...tags,
        ['x', digestHex],
        ['cid', cid],
        ['ots', bytesToBase64(proof)],
        ['alt', alt],
      ],
      content,
    },
    sk,
  )
  const relays = await publishEverywhere(event)
  patchJson(PROOFS_STORAGE, digestHex, bytesToBase64(proof))
  patchJson(TEXT_CACHE_STORAGE, cid, fingerprint)
  return { event, relays, cid, digestHex, proof: bytesToBase64(proof) }
}

export async function postDeclaration(text, onStep) {
  const content = String(text || '').trim()
  if (!content) throw new Error('Write something first')
  if (content.length > DECLARATION_MAX) throw new Error(`Declarations are limited to ${DECLARATION_MAX} characters`)
  return stampAndPublish(
    {
      content,
      topic: DECLARATION_TAG,
      alt: 'The Block Note declaration anchored in Bitcoin through OpenTimestamps',
    },
    onStep,
  )
}

export async function loadArchive(name = 'declarations') {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/${name}.json`, { cache: 'no-store' })
    if (!res.ok) return []
    const rows = await res.json()
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

/**
 * Declarations from the repo archive (pinned on IPFS) merged with live ones from Nostr.
 * Texts missing from Nostr are fetched from IPFS gateways and always re-hashed.
 */
export async function fetchDeclarations(limit = 100) {
  const [archive, events] = await Promise.all([
    loadArchive(),
    getPool()
      .querySync(FREE_NOTE_RELAYS, { kinds: [KIND_NOTE], '#t': [DECLARATION_TAG], limit }, { maxWait: 4000 })
      .catch(() => []),
  ])

  const byId = new Map()
  for (const row of archive) {
    if (!row?.eventId || !row.cid || !row.digest) continue
    byId.set(row.eventId, {
      eventId: row.eventId,
      pubkey: row.pubkey,
      time: row.created_at,
      cid: row.cid,
      digestHex: row.digest,
      proofs: row.ots ? [row.ots] : [],
      anchor: row.anchor || null,
      text: null,
    })
  }

  for (const event of events) {
    if (!verifyEvent(event)) continue
    const valid = await validateDeclarationEvent(event)
    if (!valid) continue
    const existing = byId.get(event.id)
    const proofs = [...(existing?.proofs || []), ...(valid.ots ? [valid.ots] : [])]
    byId.set(event.id, {
      eventId: event.id,
      pubkey: event.pubkey,
      time: event.created_at,
      cid: valid.cid,
      digestHex: valid.digestHex,
      proofs,
      anchor: existing?.anchor || null,
      text: event.content,
    })
  }

  const texts = readJson(TEXT_CACHE_STORAGE)
  const list = [...byId.values()]
  await Promise.all(
    list.map(async (decl) => {
      if (decl.text) return
      if (texts[decl.cid]) {
        decl.text = texts[decl.cid]
        return
      }
      try {
        decl.text = await fetchTextByCid(decl.cid)
        patchJson(TEXT_CACHE_STORAGE, decl.cid, decl.text)
      } catch {
        decl.text = null
      }
    }),
  )

  return list.filter((d) => d.text).sort((a, b) => b.time - a.time)
}

/**
 * Bitcoin status of each declaration: anchored (with block and calendar tx) or pending.
 * Pending proofs are upgraded from the calendars at most every ten minutes.
 * @returns {Promise<Map<string, object>>} keyed by eventId
 */
export async function resolveDeclarationStatuses(declarations) {
  const verified = readJson(VERIFIED_STORAGE)
  const checked = readJson(CHECKED_STORAGE)
  const localProofs = readJson(PROOFS_STORAGE)
  const statuses = new Map()

  await Promise.all(
    declarations.map(async (decl) => {
      const cached = verified[decl.digestHex] || decl.anchor
      if (cached) {
        statuses.set(decl.eventId, { status: 'anchored', ...cached })
        return
      }
      const candidates = [...decl.proofs, ...(localProofs[decl.digestHex] ? [localProofs[decl.digestHex]] : [])]
      if (candidates.length === 0) {
        statuses.set(decl.eventId, { status: 'none' })
        return
      }

      const due = Date.now() - (checked[decl.digestHex] || 0) > UPGRADE_EVERY_MS
      for (const b64 of candidates) {
        try {
          let proof = base64ToBytes(b64)
          if (due) {
            const upgraded = await upgradeProof(proof)
            if (upgraded.changed) proof = upgraded.proof
          }
          const result = await verifyProof(proof, decl.digestHex)
          if (result.status === 'anchored') {
            const { bitcoinAnchors } = await describeProof(proof)
            const anchor = {
              height: result.height,
              time: result.time,
              blockHash: result.blockHash,
              txid: bitcoinAnchors.find((a) => a.height === result.height)?.txid || null,
            }
            patchJson(VERIFIED_STORAGE, decl.digestHex, anchor)
            statuses.set(decl.eventId, { status: 'anchored', ...anchor })
            return
          }
        } catch {
          // Malformed proof or calendar unreachable; try the next one.
        }
      }
      if (due) patchJson(CHECKED_STORAGE, decl.digestHex, Date.now())
      statuses.set(decl.eventId, { status: 'pending' })
    }),
  )
  return statuses
}

/**
 * Free Nostr votes (reactions "+" and "-") and replies on declarations, from relays
 * and from the pinned archives. Each key counts once per declaration; its latest
 * vote wins. Anchored votes and replies carry their fingerprint and proof.
 * @returns {Promise<Map<string, { ups: Set<string>, downs: Set<string>, votes: Map<string, object>, replies: object[] }>>}
 */
export async function fetchDeclarationReactions(eventIds) {
  const reactions = new Map(
    eventIds.map((id) => [id, { ups: new Set(), downs: new Set(), votes: new Map(), replies: [] }]),
  )
  if (eventIds.length === 0) return reactions
  const [events, archivedVotes] = await Promise.all([
    getPool()
      .querySync(FREE_NOTE_RELAYS, { kinds: [KIND_REACTION, KIND_NOTE], '#e': eventIds }, { maxWait: 4000 })
      .catch(() => []),
    loadArchive('votes'),
  ])

  const seen = new Set()
  const keepLatest = (vote) => {
    const entry = reactions.get(vote.target)
    if (!entry) return
    const previous = entry.votes.get(vote.pubkey)
    if (!previous || vote.time > previous.time) entry.votes.set(vote.pubkey, vote)
  }
  for (const row of archivedVotes) {
    if (!row?.eventId || !row.target || !row.digest) continue
    seen.add(row.eventId)
    keepLatest({
      eventId: row.eventId,
      target: row.target,
      pubkey: row.pubkey,
      time: row.created_at,
      up: row.direction !== 'down',
      anchored: true,
      cid: row.cid,
      digestHex: row.digest,
      proofs: row.ots ? [row.ots] : [],
      anchor: row.anchor || null,
    })
  }

  for (const event of events) {
    if (seen.has(event.id)) continue
    seen.add(event.id)
    const root = replyRoot(event)
    const target = reactions.get(root)
    if (!target) continue
    if (event.kind === KIND_REACTION) {
      const vote = await toVote(event, root)
      if (vote) keepLatest(vote)
    } else if (event.kind === KIND_NOTE && event.content && verifyEvent(event)) {
      const reply = await toReply(event)
      if (reply) target.replies.push(reply)
    }
  }
  const texts = readJson(TEXT_CACHE_STORAGE)
  const archived = (await loadArchive('replies')).filter(
    (row) => row?.eventId && row.cid && row.digest && reactions.has(row.root) && !seen.has(row.eventId),
  )
  await Promise.all(
    archived.map(async (row) => {
      let text = texts[row.cid]
      if (!text) {
        try {
          text = await fetchTextByCid(row.cid)
          patchJson(TEXT_CACHE_STORAGE, row.cid, text)
        } catch {
          return
        }
      }
      reactions.get(row.root).replies.push({
        id: row.eventId,
        pubkey: row.pubkey,
        time: row.created_at,
        text,
        anchored: true,
        eventId: row.eventId,
        cid: row.cid,
        digestHex: row.digest,
        proofs: row.ots ? [row.ots] : [],
        anchor: row.anchor || null,
      })
    }),
  )

  for (const entry of reactions.values()) {
    for (const vote of entry.votes.values()) (vote.up ? entry.ups : entry.downs).add(vote.pubkey)
    entry.replies.sort((a, b) => a.time - b.time)
  }
  return reactions
}

/**
 * Plain Nostr reactions still count (other clients send them), but a reaction that
 * claims a fingerprint not matching its rebuilt vote text is dropped.
 */
async function toVote(event, target) {
  const base = { eventId: event.id, target, pubkey: event.pubkey, time: event.created_at, up: event.content !== '-' }
  if (!event.tags.some((t) => t[0] === 'x')) return { ...base, anchored: false }
  if (!verifyEvent(event)) return null
  const valid = await validateVoteEvent(event)
  if (!valid) return null
  return {
    ...base,
    anchored: true,
    cid: valid.cid,
    digestHex: valid.digestHex,
    proofs: valid.ots ? [valid.ots] : [],
    anchor: null,
  }
}

/**
 * Anchored replies carry their fingerprint and proof; plain Nostr replies are kept
 * without them. A reply that claims a fingerprint its text does not match is dropped.
 */
async function toReply(event) {
  const base = { id: event.id, pubkey: event.pubkey, time: event.created_at, text: event.content }
  if (!event.tags.some((t) => t[0] === 'x')) return { ...base, anchored: false }
  const valid = await validateReplyEvent(event)
  if (!valid) return null
  return {
    ...base,
    anchored: true,
    eventId: event.id,
    cid: valid.cid,
    digestHex: valid.digestHex,
    proofs: valid.ots ? [valid.ots] : [],
    anchor: null,
  }
}

/**
 * Vote on a declaration with a standard Nostr reaction whose vote text is stamped
 * and anchored in Bitcoin.
 * @param {'up' | 'down'} direction
 */
export async function voteDeclaration(decl, direction, onStep) {
  const { pubkey } = getFreeNoteIdentity()
  const time = Math.floor(Date.now() / 1000)
  const { event, cid, digestHex, proof } = await stampAndPublish(
    {
      kind: KIND_REACTION,
      content: direction === 'down' ? '-' : '+',
      fingerprint: voteText({ direction, target: decl.eventId, pubkey, time }),
      topic: VOTE_TAG,
      tags: [
        ['e', decl.eventId, FREE_NOTE_RELAYS[0]],
        ['p', decl.pubkey],
        ['k', String(KIND_NOTE)],
      ],
      alt: `The Block Note vote ${direction === 'down' ? '-1' : '+1'} anchored in Bitcoin through OpenTimestamps`,
      createdAt: time,
    },
    onStep,
  )
  return {
    eventId: event.id,
    target: decl.eventId,
    pubkey,
    time,
    up: direction !== 'down',
    anchored: true,
    cid,
    digestHex,
    proofs: [proof],
    anchor: null,
  }
}

/** Reply to a declaration, stamped and anchored in Bitcoin like the declaration itself. */
export async function replyToDeclaration(decl, text, onStep) {
  const content = String(text || '').trim().slice(0, DECLARATION_REPLY_MAX)
  if (!content) throw new Error('Write something first')
  const { event, cid, digestHex, proof } = await stampAndPublish(
    {
      content,
      topic: REPLY_TAG,
      tags: [
        ['e', decl.eventId, FREE_NOTE_RELAYS[0], 'root'],
        ['p', decl.pubkey],
      ],
      alt: 'The Block Note reply anchored in Bitcoin through OpenTimestamps',
    },
    onStep,
  )
  return {
    id: event.id,
    pubkey: event.pubkey,
    time: event.created_at,
    text: content,
    anchored: true,
    eventId: event.id,
    cid,
    digestHex,
    proofs: [proof],
    anchor: null,
  }
}
