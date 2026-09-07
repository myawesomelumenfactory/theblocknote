import { useEffect, useState } from 'react'
import { randomKindIndex, sendHeartbeat } from '../services/LiveVisits'
import { useLanguage } from '../src/i18n/LanguageContext'

export default function LiveStatusSentence({ className = '' }) {
  const { t } = useLanguage()
  const kinds = t('live.kinds')
  const [count, setCount] = useState(null)
  const [kindIndex, setKindIndex] = useState(randomKindIndex)

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
      setKindIndex((current) => {
        const total = Array.isArray(kinds) ? kinds.length : 1
        let next = randomKindIndex(total)
        while (next === current) next = randomKindIndex(total)
        return next
      })
    }, 3500)
    return () => window.clearInterval(timer)
  }, [kinds])

  const displayCount = Number.isFinite(count) ? count : '—'
  const kind = Array.isArray(kinds) ? kinds[kindIndex % kinds.length] : kinds

  return (
    <p className={className}>
      {t('live.currentlyOver')}{' '}
      <span className="text-green-300 tabular-nums">{displayCount}</span>
      {' '}{t('live.of')}{' '}
      <span className="text-orange-300">{kind}</span>
    </p>
  )
}
