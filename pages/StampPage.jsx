import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Clock,
  Download,
  FileCheck,
  Fingerprint,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Stamp,
  Upload,
} from 'lucide-react'
import GlassCard from '../components/GlassCard'
import { windowMotion } from '../services/introMotion'
import { OTS_CALENDARS } from '../services/opentimestamps'
import {
  STAMP_MAX,
  createStamp,
  listStamps,
  refreshStamps,
  stampProofBytes,
  textBytes,
  verifyStampFiles,
} from '../services/stamps'
import { useLanguage } from '../src/i18n/LanguageContext'

function shortHex(hex, head = 10, tail = 6) {
  return hex && hex.length > head + tail ? `${hex.slice(0, head)}…${hex.slice(-tail)}` : hex
}

function calendarHost(url) {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function download(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

function readFile(file) {
  return file.arrayBuffer().then((buffer) => new Uint8Array(buffer))
}

function AnchorDetails({ anchor, t, locale }) {
  const script = anchor.outputScriptHex
  const at = script && anchor.commitmentHex ? script.indexOf(anchor.commitmentHex) : -1
  return (
    <div className="mt-3 rounded-xl bg-[color:var(--theme-inset-bg)] border border-[color:var(--theme-inset-border)] p-3 space-y-1.5 text-xs">
      <div className="flex flex-wrap gap-x-2">
        <span className="text-white/45">{t('stamp.block')}</span>
        <a
          href={`https://mempool.space/block/${anchor.blockHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-[color:var(--theme-accent-soft)] hover:underline"
        >
          #{Number(anchor.height).toLocaleString(locale)}
        </a>
        {anchor.time ? (
          <span className="text-white/40">· {new Date(anchor.time * 1000).toLocaleString(locale)}</span>
        ) : null}
      </div>
      {anchor.txid ? (
        <div className="flex flex-wrap gap-x-2">
          <span className="text-white/45">{t('stamp.calendarTx')}</span>
          <a
            href={`https://mempool.space/tx/${anchor.txid}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[color:var(--theme-accent-soft)] hover:underline break-all"
          >
            {shortHex(anchor.txid, 16, 8)}
          </a>
        </div>
      ) : null}
      {script ? (
        <div>
          <span className="text-white/45">
            {anchor.isOpReturn ? t('stamp.opReturn') : t('stamp.output')}
          </span>
          <p className="font-mono text-white/60 break-all mt-0.5">
            {at >= 0 ? (
              <>
                {script.slice(0, at)}
                <span className="text-[color:var(--theme-accent-soft)] font-semibold">
                  {anchor.commitmentHex}
                </span>
                {script.slice(at + anchor.commitmentHex.length)}
              </>
            ) : (
              script
            )}
          </p>
          <p className="text-white/40 mt-1">{t('stamp.opReturnHint')}</p>
        </div>
      ) : null}
    </div>
  )
}

function StatusLine({ status, t }) {
  if (status === 'anchored') {
    return (
      <span className="inline-flex items-center gap-1.5 font-semibold text-[color:var(--theme-accent-soft)]">
        <ShieldCheck className="w-3.5 h-3.5" />
        {t('stamp.statusAnchored')}
      </span>
    )
  }
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1.5 text-white/55">
        <Clock className="w-3.5 h-3.5" />
        {t('stamp.statusPending')}
      </span>
    )
  }
  if (status === 'unverified') {
    return <span className="text-white/45">{t('stamp.statusUnverified')}</span>
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-red-300">
      <ShieldAlert className="w-3.5 h-3.5" />
      {status === 'mismatch' ? t('stamp.statusMismatch') : t('stamp.statusInvalid')}
    </span>
  )
}

export default function StampPage() {
  const { t, locale } = useLanguage()

  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [stamps, setStamps] = useState(() => listStamps())
  const [checking, setChecking] = useState(false)

  const [verifyText, setVerifyText] = useState('')
  const [verifyMessageFile, setVerifyMessageFile] = useState(null)
  const [verifyProofFile, setVerifyProofFile] = useState(null)
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState(null)

  const refresh = useCallback(async () => {
    setChecking(true)
    try {
      const { stamps: next, anchored } = await refreshStamps()
      setStamps([...next])
      if (anchored > 0) setNotice(t('stamp.newlyAnchored', { count: anchored }))
    } finally {
      setChecking(false)
    }
  }, [t])

  useEffect(() => {
    if (listStamps().some((s) => s.status !== 'anchored')) refresh()
  }, [refresh])

  const handleStamp = async () => {
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      const { stamp, duplicate } = await createStamp(draft)
      setDraft('')
      setStamps(listStamps())
      setNotice(
        duplicate
          ? t('stamp.duplicate')
          : t('stamp.stamped', { count: stamp.calendars.length }),
      )
    } catch (err) {
      console.error(err)
      setError(err.message || t('stamp.stampFailed'))
    } finally {
      setBusy(false)
    }
  }

  const handleVerify = async () => {
    setVerifyResult(null)
    setVerifying(true)
    try {
      const messageBytes = verifyMessageFile ? await readFile(verifyMessageFile) : textBytes(verifyText)
      const proofBytes = await readFile(verifyProofFile)
      setVerifyResult(await verifyStampFiles(messageBytes, proofBytes))
    } catch (err) {
      console.error(err)
      setVerifyResult({ status: 'invalid', error: err.message })
    } finally {
      setVerifying(false)
    }
  }

  const remaining = STAMP_MAX - draft.length
  const canVerify = Boolean(verifyProofFile) && (Boolean(verifyMessageFile) || verifyText.length > 0)

  return (
    <motion.div
      {...windowMotion({ delay: 0.15, duration: 0.7, ease: [0.4, 0, 0.2, 1] })}
      className="w-full px-4 sm:px-6 lg:px-8 pt-4 pb-16"
    >
      <div className="max-w-4xl mx-auto space-y-6">
        <GlassCard className="p-6 md:p-8">
          <div className="flex items-center gap-2 text-white/50 text-xs uppercase tracking-[0.18em] mb-2">
            <Stamp className="w-3.5 h-3.5 text-[color:var(--theme-accent)]" />
            {t('stamp.eyebrow')}
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-white">{t('stamp.title')}</h2>
          <p className="text-white/60 mt-2 leading-relaxed">{t('stamp.lead')}</p>
          <ol className="mt-4 space-y-1 text-sm text-white/55 list-decimal list-inside">
            <li>{t('stamp.howHash')}</li>
            <li>{t('stamp.howCalendars', { calendars: OTS_CALENDARS.map(calendarHost).join(', ') })}</li>
            <li>{t('stamp.howBitcoin')}</li>
            <li>{t('stamp.howKeep')}</li>
          </ol>
          <p className="text-white/40 text-xs mt-4">{t('stamp.privacyHint')}</p>
        </GlassCard>

        <GlassCard className="p-6 md:p-8 space-y-3">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, STAMP_MAX))}
            placeholder={t('stamp.placeholder')}
            rows={4}
            className="w-full px-4 py-3 rounded-2xl border border-[color:var(--theme-inset-border)] bg-[color:var(--theme-inset-bg)] text-white placeholder-white/40 resize-none focus:outline-none focus:border-[color:var(--theme-card-border)]"
          />
          <div className="flex items-center justify-between gap-3">
            <span className={`text-xs tabular-nums ${remaining < 50 ? 'text-orange-300' : 'text-white/40'}`}>
              {t('stamp.remaining', { count: remaining })}
            </span>
            <button
              type="button"
              onClick={handleStamp}
              disabled={busy || !draft.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--theme-accent-strong)] text-black font-semibold px-5 py-2.5 text-sm hover:brightness-110 disabled:opacity-40"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Stamp className="w-4 h-4" />}
              {busy ? t('stamp.stamping') : t('stamp.submit')}
            </button>
          </div>
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          {notice ? <p className="text-sm text-[color:var(--theme-accent-soft)]">{notice}</p> : null}
        </GlassCard>

        <GlassCard className="p-6 md:p-8">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-lg font-bold text-white">{t('stamp.listTitle')}</h3>
              <p className="text-xs text-white/40 mt-0.5">{t('stamp.listHint')}</p>
            </div>
            <button
              type="button"
              onClick={refresh}
              disabled={checking || stamps.length === 0}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 text-white border border-white/10 hover:bg-white/20 disabled:opacity-40 text-sm shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
              {checking ? t('stamp.checking') : t('stamp.check')}
            </button>
          </div>

          {stamps.length === 0 ? (
            <p className="text-sm text-white/40 py-6 text-center">{t('stamp.empty')}</p>
          ) : (
            <ul className="space-y-3">
              {stamps.map((stamp) => {
                const fileBase = `stamp-${stamp.digest.slice(0, 12)}`
                return (
                  <li key={stamp.digest} className="rounded-2xl bg-white/5 border border-white/10 p-4">
                    <p className="text-white text-base leading-relaxed break-words whitespace-pre-wrap">
                      {stamp.text}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      <StatusLine status={stamp.status} t={t} />
                      <span className="text-white/40 tabular-nums">
                        {new Date(stamp.createdAt).toLocaleString(locale)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-white/40 font-mono" title={stamp.digest}>
                        <Fingerprint className="w-3.5 h-3.5" />
                        {shortHex(stamp.digest)}
                      </span>
                      {stamp.status !== 'anchored' && stamp.calendars?.length ? (
                        <span className="text-white/35">
                          {t('stamp.heldBy', { calendars: stamp.calendars.map(calendarHost).join(', ') })}
                        </span>
                      ) : null}
                    </div>
                    {stamp.anchor ? <AnchorDetails anchor={stamp.anchor} t={t} locale={locale} /> : null}
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      <button
                        type="button"
                        onClick={() => download(`${fileBase}.txt`, textBytes(stamp.text), 'text/plain')}
                        className="inline-flex items-center gap-1 text-white/50 hover:text-white"
                      >
                        <Download className="w-3.5 h-3.5" />
                        {t('stamp.downloadText')}
                      </button>
                      <button
                        type="button"
                        onClick={() => download(`${fileBase}.txt.ots`, stampProofBytes(stamp), 'application/octet-stream')}
                        className="inline-flex items-center gap-1 text-white/50 hover:text-white"
                      >
                        <Download className="w-3.5 h-3.5" />
                        {t('stamp.downloadProof')}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </GlassCard>

        <GlassCard className="p-6 md:p-8 space-y-3">
          <div>
            <h3 className="text-lg font-bold text-white">{t('stamp.verifyTitle')}</h3>
            <p className="text-sm text-white/50 mt-1">{t('stamp.verifyLead')}</p>
          </div>
          <textarea
            value={verifyText}
            onChange={(event) => {
              setVerifyText(event.target.value)
              setVerifyMessageFile(null)
            }}
            placeholder={t('stamp.verifyPlaceholder')}
            rows={3}
            className="w-full px-4 py-3 rounded-2xl border border-[color:var(--theme-inset-border)] bg-[color:var(--theme-inset-bg)] text-white placeholder-white/40 resize-none focus:outline-none focus:border-[color:var(--theme-card-border)]"
          />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 text-white border border-white/10 hover:bg-white/20 cursor-pointer">
              <Upload className="w-4 h-4" />
              {verifyMessageFile ? verifyMessageFile.name : t('stamp.pickMessage')}
              <input
                type="file"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null
                  setVerifyMessageFile(file)
                  if (file) setVerifyText('')
                }}
              />
            </label>
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 text-white border border-white/10 hover:bg-white/20 cursor-pointer">
              <Upload className="w-4 h-4" />
              {verifyProofFile ? verifyProofFile.name : t('stamp.pickProof')}
              <input
                type="file"
                accept=".ots"
                className="hidden"
                onChange={(event) => setVerifyProofFile(event.target.files?.[0] || null)}
              />
            </label>
            <button
              type="button"
              onClick={handleVerify}
              disabled={!canVerify || verifying}
              className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--theme-accent-strong)] text-black font-semibold px-5 py-2 text-sm hover:brightness-110 disabled:opacity-40"
            >
              {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck className="w-4 h-4" />}
              {t('stamp.verify')}
            </button>
          </div>
          {verifyResult ? (
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4 text-sm">
              <StatusLine status={verifyResult.status} t={t} />
              {verifyResult.digest ? (
                <p className="text-xs text-white/40 font-mono mt-1 break-all">{verifyResult.digest}</p>
              ) : null}
              {verifyResult.error ? <p className="text-xs text-red-300 mt-1">{verifyResult.error}</p> : null}
              {verifyResult.anchor ? <AnchorDetails anchor={verifyResult.anchor} t={t} locale={locale} /> : null}
            </div>
          ) : null}
        </GlassCard>
      </div>
    </motion.div>
  )
}
