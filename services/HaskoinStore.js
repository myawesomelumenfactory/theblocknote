import { explorerJson, explorerText, explorerTipHeight } from './BlockstreamExplorer.js'

const HASKOIN = 'https://api.blockchain.info/haskoin-store/btc'
const BLOCKCHAIN_INFO = 'https://blockchain.info'
const BALANCE_BATCH = 40
const UNSPENT_BATCH = 20
const UNSPENT_PAGE = 250

function chunk(items, size) {
  const batches = []
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size))
  return batches
}

async function getJson(url) {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const raw = await response.text()
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function emptyFunds() {
  return {
    received: 0,
    available: 0,
    unconfirmed: 0,
    confirmations: 0,
    pending: false,
    utxoCount: 0,
  }
}

function fundsFromHaskoin(row) {
  if (!row) return emptyFunds()
  const confirmed = Number(row.confirmed) || 0
  const unconfirmedDelta = Number(row.unconfirmed) || 0
  const received = Number(row.received) || 0
  const available = confirmed + unconfirmedDelta
  const unconfirmed = Math.max(0, unconfirmedDelta)
  return {
    received: Math.max(received, available, 0),
    available: Math.max(available, 0),
    unconfirmed,
    confirmations: 0,
    pending: unconfirmed > 0,
    utxoCount: Number(row.utxo) || 0,
  }
}

function fundsFromBlockchainInfo(row) {
  if (!row) return emptyFunds()
  const received = Number(row.total_received) || 0
  const available = Number(row.final_balance) || 0
  return {
    received,
    available,
    unconfirmed: 0,
    confirmations: 0,
    pending: false,
    utxoCount: 0,
  }
}

function fundsFromEsplora(info) {
  if (!info) return emptyFunds()
  const confirmedReceived = info.chain_stats?.funded_txo_sum || 0
  const mempoolReceived = info.mempool_stats?.funded_txo_sum || 0
  const spent =
    (info.chain_stats?.spent_txo_sum || 0) +
    (info.mempool_stats?.spent_txo_sum || 0)
  const received = confirmedReceived + mempoolReceived
  const unconfirmed = mempoolReceived
  return {
    received,
    available: received - spent,
    unconfirmed,
    confirmations: 0,
    pending: unconfirmed > 0,
    utxoCount: 0,
  }
}

export function mapHaskoinUtxo(utxo, tipHeight) {
  const height = utxo?.block?.height
  const inMempool = height == null || utxo?.block?.mempool != null
  return {
    txid: utxo.txid,
    vout: utxo.index,
    value: Number(utxo.value) || 0,
    status: {
      confirmed: !inMempool,
      block_height: inMempool ? undefined : height,
    },
    confirmations: inMempool ? 0 : Math.max(1, (tipHeight || height) - height + 1),
  }
}

export async function fetchTipHeight() {
  const data = await getJson(`${HASKOIN}/block/best?notx=true`)
  if (Number.isFinite(data?.height)) return data.height
  return explorerTipHeight()
}

export async function fetchBalances(addresses) {
  const result = Object.fromEntries(addresses.map((address) => [address, emptyFunds()]))
  if (addresses.length === 0) return result

  for (const batch of chunk(addresses, BALANCE_BATCH)) {
    const haskoin = await getJson(
      `${HASKOIN}/address/balances?addresses=${batch.map(encodeURIComponent).join(',')}`
    )
    if (Array.isArray(haskoin)) {
      for (const row of haskoin) {
        if (row?.address && result[row.address] !== undefined) {
          result[row.address] = fundsFromHaskoin(row)
        }
      }
      continue
    }

    const blockchain = await getJson(
      `${BLOCKCHAIN_INFO}/balance?cors=true&active=${batch.map(encodeURIComponent).join('|')}`
    )
    if (blockchain && typeof blockchain === 'object' && !Array.isArray(blockchain)) {
      for (const address of batch) {
        if (blockchain[address]) result[address] = fundsFromBlockchainInfo(blockchain[address])
      }
      continue
    }

    await Promise.all(
      batch.map(async (address) => {
        result[address] = fundsFromEsplora(await explorerJson(`/address/${address}`))
      })
    )
  }

  return result
}

async function fetchUnspentsForAddress(address, tipHeight) {
  const haskoin = await getJson(
    `${HASKOIN}/address/${encodeURIComponent(address)}/unspent?limit=${UNSPENT_PAGE}`
  )
  if (Array.isArray(haskoin)) return haskoin.map((utxo) => mapHaskoinUtxo(utxo, tipHeight))

  const esplora = await explorerJson(`/address/${address}/utxo`)
  return Array.isArray(esplora) ? esplora : []
}

export async function fetchUnspents(addresses, tipHeight) {
  const result = Object.fromEntries(addresses.map((address) => [address, []]))
  if (addresses.length === 0) return result

  for (const batch of chunk(addresses, UNSPENT_BATCH)) {
    const haskoin = await getJson(
      `${HASKOIN}/address/unspent?limit=${UNSPENT_PAGE}&addresses=${batch.map(encodeURIComponent).join(',')}`
    )
    if (Array.isArray(haskoin)) {
      for (const utxo of haskoin) {
        if (!utxo?.address || result[utxo.address] === undefined) continue
        result[utxo.address].push(mapHaskoinUtxo(utxo, tipHeight))
      }
      const missing = batch.filter((address) => result[address].length === 0)
      await Promise.all(
        missing.map(async (address) => {
          result[address] = await fetchUnspentsForAddress(address, tipHeight)
        })
      )
      continue
    }

    await Promise.all(
      batch.map(async (address) => {
        result[address] = await fetchUnspentsForAddress(address, tipHeight)
      })
    )
  }

  return result
}

export async function fetchTxHex(txid) {
  const data = await getJson(`${HASKOIN}/transaction/${encodeURIComponent(txid)}/raw`)
  if (typeof data?.result === 'string' && /^[0-9a-f]+$/i.test(data.result)) return data.result
  return explorerText(`/tx/${txid}/hex`)
}
