import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Anchor, Clock, Download, Loader2, RefreshCw, Send, ShieldCheck, ShieldAlert } from 'lucide-react'
import GlassCard from '../components/GlassCard'
import { windowMotion } from '../services/introMotion'
import {
  FREE_NOTE_MAX,
  FREE_NOTE_RELAYS,
  fetchFreeNotes,
  getFreeNoteIdentity,
  postFreeNote,
  resolveAnchorStatuses,
  upgradeLocalProofs,
} from '../services/freeNotes'
import { useLanguage } from '../src/i18n/LanguageContext'

function shortKey(hex) {
  return hex ? `${hex.slice(0, 8)}…${hex.slice(-4)}` : ''
}

function downloadProof(eventId, proof) {
  const url = URL.createObjectURL(new Blob([proof], { type: 'application/octet-stream' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `theblocknote-${eventId.slice(0, 12)}.ots`
  link.click()
  URL.revokeObjectURL(url)
}

function StatusBadge({ status, t, locale }) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1.5 text-white/40">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {t('freeNotes.statusChecking')}
      </span>
    )
  }
  if (status.status === 'anchored') {
    return (
      <a
        href={`https://mempool.space/block/${status.blockHash}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 font-semibold text-[color:var(--theme-accent-soft)] hover:underline"
      >
        <ShieldCheck className="w-3.5 h-3.5" />
        {t('freeNotes.statusAnchored', { height: Number(status.height).toLocaleString(locale) })}
      </a>
    )
  }
  if (status.status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1.5 text-white/55">
        <Clock className="w-3.5 h-3.5" />
        {t('freeNotes.statusPending')}
      </span>
    )
  }
  if (status.status === 'invalid') {
    return (
      <span className="inline-flex items-center gap-1.5 text-red-300">
        <ShieldAlert className="w-3.5 h-3.5" />
        {t('freeNotes.statusInvalid')}
      </span>
    )
  }
  if (status.status === 'unverified') {
    return <span className="text-white/45">{t('freeNotes.statusUnverified')}</span>
  }
  return <span className="text-white/35">{t('freeNotes.statusNone')}</span>
}

export default function FreeNotesPage() {
  const { t, locale } = useLanguage()
  const identity = useMemo(() => getFreeNoteIdentity(), [])

  const [draft, setDraft] = useState('')
  const [step, setStep] = useState(null)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [notes, setNotes] = useState([])
  const [statuses, setStatuses] = useState(new Map())
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)

  const refresh = useCallback(async ({ upgrade = false } = {}) => {
    setLoading(true)
    try {
      if (upgrade) {
        setChecking(true)
        const anchored = await upgradeLocalProofs()
        if (anchored > 0) setNotice(t('freeNotes.newlyAnchored', { count: anchored }))
      }
      const fetched = await fetchFreeNotes()
      setNotes(fetched)
      setStatuses(await resolveAnchorStatuses(fetched))
    } catch (err) {
      console.error(err)
      setError(err.message || t('freeNotes.loadFailed'))
    } finally {
      setLoading(false)
      setChecking(false)
    }
  }, [t])

  useEffect(() => {
    refresh({ upgrade: true })
  }, [refresh])

  const handlePost = async () => {
    setError(null)
    setNotice(null)
    try {
      const { event, relays } = await postFreeNote(draft, setStep)
      setDraft('')
      setNotice(t('freeNotes.posted', { relays }))
      setNotes((prev) => [event, ...prev.filter((n) => n.id !== event.id)])
      setStatuses((prev) => new Map(prev).set(event.id, { status: 'pending' }))
    } catch (err) {
      console.error(err)
      setError(err.message || t('freeNotes.postFailed'))
    } finally {
      setStep(null)
    }
  }

  const busy = Boolean(step)
  const remaining = FREE_NOTE_MAX - draft.length

  return (
    <motion.div
      {...windowMotion({ delay: 0.15, duration: 0.7, ease: [0.4, 0, 0.2, 1] })}
      className="w-full px-4 sm:px-6 lg:px-8 pt-4 pb-16"
    >
      <div className="max-w-4xl mx-auto space-y-6">
        <GlassCard className="p-6 md:p-8">
          <div className="flex items-center gap-2 text-white/50 text-xs uppercase tracking-[0.18em] mb-2">
            <Anchor className="w-3.5 h-3.5 text-[color:var(--theme-accent)]" />
            {t('freeNotes.eyebrow')}
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-white">{t('freeNotes.title')}</h2>
          <p className="text-white/60 mt-2 leading-relaxed">{t('freeNotes.lead')}</p>
          <ol className="mt-4 space-y-1 text-sm text-white/55 list-decimal list-inside">
            <li>{t('freeNotes.howSign')}</li>
            <li>{t('freeNotes.howRelays', { count: FREE_NOTE_RELAYS.length })}</li>
            <li>{t('freeNotes.howStamp')}</li>
            <li>{t('freeNotes.howVerify')}</li>
          </ol>
          <p className="text-white/40 text-xs mt-4 font-mono break-all">
            {t('freeNotes.identity', { key: shortKey(identity.pubkey) })}
          </p>
        </GlassCard>

        <GlassCard className="p-6 md:p-8 space-y-3">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, FREE_NOTE_MAX))}
            placeholder={t('freeNotes.placeholder')}
            rows={3}
            className="w-full px-4 py-3 rounded-2xl border border-[color:var(--theme-inset-border)] bg-[color:var(--theme-inset-bg)] text-white placeholder-white/40 resize-none focus:outline-none focus:border-[color:var(--theme-card-border)]"
          />
          <div className="flex items-center justify-between gap-3">
            <span className={`text-xs tabular-nums ${remaining < 20 ? 'text-orange-300' : 'text-white/40'}`}>
              {t('freeNotes.remaining', { count: remaining })}
            </span>
            <button
              type="button"
              onClick={handlePost}
              disabled={busy || !draft.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--theme-accent-strong)] text-black font-semibold px-5 py-2.5 text-sm hover:brightness-110 disabled:opacity-40"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {step === 'publishing'
                ? t('freeNotes.stepPublishing')
                : step === 'stamping'
                  ? t('freeNotes.stepStamping')
                  : t('freeNotes.post')}
            </button>
          </div>
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          {notice ? <p className="text-sm text-[color:var(--theme-accent-soft)]">{notice}</p> : null}
        </GlassCard>

        <GlassCard className="p-6 md:p-8">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="text-lg font-bold text-white">{t('freeNotes.feedTitle')}</h3>
            <button
              type="button"
              onClick={() => refresh({ upgrade: true })}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 text-white border border-white/10 hover:bg-white/20 disabled:opacity-40 text-sm"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {checking ? t('freeNotes.checking') : t('freeNotes.refresh')}
            </button>
          </div>

          {loading && notes.length === 0 ? (
            <p className="text-sm text-white/40 py-6 text-center">{t('freeNotes.loading')}</p>
          ) : notes.length === 0 ? (
            <p className="text-sm text-white/40 py-6 text-center">{t('freeNotes.empty')}</p>
          ) : (
            <ul className="space-y-3">
              {notes.map((note) => {
                const status = statuses.get(note.id)
                const mine = note.pubkey === identity.pubkey
                return (
                  <li key={note.id} className="rounded-2xl bg-white/5 border border-white/10 p-4">
                    <p className="text-white text-base leading-relaxed break-words whitespace-pre-wrap">
                      {note.content}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      <StatusBadge status={status} t={t} locale={locale} />
                      <span className="text-white/40 tabular-nums">
                        {new Date(note.created_at * 1000).toLocaleString(locale)}
                      </span>
                      <span className="text-white/40 font-mono">
                        {mine ? t('freeNotes.you') : shortKey(note.pubkey)}
                      </span>
                      {status?.proof ? (
                        <button
                          type="button"
                          onClick={() => downloadProof(note.id, status.proof)}
                          className="inline-flex items-center gap-1 text-white/50 hover:text-white"
                        >
                          <Download className="w-3.5 h-3.5" />
                          {t('freeNotes.downloadProof')}
                        </button>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </GlassCard>
      </div>
    </motion.div>
  )
}
