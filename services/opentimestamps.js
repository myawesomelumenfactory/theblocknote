/**
 * Minimal OpenTimestamps client for the browser (and Node 20+).
 * Stamps a 32-byte digest with public calendars, upgrades pending proofs once
 * Bitcoin confirms them, and verifies the result against a real block header.
 * Format reference: https://github.com/opentimestamps/python-opentimestamps
 */
import * as bitcoin from 'bitcoinjs-lib'
import { Buffer } from 'buffer'
import { ripemd160, sha1 } from '@noble/hashes/legacy'
import { keccak_256 } from '@noble/hashes/sha3'

export const OTS_CALENDARS = [
  'https://a.pool.opentimestamps.org',
  'https://b.pool.opentimestamps.org',
  'https://a.pool.eternitywall.com',
]

const ACCEPT = { Accept: 'application/vnd.opentimestamps.v1' }

const HEADER_MAGIC = Uint8Array.from([
  0x00, 0x4f, 0x70, 0x65, 0x6e, 0x54, 0x69, 0x6d, 0x65, 0x73, 0x74, 0x61, 0x6d, 0x70, 0x73, 0x00,
  0x00, 0x50, 0x72, 0x6f, 0x6f, 0x66, 0x00, 0xbf, 0x89, 0xe2, 0xe8, 0x84, 0xe8, 0x92, 0x94,
])

const TAG_PENDING = '83dfe30d2ef90c8e'
const TAG_BITCOIN = '0588960d73d71901'

const OP_SHA1 = 0x02
const OP_RIPEMD160 = 0x03
const OP_SHA256 = 0x08
const OP_KECCAK256 = 0x67
const OP_APPEND = 0xf0
const OP_PREPEND = 0xf1
const OP_REVERSE = 0xf2
const OP_HEXLIFY = 0xf3
const UNARY_OPS = new Set([OP_SHA1, OP_RIPEMD160, OP_SHA256, OP_KECCAK256, OP_REVERSE, OP_HEXLIFY])
const BINARY_OPS = new Set([OP_APPEND, OP_PREPEND])

// ---------- bytes ----------

export function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function hexToBytes(hex) {
  const clean = String(hex).trim()
  if (!/^([0-9a-fA-F]{2})*$/.test(clean)) throw new Error('Invalid hex')
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}

export function bytesToBase64(bytes) {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

export function base64ToBytes(text) {
  const binary = atob(String(text).trim())
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

async function sha256(bytes) {
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))
}

class Reader {
  constructor(bytes) {
    this.bytes = bytes
    this.pos = 0
  }
  byte() {
    if (this.pos >= this.bytes.length) throw new Error('Truncated timestamp')
    return this.bytes[this.pos++]
  }
  take(n) {
    if (this.pos + n > this.bytes.length) throw new Error('Truncated timestamp')
    const out = this.bytes.slice(this.pos, this.pos + n)
    this.pos += n
    return out
  }
  varuint() {
    let value = 0
    let shift = 0
    for (;;) {
      const b = this.byte()
      value += (b & 0x7f) * 2 ** shift
      if (!(b & 0x80)) return value
      shift += 7
    }
  }
  varbytes() {
    return this.take(this.varuint())
  }
}

class Writer {
  constructor() {
    this.parts = []
  }
  byte(b) {
    this.parts.push(Uint8Array.of(b))
  }
  bytes(b) {
    this.parts.push(b)
  }
  varuint(value) {
    const out = []
    let n = value
    do {
      let b = n % 128
      n = Math.floor(n / 128)
      if (n > 0) b |= 0x80
      out.push(b)
    } while (n > 0)
    this.parts.push(Uint8Array.from(out))
  }
  varbytes(b) {
    this.varuint(b.length)
    this.bytes(b)
  }
  done() {
    return concat(...this.parts)
  }
}

// ---------- timestamp tree ----------
// Node: { attestations: [{ tag, payload }], ops: [{ op, arg, next: Node }] }

function readAttestation(r) {
  const tag = bytesToHex(r.take(8))
  const payload = r.varbytes()
  return { tag, payload }
}

function readTimestamp(r) {
  const node = { attestations: [], ops: [] }
  const readItem = (tag) => {
    if (tag === 0x00) {
      node.attestations.push(readAttestation(r))
      return
    }
    let arg = null
    if (BINARY_OPS.has(tag)) arg = r.varbytes()
    else if (!UNARY_OPS.has(tag)) throw new Error(`Unknown OpenTimestamps op 0x${tag.toString(16)}`)
    node.ops.push({ op: tag, arg, next: readTimestamp(r) })
  }

  let tag = r.byte()
  while (tag === 0xff) {
    readItem(r.byte())
    tag = r.byte()
  }
  readItem(tag)
  return node
}

function writeTimestamp(w, node) {
  const items = [
    ...node.attestations.map((a) => ({ a })),
    ...node.ops.map((o) => ({ o })),
  ]
  if (items.length === 0) throw new Error('Empty timestamp node')
  items.forEach((item, i) => {
    if (i < items.length - 1) w.byte(0xff)
    if (item.a) {
      w.byte(0x00)
      w.bytes(hexToBytes(item.a.tag))
      w.varbytes(item.a.payload)
    } else {
      w.byte(item.o.op)
      if (item.o.arg) w.varbytes(item.o.arg)
      writeTimestamp(w, item.o.next)
    }
  })
}

export function parseTimestamp(bytes) {
  const r = new Reader(bytes)
  const node = readTimestamp(r)
  if (r.pos !== bytes.length) throw new Error('Trailing bytes after timestamp')
  return node
}

export function serializeTimestamp(node) {
  const w = new Writer()
  writeTimestamp(w, node)
  return w.done()
}

async function applyOp(op, arg, msg) {
  switch (op) {
    case OP_SHA1:
      return sha1(msg)
    case OP_RIPEMD160:
      return ripemd160(msg)
    case OP_SHA256:
      return sha256(msg)
    case OP_KECCAK256:
      return keccak_256(msg)
    case OP_APPEND:
      return concat(msg, arg)
    case OP_PREPEND:
      return concat(arg, msg)
    case OP_REVERSE:
      return Uint8Array.from(msg).reverse()
    case OP_HEXLIFY:
      return new TextEncoder().encode(bytesToHex(msg))
    default:
      throw new Error(`Unsupported OpenTimestamps op 0x${op.toString(16)}`)
  }
}

/** Every attestation in the tree with the commitment it attests to and the messages leading there. */
async function walkAttestations(node, msg, out = [], path = []) {
  const here = [...path, msg]
  for (const attestation of node.attestations) out.push({ node, attestation, msg, path: here })
  for (const { op, arg, next } of node.ops) {
    await walkAttestations(next, await applyOp(op, arg, msg), out, here)
  }
  return out
}

function pendingUri(attestation) {
  const uri = new TextDecoder().decode(new Reader(attestation.payload).varbytes())
  return uri.replace(/\/+$/, '')
}

function bitcoinHeight(attestation) {
  return new Reader(attestation.payload).varuint()
}

// ---------- detached .ots file ----------

export function serializeDetached(digest, node) {
  const w = new Writer()
  w.bytes(HEADER_MAGIC)
  w.varuint(1)
  w.byte(OP_SHA256)
  w.bytes(digest)
  writeTimestamp(w, node)
  return w.done()
}

export function parseDetached(bytes) {
  const r = new Reader(bytes)
  const magic = r.take(HEADER_MAGIC.length)
  if (bytesToHex(magic) !== bytesToHex(HEADER_MAGIC)) throw new Error('Not an OpenTimestamps proof')
  if (r.varuint() !== 1) throw new Error('Unsupported OpenTimestamps version')
  if (r.byte() !== OP_SHA256) throw new Error('Only SHA-256 file digests are supported')
  const digest = r.take(32)
  const node = readTimestamp(r)
  return { digest, node }
}

// ---------- calendars ----------

/**
 * Submit a 32-byte digest to every calendar. Succeeds if at least one answers.
 * @returns {Promise<Uint8Array>} detached .ots proof (pending until Bitcoin confirms)
 */
export async function stampDigest(digest, calendars = OTS_CALENDARS) {
  const responses = await Promise.allSettled(
    calendars.map(async (url) => {
      const res = await fetch(`${url}/digest`, { method: 'POST', headers: ACCEPT, body: digest })
      if (!res.ok) throw new Error(`${url} answered ${res.status}`)
      return parseTimestamp(new Uint8Array(await res.arrayBuffer()))
    })
  )

  const root = { attestations: [], ops: [] }
  for (const result of responses) {
    if (result.status !== 'fulfilled') continue
    root.attestations.push(...result.value.attestations)
    root.ops.push(...result.value.ops)
  }
  if (root.ops.length === 0 && root.attestations.length === 0) {
    throw new Error('No OpenTimestamps calendar accepted the stamp')
  }
  return serializeDetached(digest, root)
}

/**
 * Ask each pending calendar whether Bitcoin has confirmed the stamp yet.
 * Only calendars in the allowlist are contacted.
 * @returns {Promise<{ proof: Uint8Array, changed: boolean }>}
 */
export async function upgradeProof(proof, calendars = OTS_CALENDARS) {
  const { digest, node } = parseDetached(proof)
  const allowed = new Set(calendars.map((url) => url.replace(/\/+$/, '')))
  const entries = await walkAttestations(node, digest)
  let changed = false

  for (const { node: holder, attestation, msg } of entries) {
    if (attestation.tag !== TAG_PENDING) continue
    const uri = pendingUri(attestation)
    if (!allowed.has(uri)) continue
    try {
      const res = await fetch(`${uri}/timestamp/${bytesToHex(msg)}`, { headers: ACCEPT })
      if (!res.ok) continue
      const upgraded = parseTimestamp(new Uint8Array(await res.arrayBuffer()))
      holder.attestations = holder.attestations.filter((a) => a !== attestation)
      holder.attestations.push(...upgraded.attestations)
      holder.ops.push(...upgraded.ops)
      changed = true
    } catch {
      // Calendar unreachable; try again later.
    }
  }

  return { proof: changed ? serializeDetached(digest, node) : proof, changed }
}

/**
 * The calendar transaction a Bitcoin attestation passes through, found by
 * looking for a step in the path that is a complete serialized transaction.
 */
function findAnchorTransaction(path) {
  for (let i = 1; i < path.length; i++) {
    const msg = path[i]
    if (msg.length < 60) continue
    try {
      const tx = bitcoin.Transaction.fromBuffer(Buffer.from(msg))
      if (tx.ins.length === 0 || tx.outs.length === 0) continue
      const txHex = bytesToHex(msg)
      const commitment = path
        .slice(0, i)
        .reverse()
        .find((m) => m.length <= 64 && txHex.includes(bytesToHex(m)))
      const commitmentHex = commitment ? bytesToHex(commitment) : null
      const output = commitmentHex
        ? tx.outs.find((out) => bytesToHex(out.script).includes(commitmentHex))
        : null
      return {
        txid: tx.getId(),
        commitmentHex,
        outputScriptHex: output ? bytesToHex(output.script) : null,
        isOpReturn: Boolean(output && output.script[0] === 0x6a),
      }
    } catch {
      // Not a transaction; keep climbing.
    }
  }
  return null
}

/**
 * What a proof contains without contacting anyone: which calendars hold a pending
 * stamp, and which Bitcoin blocks and calendar transactions it is anchored in.
 */
export async function describeProof(proof) {
  const { digest, node } = parseDetached(proof)
  const entries = await walkAttestations(node, digest)
  const calendars = []
  const bitcoinAnchors = []
  for (const entry of entries) {
    if (entry.attestation.tag === TAG_PENDING) {
      calendars.push(pendingUri(entry.attestation))
    } else if (entry.attestation.tag === TAG_BITCOIN) {
      bitcoinAnchors.push({
        height: bitcoinHeight(entry.attestation),
        ...(findAnchorTransaction(entry.path) || {}),
      })
    }
  }
  return {
    digest: bytesToHex(digest),
    calendars: [...new Set(calendars)],
    bitcoinAnchors,
  }
}

/**
 * Check Bitcoin attestations against block headers from mempool.space.
 * 'unverified' means a Bitcoin attestation exists but no explorer could be reached.
 * @returns {Promise<{ status: 'anchored', height: number, time: number, blockHash: string } | { status: 'pending' | 'unverified' | 'invalid' }>}
 */
export async function verifyProof(proof, expectedDigestHex = null) {
  const { digest, node } = parseDetached(proof)
  if (expectedDigestHex && bytesToHex(digest) !== String(expectedDigestHex).toLowerCase()) {
    return { status: 'invalid' }
  }

  const entries = await walkAttestations(node, digest)
  const bitcoin = entries
    .filter((e) => e.attestation.tag === TAG_BITCOIN)
    .map((e) => ({ height: bitcoinHeight(e.attestation), merkleRoot: e.msg }))
    .sort((a, b) => a.height - b.height)

  let unreachable = false
  for (const { height, merkleRoot } of bitcoin) {
    try {
      const hashRes = await fetch(`https://mempool.space/api/block-height/${height}`)
      if (!hashRes.ok) throw new Error(`HTTP ${hashRes.status}`)
      const blockHash = (await hashRes.text()).trim()
      const blockRes = await fetch(`https://mempool.space/api/block/${blockHash}`)
      if (!blockRes.ok) throw new Error(`HTTP ${blockRes.status}`)
      const block = await blockRes.json()
      const displayRoot = bytesToHex(Uint8Array.from(merkleRoot).reverse())
      if (merkleRoot.length === 32 && displayRoot === block.merkle_root) {
        return { status: 'anchored', height, time: block.timestamp, blockHash }
      }
    } catch {
      unreachable = true
    }
  }

  if (bitcoin.length > 0) return { status: unreachable ? 'unverified' : 'invalid' }
  return entries.some((e) => e.attestation.tag === TAG_PENDING) ? { status: 'pending' } : { status: 'invalid' }
}
