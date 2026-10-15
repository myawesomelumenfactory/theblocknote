import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Clock, ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react'
import GlassCard from '../components/GlassCard'
import { ANCHOR_TOPICS, anchorItemFromEvent, fetchAnchorQueue, fetchLatestBlock } from '../services/anchors'
import { resolveDeclarationStatuses, subscribeLiveNotes } from '../services/declarations'
import { gatewayUrl } from '../services/ipfs'
import { useLanguage } from '../src/i18n/LanguageContext'

const WINDOW_SECONDS = 7 * 24 * 3600
const RECHECK_EVERY_MS = 2 * 60 * 1000
const RECENT_ANCHORED = 25

function formatDuration(seconds, t) {
  const minutes = Math.max(0, Math.round(seconds / 60))
  if (minutes < 60) return t('anchors.minutes', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return t('anchors.hours', { hours, minutes: minutes % 60 })
  return t('anchors.days', { count: Math.floor(hours / 24) })
}

function median(values) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export default function AnchorsPage() {
  const { t, locale } = useLanguage()
  const [items, setItems] = useState([])
  const [statuses, setStatuses] = useState(new Map())
  const [latestBlock, setLatestBlock] = useState(null)
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [checkedAt, setCheckedAt] = useState(null)
  const [now, setNow] = useState(() => Date.now() / 1000)

  const mergeStatuses = useCallback((next) => {
    setStatuses((prev) => {
      const merged = new Map(prev)
      for (const [id, status] of next) merged.set(id, status)
      return merged
    })
  }, [])

  const itemsRef = useRef(items)
  itemsRef.current = items
  const statusesRef = useRef(statuses)
  statusesRef.current = statuses

  const recheck = useCallback(
    async (list, minIntervalMs) => {
      if (list.length === 0) return
      setChecking(true)
      try {
        mergeStatuses(await resolveDeclarationStatuses(list, { minIntervalMs }))
        setCheckedAt(Date.now())
      } finally {
        setChecking(false)
      }
    },
    [mergeStatuses],
  )

  const refreshBlock = useCallback(() => {
    fetchLatestBlock()
      .then((block) => block && setLatestBlock(block))
      .catch((err) => console.warn('Latest block unavailable', err))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await fetchAnchorQueue({ since: Math.floor(Date.now() / 1000) - WINDOW_SECONDS })
      setItems(list)
      setLoading(false)
      await recheck(list, 60 * 1000)
    } finally {
      setLoading(false)
    }
  }, [recheck])

  const recheckPending = useCallback(() => {
    const pending = itemsRef.current.filter((item) => statusesRef.current.get(item.eventId)?.status !== 'anchored')
    refreshBlock()
    return recheck(pending, RECHECK_EVERY_MS - 5000)
  }, [recheck, refreshBlock])

  useEffect(() => {
    load().catch((err) => console.warn('Anchor queue failed to load', err))
    refreshBlock()
  }, [load, refreshBlock])

  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) recheckPending().catch((err) => console.warn('Re-check failed', err))
    }, RECHECK_EVERY_MS)
    const tick = setInterval(() => setNow(Date.now() / 1000), 30 * 1000)
    return () => {
      clearInterval(id)
      clearInterval(tick)
    }
  }, [recheckPending])

  useEffect(
    () =>
      subscribeLiveNotes(async (event) => {
        const item = await anchorItemFromEvent(event)
        if (!item) return
        setItems((prev) => (prev.some((p) => p.eventId === item.eventId) ? prev : [item, ...prev]))
        setStatuses((prev) => new Map(prev).set(item.eventId, { status: 'pending' }))
      }, ANCHOR_TOPICS),
    [],
  )

  const pending = useMemo(
    () =>
      items
        .filter((item) => statuses.get(item.eventId)?.status !== 'anchored')
        .sort((a, b) => a.time - b.time),
    [items, statuses],
  )
  const anchored = useMemo(
    () =>
      items
        .map((item) => ({ ...item, status: statuses.get(item.eventId) }))
        .filter((item) => item.status?.status === 'anchored')
        .sort((a, b) => b.status.time - a.status.time || b.time - a.time),
    [items, statuses],
  )
  const medianDelay = useMemo(
    () => median(anchored.filter((item) => item.status.time).map((item) => Math.max(0, item.status.time - item.time))),
    [anchored],
  )
  const byCalendar = useMemo(() => {
    const counts = new Map()
    for (const item of pending) for (const host of item.calendars) counts.set(host, (counts.get(host) || 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [pending])

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 pt-4 pb-16">
      <GlassCard className="max-w-4xl mx-auto p-6 md:p-8">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white">{t('anchors.title')}</h2>
            <p className="text-white/60 mt-1">{t('anchors.lead')}</p>
          </div>
          <button
            type="button"
            onClick={() => recheckPending()}
            disabled={checking || loading}
            title={t('anchors.recheck')}
            className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-white/20 text-sm text-white/80 hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${checking || loading ? 'animate-spin' : ''}`} />
            {t('anchors.recheck')}
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label={t('anchors.pending')} value={loading ? '…' : pending.length} />
          <Stat label={t('anchors.anchoredWeek')} value={loading ? '…' : anchored.length} />
          <Stat label={t('anchors.medianDelay')} value={medianDelay == null ? '—' : formatDuration(medianDelay, t)} />
          <Stat
            label={t('anchors.lastBlock')}
            value={latestBlock ? `#${latestBlock.height.toLocaleString(locale)}` : '—'}
            hint={latestBlock ? t('anchors.ago', { duration: formatDuration(now - latestBlock.time, t) }) : null}
            href={latestBlock ? `https://mempool.space/block/${latestBlock.height}` : null}
          />
        </div>
        <p className="mt-3 text-xs text-white/40">
          {checkedAt
            ? t('anchors.checkedAt', { time: new Date(checkedAt).toLocaleTimeString(locale) })
            : t('anchors.checking')}
        </p>

        {byCalendar.length > 0 ? (
          <section className="mt-8">
            <h3 className="text-sm uppercase tracking-wide text-white/40 mb-3">{t('anchors.calendars')}</h3>
            <div className="flex flex-wrap gap-2">
              {byCalendar.map(([host, count]) => (
                <span key={host} className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm text-white/80">
                  {host} · <span className="tabular-nums">{count}</span>
                </span>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-8">
          <h3 className="text-sm uppercase tracking-wide text-white/40 mb-3">
            {t('anchors.pendingTitle')} · {pending.length}
          </h3>
          {loading ? (
            <p className="text-white/50 text-sm">{t('anchors.loading')}</p>
          ) : pending.length === 0 ? (
            <p className="text-white/50 text-sm">{t('anchors.nonePending')}</p>
          ) : (
            <ul className="divide-y divide-white/10">
              {pending.map((item) => (
                <ItemRow key={item.eventId} item={item} t={t}>
                  <span className="inline-flex items-center gap-1 text-orange-300">
                    <Clock className="w-3.5 h-3.5" />
                    {statuses.has(item.eventId)
                      ? t('anchors.waiting', { duration: formatDuration(now - item.time, t) })
                      : t('anchors.checking')}
                  </span>
                  {item.calendars.length > 0 ? <span>{item.calendars.join(' · ')}</span> : null}
                </ItemRow>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8">
          <h3 className="text-sm uppercase tracking-wide text-white/40 mb-3">{t('anchors.anchoredTitle')}</h3>
          {anchored.length === 0 ? (
            <p className="text-white/50 text-sm">{loading ? t('anchors.loading') : t('anchors.noneAnchored')}</p>
          ) : (
            <ul className="divide-y divide-white/10">
              {anchored.slice(0, RECENT_ANCHORED).map((item) => (
                <ItemRow key={item.eventId} item={item} t={t}>
                  <a
                    href={
                      item.status.txid
                        ? `https://mempool.space/tx/${item.status.txid}`
                        : `https://mempool.space/block/${item.status.blockHash || item.status.height}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-emerald-400 hover:underline"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {t('anchors.inBlock', { height: Number(item.status.height).toLocaleString(locale) })}
                  </a>
                  {item.status.time ? (
                    <span>{t('anchors.after', { duration: formatDuration(item.status.time - item.time, t) })}</span>
                  ) : null}
                </ItemRow>
              ))}
            </ul>
          )}
        </section>
      </GlassCard>
    </div>
  )
}

function ItemRow({ item, t, children }) {
  return (
    <li className="py-3 flex flex-col gap-1">
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="shrink-0 rounded-full border border-white/20 px-2 text-[11px] uppercase tracking-wide text-white/60">
          {t(`anchors.type.${item.type}`)}
        </span>
        <span className="truncate text-white/90">{item.text || '—'}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/50">
        {children}
        <span>{new Date(item.time * 1000).toLocaleString()}</span>
        {item.cid ? (
          <a
            href={gatewayUrl(item.cid)}
            target="_blank"
            rel="noopener noreferrer"
            title={item.cid}
            className="inline-flex items-center gap-1 hover:text-white"
          >
            <ExternalLink className="w-3 h-3" />
            IPFS
          </a>
        ) : null}
      </div>
    </li>
  )
}

function Stat({ label, value, hint, href }) {
  const body = (
    <>
      <div className="text-xl md:text-2xl font-semibold text-white tabular-nums mt-1">{value}</div>
      {hint ? <div className="text-xs text-white/50 mt-0.5">{hint}</div> : null}
    </>
  )
  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
      <div className="text-xs uppercase tracking-wide text-white/40">{label}</div>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="block hover:text-orange-300">
          {body}
        </a>
      ) : (
        body
      )}
    </div>
  )
}
