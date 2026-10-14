import { bytesToHex } from './opentimestamps.js'
import { digestFromCid, sha256 } from './declarationCore.js'

export const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://dweb.link/ipfs/',
  'https://w3s.link/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
]

export function gatewayUrl(cid, gateway = IPFS_GATEWAYS[0]) {
  return `${gateway}${cid}`
}

async function fetchFrom(gateway, cid, expectedHex, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${gateway}${cid}`, { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytesToHex(await sha256(bytes)) !== expectedHex) throw new Error('Content does not match its CID')
    return bytes
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetch a raw-CID text from the first gateway that answers with bytes
 * matching the CID's own hash, so no gateway has to be trusted.
 */
export async function fetchTextByCid(cid, { gateways = IPFS_GATEWAYS, timeoutMs = 8000 } = {}) {
  const digest = digestFromCid(cid)
  if (!digest) throw new Error('Unsupported CID')
  const expectedHex = bytesToHex(digest)
  const bytes = await Promise.any(gateways.map((g) => fetchFrom(g, cid, expectedHex, timeoutMs)))
  return new TextDecoder().decode(bytes)
}
