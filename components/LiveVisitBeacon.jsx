import { useEffect } from 'react'
import { sendHeartbeat, subscribeLiveCount } from '../services/LiveVisits'

const HEARTBEAT_MS = 4000

export default function LiveVisitBeacon({ onCount }) {
  useEffect(() => {
    let cancelled = false

    const pulse = async () => {
      const count = await sendHeartbeat()
      if (!cancelled && Number.isFinite(count)) onCount?.(count)
    }

    pulse()
    const timer = window.setInterval(pulse, HEARTBEAT_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') pulse()
    }
    document.addEventListener('visibilitychange', onVisible)
    const stopStream = subscribeLiveCount((count) => {
      if (!cancelled) onCount?.(count)
    })

    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      stopStream()
    }
  }, [onCount])

  return null
}
