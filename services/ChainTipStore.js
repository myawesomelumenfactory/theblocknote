import { useEffect, useState } from 'react'
import { fetchTipHeight } from './HaskoinStore'

const POLL_MS = 30_000

let height = null
let started = false
let socket
let retry
let poll
const listeners = new Set()

function heightFromPayload(data) {
  if (!data || typeof data !== 'object') return null
  const direct = Number(data.block?.height ?? data.height)
  if (Number.isFinite(direct) && direct > 0) return direct
  const blocks = data.blocks
  if (Array.isArray(blocks) && blocks.length) {
    const heights = blocks.map((row) => Number(row?.height)).filter((n) => Number.isFinite(n))
    if (heights.length) return Math.max(...heights)
  }
  return null
}

function apply(next) {
  if (!Number.isFinite(next) || next <= 0) return
  if (height != null && next <= height) return
  height = next
  for (const fn of listeners) fn(height)
}

async function pull() {
  try {
    apply(await fetchTipHeight())
  } catch {
    // Keep the last known height.
  }
}

function connect() {
  socket = new WebSocket('wss://mempool.space/api/v1/ws')
  socket.onopen = () => {
    socket.send(JSON.stringify({ action: 'want', data: ['blocks'] }))
  }
  socket.onmessage = (event) => {
    if (!event.data || event.data === 'pong') return
    try {
      apply(heightFromPayload(JSON.parse(event.data)))
    } catch {
      // Ignore keepalive frames.
    }
  }
  socket.onerror = () => {
    socket.close()
  }
  socket.onclose = () => {
    if (!started) return
    retry = window.setTimeout(connect, 8000)
  }
}

function start() {
  if (started || typeof window === 'undefined') return
  started = true
  pull()
  connect()
  poll = window.setInterval(pull, POLL_MS)
}

export function getChainTip() {
  return height
}

export function subscribeChainTip(onTip) {
  listeners.add(onTip)
  start()
  if (Number.isFinite(height)) onTip(height)
  return () => listeners.delete(onTip)
}

export function useChainTip() {
  const [tip, setTip] = useState(getChainTip)
  useEffect(() => subscribeChainTip(setTip), [])
  return tip
}
