import React, { useState } from 'react'
import { Inbox, Loader2, ExternalLink } from 'lucide-react'
import { fetchAddressDirectMessages } from '../services/addressImmutables'
import { isValidAddress } from '../services/BitcoinUtils'
import { useLanguage } from '../src/i18n/LanguageContext'

function formatTimestampToUTC(timestampInSeconds) {
  if (!Number.isFinite(timestampInSeconds)) return null
  const date = new Date(timestampInSeconds * 1000)
  if (Number.isNaN(date.getTime())) return null

  const yyyy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  const hh = String(date.getUTCHours()).padStart(2, '0')
  const min = String(date.getUTCMinutes()).padStart(2, '0')
  const ss = String(date.getUTCSeconds()).padStart(2, '0')

  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss} UTC`
}

export default function DirectInbox({ initialAddress = '' }) {
  const { t } = useLanguage()
  const [address, setAddress] = useState(initialAddress)
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [loadedAddress, setLoadedAddress] = useState(null)

  const trimmed = address.trim()
  const canLoad = trimmed.length > 0 && isValidAddress(trimmed)

  const handleLoad = async () => {
    if (!trimmed) {
      setError(t('direct.enterAddress'))
      return
    }
    if (!isValidAddress(trimmed)) {
      setError(t('direct.invalidAddress'))
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const records = await fetchAddressDirectMessages(trimmed)
      setMessages(records)
      setLoadedAddress(trimmed)
    } catch (err) {
      console.error('Address inbox error:', err)
      setMessages([])
      setLoadedAddress(null)
      setError(err.message || t('compose.unexpected'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Inbox className="w-6 h-6 text-[color:var(--theme-accent)]" />
        <h2 className="text-2xl font-bold text-white">{t('direct.inboxTitle')}</h2>
      </div>

      <p className="text-white/60 text-sm mb-6 leading-relaxed">{t('direct.inboxLead')}</p>

      <label className="block mb-4">
        <span className="block text-sm text-white/50 mb-2">{t('direct.inboxAddressLabel')}</span>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={t('direct.recipientPlaceholder')}
          spellCheck={false}
          autoComplete="off"
          className="theme-glass w-full px-4 py-3 rounded-2xl border border-[color:var(--theme-inset-border)] bg-[color:var(--theme-inset-bg)] text-white text-base font-mono focus:outline-none focus:bg-[color:var(--theme-chip-bg)] focus:border-[color:var(--theme-card-border)] focus:shadow-[0_0_0_3px_rgba(247,147,26,0.12)] transition-all duration-300"
        />
      </label>

      <button
        type="button"
        onClick={handleLoad}
        disabled={!canLoad || isLoading}
        className={`w-full h-12 rounded-2xl font-semibold border transition-all duration-300 mb-6 ${
          !canLoad || isLoading
            ? 'cursor-not-allowed bg-white/5 text-white/40 border-white/10'
            : 'cursor-pointer bg-white/10 text-white border-white/15 hover:bg-white/15'
        }`}
      >
        <span className="inline-flex items-center justify-center gap-2">
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {isLoading ? t('direct.inboxLoading') : t('direct.inboxLoad')}
        </span>
      </button>

      {error && (
        <div className="p-4 mb-4 text-md text-red-800 rounded-lg bg-red-50 dark:bg-red-900/20 dark:text-red-300" role="alert">
          <span className="font-bold">{t('compose.error')}</span> {error}
        </div>
      )}

      {loadedAddress && !isLoading && (
        <p className="text-white/50 text-sm mb-4">
          {messages.length === 1
            ? t('direct.inboxCount', { count: messages.length })
            : t('direct.inboxCountPlural', { count: messages.length })}
        </p>
      )}

      <div className="space-y-3">
        {messages.map((item) => {
          const when = formatTimestampToUTC(item.time)
          return (
            <article
              key={item.index}
              className="rounded-2xl bg-white/5 border border-white/10 p-4"
            >
              <p className="text-white text-base leading-relaxed break-words">
                {item.text || item.value}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/40">
                {when ? <span className="tabular-nums">{when}</span> : null}
                {Number.isFinite(item.amountPaid) ? (
                  <span className="tabular-nums">{t('direct.sats', { amount: item.amountPaid })}</span>
                ) : null}
                <a
                  href={`https://mempool.space/tx/${item.txid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[color:var(--theme-accent-soft)] hover:underline"
                >
                  {t('direct.inboxViewTx')}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </article>
          )
        })}
      </div>

      {loadedAddress && !isLoading && messages.length === 0 && !error && (
        <p className="text-white/50 text-sm">{t('direct.inboxEmpty')}</p>
      )}
    </div>
  )
}
