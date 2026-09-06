import { useEffect, useState } from 'react'
import { fetchTipHeight } from '../services/HaskoinStore'

const POLL_MS = 30_000

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

export default function ChainTip() {
  const [height, setHeight] = useState(null)

  useEffect(() => {
    let cancelled = false
    let socket
    let retry
    let poll

    const apply = (next) => {
      if (cancelled || !Number.isFinite(next) || next <= 0) return
      setHeight((prev) => (prev == null || next > prev ? next : prev))
    }

    const pull = async () => {
      try {
        const tip = await fetchTipHeight()
        apply(tip)
      } catch {
        // Keep the last known height.
      }
    }

    const connect = () => {
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
        if (cancelled) return
        retry = window.setTimeout(connect, 8000)
      }
    }

    pull()
    connect()
    poll = window.setInterval(pull, POLL_MS)

    return () => {
      cancelled = true
      window.clearInterval(poll)
      window.clearTimeout(retry)
      socket?.close()
    }
  }, [])

  const label = Number.isFinite(height) ? height.toLocaleString('en-US') : '—'

  return (
    <a
      href={Number.isFinite(height) ? `https://mempool.space/block/${height}` : 'https://mempool.space'}
      target="_blank"
      rel="noopener noreferrer"
      title={Number.isFinite(height) ? `Latest Bitcoin block ${label}` : 'Latest Bitcoin block'}
      className="flex flex-col items-start leading-none pr-1"
    >
      <span className="text-[10px] uppercase tracking-wide text-white/40">Block</span>
      <span className="text-sm font-semibold text-white tabular-nums">{label}</span>
    </a>
  )
}
