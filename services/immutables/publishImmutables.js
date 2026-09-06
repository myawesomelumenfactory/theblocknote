import fs from 'node:fs/promises'
import path from 'node:path'

function readEnv(name) {
  const value = process.env[name]
  return value && value.trim() ? value.trim() : ''
}

async function publishToKubo(filePath) {
  const api = readEnv('IPFS_API').replace(/\/$/, '')
  if (!api) return null

  const bytes = await fs.readFile(filePath)
  const blob = new Blob([bytes], { type: 'application/json' })
  const body = new FormData()
  body.append('file', blob, path.basename(filePath))

  const response = await fetch(`${api}/api/v0/add?pin=true`, {
    method: 'POST',
    body,
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`IPFS add failed (${response.status}): ${text}`)
  }
  const data = JSON.parse(text)
  return {
    provider: 'kubo',
    cid: data.Hash || data.cid,
    url: data.Hash ? `https://ipfs.io/ipfs/${data.Hash}` : null,
  }
}

async function publishToPinata(filePath) {
  const jwt = readEnv('PINATA_JWT')
  if (!jwt) return null

  const bytes = await fs.readFile(filePath)
  const blob = new Blob([bytes], { type: 'application/json' })
  const body = new FormData()
  body.append('file', blob, path.basename(filePath))
  body.append('pinataMetadata', JSON.stringify({ name: 'theblocknote-immutables.json' }))

  const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body,
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error?.details || data.error || `Pinata failed (${response.status})`)
  }
  return {
    provider: 'pinata',
    cid: data.IpfsHash,
    url: `https://gateway.pinata.cloud/ipfs/${data.IpfsHash}`,
  }
}

export async function publishImmutables(filePath) {
  const published =
    (await publishToKubo(filePath)) ||
    (await publishToPinata(filePath))

  if (!published) {
    return {
      skipped: true,
      reason: 'No IPFS_API or PINATA_JWT set; wrote the local immutables.json only',
    }
  }

  const receipt = {
    ...published,
    publishedAt: new Date().toISOString(),
  }
  const payload = `${JSON.stringify(receipt, null, 2)}\n`
  const receiptPaths = [
    path.resolve('data/immutables-ipfs.json'),
    path.resolve('public/data/immutables-ipfs.json'),
  ]
  for (const receiptPath of receiptPaths) {
    await fs.mkdir(path.dirname(receiptPath), { recursive: true })
    await fs.writeFile(receiptPath, payload)
  }
  return published
}
