import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity,
  Blocks,
  ChevronDown,
  ChevronUp,
  Clock,
  Gauge,
  Loader2,
  MessageCircle,
  MessageSquareText,
  Radio,
  Zap,
} from 'lucide-react'
import GlassCard from '../components/GlassCard'
import { windowMotion } from '../services/introMotion'
import { useChainTip, subscribeChainTip } from '../services/ChainTipStore'
import {
  BLOCKS_PAGE_SIZE,
  fetchNetworkSnapshot,
  fetchRecentBlocks,
  formatBlockTime,
  formatBytes,
  formatDifficulty,
  formatHashrate,
  relativeBlockAge,
} from '../services/NetworkPulse'
import { indexProtocolNotesByBlockTime } from '../services/immutableProtocol'
import { loadImmutableRecords, subscribeImmutables } from '../services/ImmutablesStore'
import immutablesData, { immutablesState } from 'virtual:immutables'
import { useLanguage } from '../src/i18n/LanguageContext'

const REFRESH_MS = 20_000

function formatAge(age, t) {
  if (!age) return '—'
  if (age.unit === 'seconds') return t('network.ageSeconds', { count: age.value })
  if (age.unit === 'minutes') return t('network.ageMinutes', { count: age.value })
  return t('network.ageHours', { count: age.value })
}

/** Merge batches by height, newest first. Prefer rows from `preferred` on conflict. */
function mergeBlocks(preferred, existing) {
  const byHeight = new Map()
  for (const block of preferred) {
    if (block && Number.isFinite(block.height)) byHeight.set(block.height, block)
  }
  for (const block of existing) {
    if (block && Number.isFinite(block.height) && !byHeight.has(block.height)) {
      byHeight.set(block.height, block)
    }
  }
  return [...byHeight.values()].sort((a, b) => b.height - a.height)
}

export default function NetworkPage() {
  const tip = useChainTip()
  const { t, locale } = useLanguage()
  const [blocks, setBlocks] = useState([])
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState(null)
  const [flashHeight, setFlashHeight] = useState(null)
  const [now, setNow] = useState(Date.now())
  const [protocolRecords, setProtocolRecords] = useState([])
  const sentinelRef = useRef(null)
  const loadingMoreRef = useRef(false)
  const blocksRef = useRef(blocks)
  blocksRef.current = blocks

  const notesByTime = useMemo(
    () => indexProtocolNotesByBlockTime(protocolRecords),
    [protocolRecords]
  )

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true)
    try {
      const [tipBlocks, nextSnapshot] = await Promise.all([
        fetchRecentBlocks(BLOCKS_PAGE_SIZE),
        fetchNetworkSnapshot(),
      ])
      setBlocks((prev) => (quiet ? mergeBlocks(tipBlocks, prev) : tipBlocks))
      if (!quiet) setHasMore(true)
      setSnapshot(nextSnapshot)
      setError(null)
    } catch (err) {
      console.error('Network pulse failed:', err)
      setError(err.message || t('network.error'))
    } finally {
      setLoading(false)
    }
  }, [t])

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || loading) return
    const current = blocksRef.current
    const oldest = current[current.length - 1]
    if (!oldest || oldest.height <= 0) {
      setHasMore(false)
      return
    }

    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const older = await fetchRecentBlocks(BLOCKS_PAGE_SIZE, oldest.height - 1)
      if (older.length === 0) {
        setHasMore(false)
        return
      }
      setBlocks((prev) => mergeBlocks(prev, older))
      const nextOldest = Math.min(...older.map((b) => b.height))
      if (nextOldest <= 0 || older.length < BLOCKS_PAGE_SIZE) {
        setHasMore(nextOldest > 0)
      }
    } catch (err) {
      console.error('Network blocks page failed:', err)
      setError(err.message || t('network.error'))
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [loading, t])

  useEffect(() => {
    refresh()
    const poll = window.setInterval(() => refresh({ quiet: true }), REFRESH_MS)
    const clock = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => {
      window.clearInterval(poll)
      window.clearInterval(clock)
    }
  }, [refresh])

  useEffect(() => {
    let cancelled = false
    loadImmutableRecords(immutablesData, immutablesState).then((records) => {
      if (!cancelled) setProtocolRecords(records)
    })
    const stop = subscribeImmutables((records) => {
      if (!cancelled) setProtocolRecords(records)
    })
    return () => {
      cancelled = true
      stop()
    }
  }, [])

  useEffect(() => {
    const previousRef = { current: tip }
    return subscribeChainTip((next) => {
      const previous = previousRef.current
      if (Number.isFinite(previous) && Number.isFinite(next) && next > previous) {
        setFlashHeight(next)
        refresh({ quiet: true })
        window.setTimeout(() => {
          setFlashHeight((current) => (current === next ? null : current))
        }, 4_000)
      }
      previousRef.current = next
    })
  }, [refresh, tip])

  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasMore) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMore()
        }
      },
      { root: null, rootMargin: '240px 0px', threshold: 0 }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, loadMore, blocks.length])

  const liveTip = snapshot?.tip ?? tip
  const tipLabel = Number.isFinite(liveTip) ? liveTip.toLocaleString(locale) : '—'
  const newest = blocks[0] || null
  const newestAge = newest ? relativeBlockAge(newest.timestamp, now) : null

  return (
    <motion.div
      {...windowMotion({
        delay: 0.15,
        duration: 0.7,
        ease: [0.4, 0, 0.2, 1],
      })}
      className="w-full px-4 sm:px-6 lg:px-8 pt-4 pb-16"
    >
      <div className="max-w-6xl mx-auto space-y-6">
        <GlassCard className="relative overflow-hidden p-6 md:p-8">
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              background:
                'radial-gradient(ellipse at 12% 0%, rgba(247,147,26,0.22), transparent 42%), radial-gradient(ellipse at 88% 20%, rgba(255,255,255,0.08), transparent 36%)',
            }}
          />
          <div className="relative">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-2 text-white/50 text-xs uppercase tracking-[0.18em] mb-2">
                  <Radio className={`w-3.5 h-3.5 ${loading ? 'animate-pulse text-[color:var(--theme-accent)]' : 'text-[color:var(--theme-accent)]'}`} />
                  {t('network.live')}
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-white">{t('network.title')}</h2>
                <p className="text-white/60 mt-2 max-w-2xl leading-relaxed">{t('network.lead')}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 min-w-[9.5rem]">
                <div className="text-[10px] uppercase tracking-wide text-white/40">{t('network.chainTip')}</div>
                <div className="text-2xl font-semibold text-white tabular-nums mt-1">{tipLabel}</div>
                {newestAge ? (
                  <div className="text-xs text-white/45 mt-1">{formatAge(newestAge, t)}</div>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat
                icon={Activity}
                label={t('network.hashrate')}
                value={formatHashrate(snapshot?.hashrate, locale)}
              />
              <Stat
                icon={Gauge}
                label={t('network.difficulty')}
                value={formatDifficulty(snapshot?.difficulty, locale)}
              />
              <Stat
                icon={Clock}
                label={t('network.epoch')}
                value={
                  Number.isFinite(snapshot?.progressPercent)
                    ? t('network.epochValue', {
                        percent: snapshot.progressPercent.toFixed(1),
                        remaining: Number.isFinite(snapshot.remainingBlocks)
                          ? snapshot.remainingBlocks.toLocaleString(locale)
                          : '—',
                      })
                    : '—'
                }
              />
              <Stat
                icon={Zap}
                label={t('network.fastFee')}
                value={
                  Number.isFinite(snapshot?.fees?.fastest)
                    ? t('network.feeValue', { rate: snapshot.fees.fastest })
                    : '—'
                }
              />
            </div>

            {Number.isFinite(snapshot?.progressPercent) ? (
              <div className="mt-5">
                <div className="flex items-center justify-between text-xs text-white/45 mb-2">
                  <span>{t('network.difficultyProgress')}</span>
                  <span className="tabular-nums">
                    {snapshot.progressPercent.toFixed(2)}%
                    {Number.isFinite(snapshot.difficultyChange)
                      ? ` · ${snapshot.difficultyChange >= 0 ? '+' : ''}${snapshot.difficultyChange.toFixed(2)}%`
                      : ''}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-orange-500 to-orange-300 transition-all duration-700"
                    style={{ width: `${Math.min(100, Math.max(2, snapshot.progressPercent))}%` }}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </GlassCard>

        <GlassCard className="p-6 md:p-8">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-3">
              <Blocks className="w-5 h-5 text-[color:var(--theme-accent)]" />
              <div>
                <h3 className="text-xl font-bold text-white">{t('network.blocksTitle')}</h3>
                <p className="text-white/50 text-sm">{t('network.blocksLead')}</p>
              </div>
            </div>
            {loading ? <Loader2 className="w-5 h-5 text-[color:var(--theme-accent)] animate-spin" /> : null}
          </div>

          {error ? (
            <p className="text-red-300 text-sm mb-4">{error}</p>
          ) : null}

          {!loading && blocks.length === 0 && !error ? (
            <p className="text-white/50 text-sm py-8 text-center">{t('network.blocksEmpty')}</p>
          ) : null}

          <ul className="space-y-3">
            <AnimatePresence initial={false}>
              {blocks.map((block, index) => {
                const highlighted = flashHeight === block.height
                const age = relativeBlockAge(block.timestamp, now)
                const notes = notesByTime.get(block.timestamp) || []
                return (
                  <motion.li
                    key={block.id || block.height}
                    layout
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: Math.min(index, 6) * 0.03 }}
                    className={`rounded-2xl border px-4 py-3 transition-colors ${
                      highlighted
                        ? 'border-[color:var(--theme-accent-strong)] bg-[color:var(--theme-accent-strong)]/15'
                        : 'border-white/10 bg-white/5'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <a
                            href={`https://mempool.space/block/${block.height}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-lg font-semibold text-white tabular-nums hover:text-[color:var(--theme-accent-soft)]"
                          >
                            {t('network.blockHeight', {
                              height: block.height.toLocaleString(locale),
                            })}
                          </a>
                          {highlighted ? (
                            <span className="text-[10px] uppercase tracking-wide font-semibold text-[color:var(--theme-accent-soft)]">
                              {t('network.newBlock')}
                            </span>
                          ) : null}
                          {notes.length > 0 ? (
                            <span className="text-[10px] uppercase tracking-wide text-white/45">
                              {notes.length === 1
                                ? t('network.notesCount', { count: notes.length })
                                : t('network.notesCountPlural', { count: notes.length })}
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-white/40 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                          <span>{formatBlockTime(block.timestamp)}</span>
                          <span>{formatAge(age, t)}</span>
                          {block.pool ? <span>{t('network.pool', { name: block.pool })}</span> : null}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3 md:gap-4 text-right shrink-0">
                        <Metric
                          label={t('network.transactions')}
                          value={block.txCount.toLocaleString(locale)}
                        />
                        <Metric
                          label={t('network.size')}
                          value={formatBytes(block.size, locale)}
                        />
                        <Metric
                          label={t('network.medianFee')}
                          value={
                            Number.isFinite(block.medianFee)
                              ? t('network.feeValue', { rate: Math.round(block.medianFee) })
                              : '—'
                          }
                        />
                      </div>
                    </div>

                    {notes.length > 0 ? (
                      <ul className="mt-3 space-y-1.5 border-t border-white/10 pt-3">
                        {notes.map((note) => (
                          <ProtocolNoteRow key={note.index} note={note} t={t} />
                        ))}
                      </ul>
                    ) : null}
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>

          {blocks.length > 0 ? (
            <div ref={sentinelRef} className="pt-5 flex flex-col items-center gap-2 min-h-[2.5rem]">
              {loadingMore ? (
                <>
                  <Loader2 className="w-5 h-5 text-[color:var(--theme-accent)] animate-spin" />
                  <span className="text-xs text-white/40">{t('network.blocksLoadingMore')}</span>
                </>
              ) : null}
              {!hasMore && !loadingMore ? (
                <span className="text-xs text-white/35">{t('network.blocksEnd')}</span>
              ) : null}
            </div>
          ) : null}
        </GlassCard>
      </div>
    </motion.div>
  )
}

function ProtocolNoteRow({ note, t }) {
  const href = note.txid ? `https://mempool.space/tx/${note.txid}` : null
  let Icon = MessageSquareText
  let label = note.text || ''
  let tone = 'text-white/70'

  if (note.kind === 'vote_up') {
    Icon = ChevronUp
    tone = 'text-emerald-300/90'
    label = note.targetText
      ? t('network.noteVoteUp', { target: note.targetText })
      : t('network.noteVoteUpUnknown')
  } else if (note.kind === 'vote_down') {
    Icon = ChevronDown
    tone = 'text-rose-300/90'
    label = note.targetText
      ? t('network.noteVoteDown', { target: note.targetText })
      : t('network.noteVoteDownUnknown')
  } else if (note.kind === 'comment') {
    Icon = MessageCircle
    label = t('network.noteComment', { text: note.text || '' })
  } else {
    label = t('network.noteMessage', { text: note.text || '' })
  }

  const content = (
    <>
      <Icon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${tone}`} />
      <span className={`min-w-0 break-words ${tone}`}>{label}</span>
    </>
  )

  if (href) {
    return (
      <li>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start gap-2 text-sm hover:text-[color:var(--theme-accent-soft)] transition-colors"
          title={t('network.viewTx')}
        >
          {content}
        </a>
      </li>
    )
  }

  return <li className="flex items-start gap-2 text-sm">{content}</li>
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-2 text-white/40 text-xs uppercase tracking-wide">
        <Icon className="w-3.5 h-3.5 text-[color:var(--theme-accent)]" />
        {label}
      </div>
      <div className="text-white font-semibold tabular-nums mt-2 text-base md:text-lg break-words">
        {value}
      </div>
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-white/35">{label}</div>
      <div className="text-sm font-semibold text-white tabular-nums mt-0.5">{value}</div>
    </div>
  )
}
