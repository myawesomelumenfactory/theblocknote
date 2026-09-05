import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Radio } from 'lucide-react'
import Header from '../components/Header'
import GlassCard from '../components/GlassCard'
import { randomKind, sendHeartbeat } from '../services/LiveVisits'

export default function StatusPage() {
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
    <>
      <Header />
      <div className="w-full px-4 sm:px-6 lg:px-8 pt-4 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
        >
          <GlassCard className="p-8 md:p-12 min-h-[280px] flex flex-col items-center justify-center text-center">
            <div className="flex items-center gap-3 mb-8">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-green-400" />
              </span>
              <Radio className="w-6 h-6 text-blue-400" />
              <h2 className="text-2xl font-bold text-white">Status</h2>
            </div>
            <p className="text-3xl md:text-5xl font-semibold text-white leading-tight max-w-4xl">
              Currently over{' '}
              <span className="text-green-300 tabular-nums">{displayCount}</span>
              {' '}of{' '}
              <span className="text-orange-300">{kind}</span>
            </p>
            <p className="text-white/40 text-sm mt-8 max-w-xl">
              A live visit is any open client: a person, a browser tab, a robot, or anything else that is here right now.
            </p>
          </GlassCard>
        </motion.div>
      </div>
    </>
  )
}
