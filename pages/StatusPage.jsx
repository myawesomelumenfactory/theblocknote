import { useEffect, useState } from 'react'
import { Activity, RefreshCw } from 'lucide-react'
import GlassCard from '../components/GlassCard'
import {
  getImmutablesProgress,
  loadImmutableRecords,
  restartImmutablesCatchUp,
  subscribeImmutablesProgress,
} from '../services/ImmutablesStore'
import { applyChainTip, refreshChainTip, useChainTip } from '../services/ChainTipStore'
import { mempoolTipHeight } from '../services/ImmutableLiveFill'
import immutablesData, { immutablesState } from 'virtual:immutables'
import { useLanguage } from '../src/i18n/LanguageContext'

function formatHeight(value, locale) {
  return Number.isFinite(value) ? value.toLocaleString(locale) : '—'
}

function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')
}

export default function StatusPage() {
  const chainTip = useChainTip()
  const { t, locale } = useLanguage()
  const [progress, setProgress] = useState(() => getImmutablesProgress())
  const [restarting, setRestarting] = useState(false)

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

  useEffect(() => {
    let cancelled = false
    const checkTip = async () => {
      const [, explorerTip] = await Promise.all([
        refreshChainTip(),
        mempoolTipHeight().catch(() => 0),
      ])
      if (cancelled) return
      applyChainTip(explorerTip)
    }
    checkTip()
    const tipPoll = window.setInterval(checkTip, 8_000)
    return () => {
      cancelled = true
      window.clearInterval(tipPoll)
    }
  }, [])

  useEffect(() => {
    if (!Number.isFinite(chainTip) || !Number.isFinite(progress.lastHeight)) return
    if (chainTip <= progress.lastHeight) return
    loadImmutableRecords(immutablesData, immutablesState)
  }, [chainTip, progress.lastHeight])

  const handleRestart = async () => {
    setRestarting(true)
    try {
      await Promise.all([
        refreshChainTip(),
        mempoolTipHeight().then(applyChainTip).catch(() => 0),
      ])
      restartImmutablesCatchUp(immutablesData, immutablesState)
      setProgress(getImmutablesProgress())
    } catch (error) {
      console.error('Failed to restart immutables catch-up:', error)
    } finally {
      setRestarting(false)
      setProgress(getImmutablesProgress())
    }
  }

  const lastHeight = progress.lastHeight
  const remaining =
    Number.isFinite(chainTip) && Number.isFinite(lastHeight)
      ? Math.max(0, chainTip - lastHeight)
      : null
  const caughtUp =
    Number.isFinite(chainTip) && Number.isFinite(lastHeight) && lastHeight >= chainTip
  const startHeight = progress.startHeight ?? lastHeight
  const catchUpSpan =
    Number.isFinite(chainTip) && Number.isFinite(startHeight)
      ? Math.max(1, chainTip - startHeight)
      : 1
  const catchUpDone =
    Number.isFinite(lastHeight) && Number.isFinite(startHeight)
      ? Math.max(0, lastHeight - startHeight)
      : 0
  const percent = caughtUp || remaining === 0
    ? 100
    : Math.min(100, (catchUpDone / catchUpSpan) * 100)

  const label = progress.error
    ? t('status.paused')
    : progress.scanning
      ? t('status.catchingUp')
      : caughtUp
        ? t('status.caughtUp')
        : t('status.checking')

  const chainTipHref = Number.isFinite(chainTip)
    ? `https://mempool.space/block/${chainTip}`
    : 'https://mempool.space'

  const canRestart = Number.isFinite(lastHeight) && !restarting

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 pt-4 pb-16">
        <GlassCard className="max-w-3xl mx-auto p-6 md:p-8">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-bold text-white">{t('status.title')}</h2>
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
          <p className="text-sm text-white/50 tabular-nums mb-6">
            {t('status.percent', { percent: percent.toFixed(1) })}
            {Number.isFinite(remaining)
              ? ` · ${t(remaining === 1 ? 'status.remaining' : 'status.remainingPlural', { count: formatHeight(remaining, locale) })}`
              : ''}
          </p>

          <button
            type="button"
            onClick={handleRestart}
            disabled={!canRestart}
            title={t('status.restartHint', { height: formatHeight(lastHeight, locale) })}
            className={`mb-8 inline-flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
              !canRestart
                ? 'cursor-not-allowed bg-white/5 text-white/40 border-white/10'
                : 'cursor-pointer bg-[color:var(--theme-accent-strong)]/80 text-white border-white/20 hover:opacity-95'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${restarting || progress.scanning ? 'animate-spin' : ''}`} />
            {restarting ? t('status.restarting') : t('status.restart')}
          </button>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label={t('status.indexedHeight')} value={formatHeight(lastHeight, locale)} />
            <Stat
              label={t('status.chainTip')}
              value={formatHeight(chainTip, locale)}
              href={chainTipHref}
              title={t('status.latestBlock')}
            />
            <Stat label={t('status.messages')} value={formatHeight(progress.count, locale)} />
            <Stat label={t('status.foundThisPass')} value={formatHeight(progress.addedThisRun, locale)} />
          </div>

          <dl className="mt-8 space-y-3 text-sm">
            <Row label={t('status.baked')} value={t('status.bakedValue', { height: formatHeight(immutablesState?.lastHeight, locale), count: formatHeight(immutablesState?.count, locale) })} />
            <Row label={t('status.storage')} value={progress.scanning ? t('status.storageUpdating') : t('status.storageHolding')} />
            <Row label={t('status.lastUpdated')} value={formatTime(progress.updatedAt)} />
            {progress.error ? <Row label={t('status.error')} value={progress.error} /> : null}
          </dl>
        </GlassCard>
      </div>
  )
}

function Stat({ label, value, href, title }) {
  const number = (
    <div className="text-xl md:text-2xl font-semibold text-white tabular-nums mt-1">{value}</div>
  )
  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
      <div className="text-xs uppercase tracking-wide text-white/40">{label}</div>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title={title}
          className="hover:text-orange-300"
        >
          {number}
        </a>
      ) : (
        number
      )}
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
