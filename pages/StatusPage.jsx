import { useEffect, useState } from 'react'
import { Activity } from 'lucide-react'
import Header from '../components/Header'
import GlassCard from '../components/GlassCard'
import {
  getImmutablesProgress,
  loadImmutableRecords,
  subscribeImmutablesProgress,
} from '../services/ImmutablesStore'
import immutablesData, { immutablesState } from 'virtual:immutables'

function formatHeight(value) {
  return Number.isFinite(value) ? value.toLocaleString('en-US') : '—'
}

function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')
}

export default function StatusPage() {
  const [progress, setProgress] = useState(() => getImmutablesProgress())

  useEffect(() => {
    const stop = subscribeImmutablesProgress(setProgress)
    loadImmutableRecords(immutablesData, immutablesState)
    const poll = window.setInterval(() => {
      setProgress(getImmutablesProgress())
    }, 1000)
    return () => {
      stop()
      window.clearInterval(poll)
    }
  }, [])

  const percent = Number.isFinite(progress.percent) ? progress.percent : 0
  const label = progress.error
    ? 'Catch-up paused'
    : progress.scanning
      ? 'Catching up from mempool'
      : progress.caughtUp
        ? 'Caught up with the chain tip'
        : 'Checking the chain tip'

  return (
    <>
      <Header />
      <div className="w-full px-4 sm:px-6 lg:px-8 pt-4 pb-16">
        <GlassCard className="max-w-3xl mx-auto p-6 md:p-8">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-bold text-white">Immutables</h2>
              <p className="text-white/60 mt-1">{label}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
              <Activity className={`w-5 h-5 ${progress.scanning ? 'text-orange-400 animate-pulse' : 'text-green-300'}`} />
            </div>
          </div>

          <div className="h-3 rounded-full bg-white/10 overflow-hidden mb-2">
            <div
              className="h-full rounded-full bg-gradient-to-r from-orange-500 to-orange-400 transition-all duration-500"
              style={{ width: `${Math.max(percent, progress.scanning ? 4 : 0)}%` }}
            />
          </div>
          <p className="text-sm text-white/50 tabular-nums mb-8">
            {percent.toFixed(1)}% of this catch-up
            {Number.isFinite(progress.remaining) ? ` · ${formatHeight(progress.remaining)} block${progress.remaining === 1 ? '' : 's'} remaining` : ''}
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Indexed height" value={formatHeight(progress.lastHeight)} />
            <Stat label="Chain tip" value={formatHeight(progress.tip)} />
            <Stat label="Messages" value={formatHeight(progress.count)} />
            <Stat label="Found this pass" value={formatHeight(progress.addedThisRun)} />
          </div>

          <dl className="mt-8 space-y-3 text-sm">
            <Row label="Baked snapshot" value={`block ${formatHeight(immutablesState?.lastHeight)} · ${formatHeight(immutablesState?.count)} messages`} />
            <Row label="localStorage" value={progress.scanning ? 'Updating from mempool.space' : 'Holding the live snapshot'} />
            <Row label="Last updated" value={formatTime(progress.updatedAt)} />
            {progress.error ? <Row label="Error" value={progress.error} /> : null}
          </dl>
        </GlassCard>
      </div>
    </>
  )
}

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
      <div className="text-xs uppercase tracking-wide text-white/40">{label}</div>
      <div className="text-xl md:text-2xl font-semibold text-white tabular-nums mt-1">{value}</div>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 border-t border-white/10 pt-3">
      <dt className="text-white/40">{label}</dt>
      <dd className="text-white/80 tabular-nums">{value}</dd>
    </div>
  )
}
