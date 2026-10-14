import { npubEncode } from 'nostr-tools/nip19'
import { bytesToHex, hexToBytes } from './opentimestamps.js'

/**
 * A declaration is free text whose SHA-256 is both:
 * - the digest stamped by OpenTimestamps calendars (anchored in Bitcoin), and
 * - the IPFS address of the text (CIDv1, raw codec, sha2-256), so the
 *   fingerprint that Bitcoin proves is also where the text can be fetched.
 */

export const DECLARATION_TAG = 'theblocknote-declaration'
export const DECLARATION_MAX = 1000

const CID_PREFIX = [0x01, 0x55, 0x12, 0x20] // CIDv1, raw, sha2-256, 32 bytes
const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567'

function base32(bytes) {
  let out = ''
  let buffer = 0
  let bits = 0
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32[(buffer >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32[(buffer << (5 - bits)) & 31]
  return out
}

function unbase32(text) {
  const out = []
  let buffer = 0
  let bits = 0
  for (const ch of text) {
    const value = BASE32.indexOf(ch)
    if (value < 0) throw new Error('Invalid base32')
    buffer = (buffer << 5) | value
    bits += 5
    if (bits >= 8) {
      out.push((buffer >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Uint8Array.from(out)
}

export function textToBytes(text) {
  return new TextEncoder().encode(text)
}

export async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
}

export function cidFromDigest(digest) {
  return `b${base32(Uint8Array.from([...CID_PREFIX, ...digest]))}`
}

/** The sha256 digest inside a raw CIDv1, or null for any other kind of CID. */
export function digestFromCid(cid) {
  const text = String(cid || '')
  if (!text.startsWith('b')) return null
  try {
    const bytes = unbase32(text.slice(1))
    if (bytes.length !== 36 || CID_PREFIX.some((b, i) => bytes[i] !== b)) return null
    return bytes.slice(4)
  } catch {
    return null
  }
}

export async function fingerprintText(text) {
  const bytes = textToBytes(text)
  const digest = await sha256(bytes)
  return { bytes, digest, digestHex: bytesToHex(digest), cid: cidFromDigest(digest) }
}

export function tagValue(event, name) {
  return event?.tags?.find((t) => t[0] === name)?.[1] || null
}

/**
 * Check that a Nostr declaration event is self-consistent:
 * its text hashes to the declared digest and the CID encodes that digest.
 * (Signature checks are left to the caller's Nostr library.)
 */
export async function validateDeclarationEvent(event) {
  const digestHex = tagValue(event, 'x')
  const cid = tagValue(event, 'cid')
  if (!digestHex || !cid || !/^[0-9a-f]{64}$/.test(digestHex)) return null
  const embedded = digestFromCid(cid)
  if (!embedded || bytesToHex(embedded) !== digestHex) return null
  if (event.content) {
    const actual = bytesToHex(await sha256(textToBytes(event.content)))
    if (actual !== digestHex) return null
  }
  return { digestHex, cid, digest: hexToBytes(digestHex), ots: tagValue(event, 'ots') }
}

/** An anchored reply is a declaration whose `e` root tag names the declaration it answers. */
export const REPLY_TAG = 'theblocknote-reply'

export function replyRoot(event) {
  const eTags = (event?.tags || []).filter((t) => t[0] === 'e')
  return eTags.find((t) => t[3] === 'root')?.[1] || eTags[eTags.length - 1]?.[1] || null
}

export async function validateReplyEvent(event) {
  const root = replyRoot(event)
  if (!root || !/^[0-9a-f]{64}$/.test(root) || !event?.content) return null
  const valid = await validateDeclarationEvent(event)
  return valid ? { ...valid, root } : null
}

/**
 * An anchored vote is a standard Nostr reaction ("+" or "-") whose fingerprint covers
 * a text rebuilt from the reaction itself: direction, target, voter and time.
 * Declarations are voted with a kind 7 reaction to their event id; on-chain messages
 * (`txid_vout`) with a kind 17 reaction to external content (NIP-73 `bitcoin:tx:` tag).
 */
export const VOTE_TAG = 'theblocknote-vote'
export const KIND_EVENT_REACTION = 7
export const KIND_EXTERNAL_REACTION = 17

const EVENT_ID = /^[0-9a-f]{64}$/
const MESSAGE_ID = /^([0-9a-f]{64})_(\d+)$/

export function isMessageTarget(target) {
  return MESSAGE_ID.test(String(target || ''))
}

export function voteText({ direction, target, pubkey, time }) {
  return [
    `Vote ${direction === 'down' ? '-1' : '+1'} · ${isMessageTarget(target) ? 'bitcoin' : 'nostr'}:${target}`,
    `Voter: ${npubEncode(pubkey)}`,
    `The Block Note · ${new Date(time * 1000).toISOString()}`,
  ].join('\n')
}

/** Tags pointing a kind 17 reaction at an on-chain message. */
export function messageVoteTags(target) {
  const [, txid, vout] = String(target).match(MESSAGE_ID) || []
  if (!txid) throw new Error('Not an on-chain message')
  return [
    ['i', `bitcoin:tx:${txid}`],
    ['k', 'bitcoin:tx'],
    ['vout', vout],
  ]
}

/** The declaration event id or on-chain message `txid_vout` a reaction votes on. */
export function voteTarget(event) {
  if (event?.kind === KIND_EVENT_REACTION) {
    const id = replyRoot(event)
    return id && EVENT_ID.test(id) ? id : null
  }
  if (event?.kind === KIND_EXTERNAL_REACTION) {
    const txid = tagValue(event, 'i')?.match(/^bitcoin:tx:([0-9a-f]{64})$/)?.[1]
    const vout = tagValue(event, 'vout')
    return txid && /^\d+$/.test(vout || '') ? `${txid}_${vout}` : null
  }
  return null
}

export async function validateVoteEvent(event) {
  if (!['+', '-'].includes(event?.content)) return null
  const target = voteTarget(event)
  const digestHex = tagValue(event, 'x')
  const cid = tagValue(event, 'cid')
  if (!target || !digestHex || !cid) return null
  const direction = event.content === '-' ? 'down' : 'up'
  const text = voteText({ direction, target, pubkey: event.pubkey, time: event.created_at })
  const digest = await sha256(textToBytes(text))
  if (bytesToHex(digest) !== digestHex || cid !== cidFromDigest(digest)) return null
  return { digestHex, cid, digest, ots: tagValue(event, 'ots'), target, direction, text }
}

/**
 * A free map vote is a declaration whose text names the country and the voter,
 * so every vote has its own fingerprint, CID and Bitcoin anchor.
 */
export const MAP_VOTE_TAG = 'theblocknote-map-vote'

const MAP_VOTE_LINE = /^Map vote · .+ \(([0-9A-Z]{3})\)$/

export function mapVoteText({ code, name, pubkey, time }) {
  return [
    `Map vote · ${name} (${code})`,
    `Voter: ${npubEncode(pubkey)}`,
    `The Block Note · ${new Date(time * 1000).toISOString()}`,
  ].join('\n')
}

/** Validate a free map vote event; its text must name the `country` tag and the event's own key. */
export async function validateMapVoteEvent(event) {
  const code = tagValue(event, 'country')
  if (!code || !event?.content) return null
  const [first, second] = event.content.split('\n')
  if (MAP_VOTE_LINE.exec(first || '')?.[1] !== code) return null
  if (second !== `Voter: ${npubEncode(event.pubkey)}`) return null
  const valid = await validateDeclarationEvent(event)
  return valid ? { ...valid, code } : null
}
