import {
  OTS_CALENDARS,
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  describeProof,
  stampDigest,
  upgradeProof,
  verifyProof,
} from './opentimestamps'

export const STAMP_MAX = 1000
const STORAGE_KEY = 'theblocknote:stamps'

/** SHA-256 of the exact UTF-8 bytes that the downloaded .txt file will contain. */
export async function hashBytes(bytes) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
}

export function textBytes(text) {
  return new TextEncoder().encode(text)
}

export function listStamps() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveStamps(stamps) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stamps))
}

export function stampProofBytes(stamp) {
  return base64ToBytes(stamp.proof)
}

export function removeStamp(digest) {
  const stamps = listStamps().filter((s) => s.digest !== digest)
  saveStamps(stamps)
  return stamps
}

/** Send the message fingerprint to the calendars. The text itself never leaves the browser. */
export async function createStamp(text) {
  const clean = String(text || '')
  if (!clean.trim()) throw new Error('Message is empty')
  const digest = await hashBytes(textBytes(clean))
  const digestHex = bytesToHex(digest)

  const existing = listStamps().find((s) => s.digest === digestHex)
  if (existing) return { stamp: existing, duplicate: true }

  const proof = await stampDigest(digest, OTS_CALENDARS)
  const { calendars } = await describeProof(proof)
  const stamp = {
    digest: digestHex,
    text: clean,
    createdAt: Date.now(),
    proof: bytesToBase64(proof),
    calendars,
    status: 'pending',
    anchor: null,
  }
  saveStamps([stamp, ...listStamps()])
  return { stamp, duplicate: false }
}

async function anchorDetails(proof, verification) {
  const { bitcoinAnchors } = await describeProof(proof)
  const match = bitcoinAnchors.find((a) => a.height === verification.height) || bitcoinAnchors[0] || {}
  return {
    height: verification.height,
    time: verification.time,
    blockHash: verification.blockHash,
    txid: match.txid || null,
    commitmentHex: match.commitmentHex || null,
    outputScriptHex: match.outputScriptHex || null,
    isOpReturn: Boolean(match.isOpReturn),
  }
}

/**
 * Ask the calendars whether pending stamps have reached Bitcoin yet.
 * @returns {Promise<{ stamps: object[], anchored: number }>}
 */
export async function refreshStamps() {
  const stamps = listStamps()
  let anchored = 0

  for (const stamp of stamps) {
    if (stamp.status === 'anchored') continue
    try {
      let proof = base64ToBytes(stamp.proof)
      const upgraded = await upgradeProof(proof, OTS_CALENDARS)
      if (upgraded.changed) {
        proof = upgraded.proof
        stamp.proof = bytesToBase64(proof)
      }
      const verification = await verifyProof(proof, stamp.digest)
      if (verification.status === 'anchored') {
        stamp.status = 'anchored'
        stamp.anchor = await anchorDetails(proof, verification)
        anchored += 1
      }
    } catch (err) {
      console.warn('Stamp refresh failed', stamp.digest, err)
    }
  }

  saveStamps(stamps)
  return { stamps, anchored }
}

/**
 * Check any message file against any .ots proof, fetching a newer proof
 * from the calendars first if the given one is still pending.
 */
export async function verifyStampFiles(messageBytes, proofBytes) {
  const digest = bytesToHex(await hashBytes(messageBytes))
  let proof = proofBytes
  const described = await describeProof(proof)
  if (described.digest !== digest) return { status: 'mismatch', digest }

  if (described.bitcoinAnchors.length === 0) {
    const upgraded = await upgradeProof(proof, OTS_CALENDARS)
    if (upgraded.changed) proof = upgraded.proof
  }
  const verification = await verifyProof(proof, digest)
  if (verification.status === 'anchored') {
    return { status: 'anchored', digest, anchor: await anchorDetails(proof, verification) }
  }
  return { status: verification.status, digest, calendars: described.calendars }
}
