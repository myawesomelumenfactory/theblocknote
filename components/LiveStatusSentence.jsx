import { useEffect, useState } from 'react'
import { randomKind, sendHeartbeat } from '../services/LiveVisits'

export default function LiveStatusSentence({ className = '' }) {
  const [count, setCount] = useState(null)
  const [kind, setKind] = useState(randomKind)

  useEffect(() => {
    sendHeartbeat().then((value) => {
      if (Number.isFinite(value)) setCount(value)
    })
    const onCount = (event) => {
      if (Number.isFinite(event.detail)) setCount(event.detail)
    }
    window.addEventListener('theblocknote:live-visits', onCount)
    return () => window.removeEventListener('theblocknote:live-visits', onCount)
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setKind((current) => {
        let next = randomKind()
        while (next === current) next = randomKind()
        return next
      })
    }, 3500)
    return () => window.clearInterval(timer)
  }, [])

  const displayCount = Number.isFinite(count) ? count : '—'

  return (
    <p className={className}>
      Currently over{' '}
      <span className="text-green-300 tabular-nums">{displayCount}</span>
      {' '}of{' '}
      <span className="text-orange-300">{kind}</span>
    </p>
  )
}
