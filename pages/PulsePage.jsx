import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronUp, Disc3, Loader2, Radio, Search } from 'lucide-react'
import GlassCard from '../components/GlassCard'
import PulseVinyl from '../components/PulseVinyl'
import PulsePlayer from '../components/PulsePlayer'
import { windowMotion } from '../services/introMotion'
import { SharedContext } from '../src/SharedContext'
import {
  applyPulseVote,
  getHighestFundedUnit,
  validateUTXO,
} from '../services/BitcoinService'
import {
  extractSpotifyTrackId,
  fetchSpotifyTrackMeta,
  rankPulseTracks,
  searchTracks,
  spotifyEmbedUrl,
  spotifyTrackUrl,
} from '../services/spotifyPulse'
import { loadImmutableRecords, subscribeImmutables } from '../services/ImmutablesStore'
import immutablesData, { immutablesState } from 'virtual:immutables'
import { useLanguage } from '../src/i18n/LanguageContext'

const FEE = 450
const SEARCH_DEBOUNCE_MS = 350

export default function PulsePage() {
  const { t, locale } = useLanguage()
  const { refs, setCurrentIndex, ensureUtxoHex } = useContext(SharedContext)

  const [records, setRecords] = useState([])
  const [pendingVotes, setPendingVotes] = useState([])
  const [metaById, setMetaById] = useState({})
  const [draft, setDraft] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [preview, setPreview] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [searching, setSearching] = useState(false)
  const [voting, setVoting] = useState(false)
  const [votingTrackId, setVotingTrackId] = useState(null)
  const [error, setError] = useState(null)
  const [lastTx, setLastTx] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const searchSeq = useRef(0)

  const fundedUnit = getHighestFundedUnit(refs, FEE)
  const hasFundedUnit = Boolean(fundedUnit)

  useEffect(() => {
    let cancelled = false
    loadImmutableRecords(immutablesData, immutablesState).then((rows) => {
      if (!cancelled) setRecords(rows)
    })
    const stop = subscribeImmutables((rows) => {
      if (!cancelled) setRecords(rows)
    })
    return () => {
      cancelled = true
      stop()
    }
  }, [])

  const mergedRecords = useMemo(
    () => [...records, ...pendingVotes],
    [records, pendingVotes]
  )

  const chart = useMemo(
    () => rankPulseTracks(mergedRecords, metaById),
    [mergedRecords, metaById]
  )

  const selected =
    preview && (preview.trackId === selectedId || (!preview.trackId && preview.itunesId === selectedId))
      ? preview
      : chart.find((row) => row.trackId === selectedId) || chart[0] || preview || null

  // Hydrate metadata for ranked tracks (oEmbed, no API key).
  useEffect(() => {
    let cancelled = false
    const missing = chart
      .map((row) => row.trackId)
      .filter((id) => id && !metaById[id])
      .slice(0, 12)

    if (missing.length === 0) return undefined

    ;(async () => {
      for (const trackId of missing) {
        if (cancelled) return
        try {
          const meta = await fetchSpotifyTrackMeta(trackId)
          if (cancelled) return
          setMetaById((prev) => (prev[trackId] ? prev : { ...prev, [trackId]: meta }))
        } catch {
          /* skip unavailable tracks */
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [chart, metaById])

  // Auto-select top track when chart appears.
  useEffect(() => {
    if (!selectedId && chart[0]?.trackId) {
      setSelectedId(chart[0].trackId)
      setPlaying(true)
    }
  }, [chart, selectedId])

  // Debounced live search as the user types.
  useEffect(() => {
    const q = draft.trim()
    if (q.length < 2) {
      setSuggestions([])
      setSearching(false)
      setMenuOpen(false)
      return undefined
    }

    // Exact Spotify URL / id — resolve immediately without waiting.
    if (extractSpotifyTrackId(q)) {
      const seq = ++searchSeq.current
      setSearching(true)
      searchTracks(q, { limit: 1 })
        .then((result) => {
          if (seq !== searchSeq.current) return
          setSuggestions(result.tracks || [])
          setMenuOpen((result.tracks || []).length > 0)
          setError(null)
        })
        .catch(() => {
          if (seq !== searchSeq.current) return
          setSuggestions([])
        })
        .finally(() => {
          if (seq === searchSeq.current) setSearching(false)
        })
      return undefined
    }

    const timer = window.setTimeout(() => {
      const seq = ++searchSeq.current
      setSearching(true)
      searchTracks(q, { limit: 8 })
        .then((result) => {
          if (seq !== searchSeq.current) return
          setSuggestions(result.tracks || [])
          setMenuOpen((result.tracks || []).length > 0)
          setError(null)
        })
        .catch((err) => {
          if (seq !== searchSeq.current) return
          setSuggestions([])
          setError(err.message || t('pulse.searchFailed'))
        })
        .finally(() => {
          if (seq === searchSeq.current) setSearching(false)
        })
    }, SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [draft, t])

  const pickTrack = useCallback((track) => {
    setPreview(track)
    setSelectedId(track.trackId || track.itunesId || null)
    setPlaying(true)
    setMenuOpen(false)
    setDraft(track.displayTitle || `${track.title}${track.artist ? ` · ${track.artist}` : ''}`)
    setError(null)
    if (track.trackId) {
      setMetaById((prev) => ({ ...prev, [track.trackId]: track }))
    }
  }, [])

  const castVote = useCallback(
    async (trackIdOverride = null) => {
      const trackId =
        trackIdOverride || selected?.trackId || extractSpotifyTrackId(draft)
      if (!trackId) {
        setError(
          selected?.provider === 'itunes'
            ? t('pulse.needSpotifyForVote')
            : t('pulse.invalidLink')
        )
        return
      }
      if (!hasFundedUnit) {
        setError(t('compose.noFundedUnit'))
        return
      }

      setVoting(true)
      setVotingTrackId(trackId)
      setError(null)
      setLastTx(null)

      try {
        const selectedUnit = getHighestFundedUnit(refs, FEE)
        if (!selectedUnit) throw new Error(t('compose.noFundedUnit'))
        if (setCurrentIndex) setCurrentIndex(selectedUnit.index)
        const utxo = ensureUtxoHex
          ? await ensureUtxoHex(selectedUnit.index)
          : selectedUnit
        if (!validateUTXO(utxo)) throw new Error('Invalid UTXO data')

        const result = await applyPulseVote(utxo, trackId, FEE)
        if (!result.success) throw new Error(result.error || t('pulse.voteFailed'))

        setLastTx(result.transactionId)
        setPendingVotes((prev) => [
          ...prev,
          {
            index: `${result.transactionId}_pending`,
            time: Math.floor(Date.now() / 1000),
            value: result.encoded,
            kind: 'pulse_vote',
            trackId,
            provider: 's',
            unconfirmed: true,
          },
        ])
        setSelectedId(trackId)
        setPlaying(true)
      } catch (err) {
        console.error(err)
        setError(err.message || t('pulse.voteFailed'))
      } finally {
        setVoting(false)
        setVotingTrackId(null)
      }
    },
    [selected, draft, hasFundedUnit, refs, setCurrentIndex, ensureUtxoHex, t]
  )

  const coverUrl = selected?.coverUrl || metaById[selected?.trackId]?.coverUrl || null
  const title =
    selected?.title ||
    metaById[selected?.trackId]?.title ||
    t('pulse.unknownTrack')
  const artist = selected?.artist || metaById[selected?.trackId]?.artist || null
  const embedSrc =
    selected?.embedUrl ||
    (selected?.trackId ? spotifyEmbedUrl(selected.trackId) : null)
  const canVote = Boolean(selected?.trackId || extractSpotifyTrackId(draft))

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
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              background:
                'radial-gradient(ellipse at 18% 0%, rgba(247,147,26,0.2), transparent 40%), radial-gradient(ellipse at 88% 30%, rgba(255,255,255,0.06), transparent 34%)',
            }}
          />
          <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-white/50 text-xs uppercase tracking-[0.18em] mb-2">
                <Radio className="w-3.5 h-3.5 text-[color:var(--theme-accent)]" />
                {t('pulse.eyebrow')}
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-white">{t('pulse.title')}</h2>
              <p className="text-white/60 mt-2 max-w-2xl leading-relaxed">{t('pulse.lead')}</p>
              <p className="text-white/40 text-xs mt-3 font-mono">{t('pulse.protocolHint')}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
              {t('pulse.chartCount', { count: chart.length.toLocaleString(locale) })}
            </div>
          </div>
        </GlassCard>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] gap-6 items-start">
          <GlassCard className="p-6 md:p-8 space-y-6">
            <PulseVinyl coverUrl={coverUrl} title={title} playing={playing && Boolean(selected)} />

            <PulsePlayer
              title={title}
              artist={artist}
              coverUrl={coverUrl}
              embedSrc={embedSrc}
              previewUrl={selected?.previewUrl || null}
              playing={playing}
              onPlayingChange={setPlaying}
              openUrl={
                selected?.trackId ? spotifyTrackUrl(selected.trackId) : null
              }
              emptyLabel={t('pulse.emptyPlayer')}
              previewLabel={t('pulse.previewPlaying')}
            />

            {selected?.votes ? (
              <div className="text-center text-xs text-white/45">
                {t('pulse.votesOnAir', {
                  count: Number(selected.votes).toLocaleString(locale),
                })}
              </div>
            ) : null}
          </GlassCard>

          <div className="space-y-6">
            <GlassCard className="p-6 md:p-8 space-y-4">
              <div className="flex items-center gap-2 text-white">
                <Search className="w-4 h-4 text-[color:var(--theme-accent)]" />
                <h3 className="text-lg font-bold">{t('pulse.nominateTitle')}</h3>
              </div>
              <p className="text-sm text-white/50">{t('pulse.nominateLead')}</p>

              <div className="relative">
                <div className="flex items-center gap-2">
                  <input
                    type="search"
                    value={draft}
                    onChange={(event) => {
                      setDraft(event.target.value)
                      setMenuOpen(true)
                    }}
                    onFocus={() => {
                      if (suggestions.length) setMenuOpen(true)
                    }}
                    placeholder={t('pulse.searchPlaceholder')}
                    autoComplete="off"
                    className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[color:var(--theme-accent)]"
                  />
                  {searching ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[color:var(--theme-accent)] shrink-0" />
                  ) : null}
                </div>

                {menuOpen && suggestions.length > 0 ? (
                  <ul className="absolute z-20 mt-2 w-full max-h-72 overflow-y-auto rounded-2xl border border-white/10 bg-[#1a120c]/95 backdrop-blur-md shadow-xl">
                    {suggestions.map((track) => {
                      const key = track.trackId || track.itunesId || track.title
                      const label =
                        track.displayTitle ||
                        `${track.title}${track.artist ? ` · ${track.artist}` : ''}`
                      const voteReady = Boolean(track.trackId)
                      return (
                        <li key={key}>
                          <button
                            type="button"
                            onClick={() => pickTrack(track)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/10 transition-colors"
                          >
                            {track.coverUrl ? (
                              <img
                                src={track.coverUrl}
                                alt=""
                                className="h-10 w-10 rounded-md object-cover"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-md bg-white/10" />
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm text-white truncate">{label}</span>
                              <span className="block text-[11px] text-white/40">
                                {voteReady
                                  ? t('pulse.resultSpotify')
                                  : t('pulse.resultPreviewOnly')}
                              </span>
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
              </div>

              {preview ? (
                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                  {preview.coverUrl ? (
                    <img
                      src={preview.coverUrl}
                      alt=""
                      className="h-14 w-14 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="h-14 w-14 rounded-lg bg-white/10" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-white truncate">
                      {preview.title}
                      {preview.artist ? ` · ${preview.artist}` : ''}
                    </div>
                    <div className="text-[11px] text-white/40 font-mono truncate">
                      {preview.trackId || t('pulse.previewOnlyId')}
                    </div>
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => castVote()}
                disabled={voting || !hasFundedUnit || !canVote}
                className="w-full rounded-xl bg-[color:var(--theme-accent-strong)] text-black font-semibold px-4 py-2.5 text-sm hover:brightness-110 disabled:opacity-40 inline-flex items-center justify-center gap-2"
              >
                {voting &&
                votingTrackId === (selected?.trackId || extractSpotifyTrackId(draft)) ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Disc3 className="w-4 h-4" />
                )}
                {t('pulse.voteBitcoin')}
              </button>

              {!hasFundedUnit ? (
                <p className="text-xs text-white/40">{t('pulse.needSpark')}</p>
              ) : null}
              {error ? <p className="text-sm text-red-300">{error}</p> : null}
              {lastTx ? (
                <a
                  href={`https://mempool.space/tx/${lastTx}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs text-[color:var(--theme-accent-soft)] hover:underline font-mono truncate"
                >
                  {t('pulse.voteBroadcast', { txid: lastTx })}
                </a>
              ) : null}
            </GlassCard>

            <GlassCard className="p-6 md:p-8">
              <h3 className="text-lg font-bold text-white mb-1">{t('pulse.chartTitle')}</h3>
              <p className="text-sm text-white/50 mb-4">{t('pulse.chartLead')}</p>

              {chart.length === 0 ? (
                <p className="text-sm text-white/40 py-6 text-center">{t('pulse.chartEmpty')}</p>
              ) : (
                <ol className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
                  {chart.map((row) => {
                    const active = row.trackId === selected?.trackId
                    const rowTitle =
                      row.title || metaById[row.trackId]?.title || row.trackId
                    const rowArtist = row.artist || metaById[row.trackId]?.artist
                    const rowCover = row.coverUrl || metaById[row.trackId]?.coverUrl
                    const maxVotes = chart[0]?.votes || 1
                    const barPct = Math.max(8, Math.round((row.votes / maxVotes) * 100))
                    const rowVoting = voting && votingTrackId === row.trackId
                    return (
                      <li key={row.trackId}>
                        <div
                          className={`relative overflow-hidden rounded-2xl border transition-colors ${
                            active
                              ? 'border-[color:var(--theme-accent-strong)] bg-[color:var(--theme-accent-strong)]/15'
                              : 'border-white/10 bg-white/5'
                          }`}
                        >
                          <div
                            className="pointer-events-none absolute inset-y-0 left-0 bg-[color:var(--theme-accent-strong)]/10"
                            style={{ width: `${barPct}%` }}
                            aria-hidden
                          />
                          <div className="relative flex items-center gap-2 px-2.5 py-2">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedId(row.trackId)
                                setPlaying(true)
                                if (metaById[row.trackId]) {
                                  setPreview(metaById[row.trackId])
                                }
                              }}
                              className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1 text-left hover:bg-white/5"
                            >
                              <span className="w-7 shrink-0 text-center text-sm font-semibold tabular-nums text-white/55">
                                #{row.rank}
                              </span>
                              {rowCover ? (
                                <img
                                  src={rowCover}
                                  alt=""
                                  className="h-11 w-11 rounded-md object-cover"
                                />
                              ) : (
                                <div className="h-11 w-11 rounded-md bg-white/10" />
                              )}
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-white">
                                  {rowTitle}
                                </span>
                                {rowArtist ? (
                                  <span className="block truncate text-[11px] text-white/45">
                                    {rowArtist}
                                  </span>
                                ) : null}
                                <span className="mt-0.5 block text-[11px] font-medium tabular-nums text-[color:var(--theme-accent-soft)]">
                                  {t('pulse.voteCount', {
                                    count: row.votes.toLocaleString(locale),
                                  })}
                                </span>
                              </span>
                            </button>

                            <button
                              type="button"
                              title={t('pulse.upvoteTitle')}
                              disabled={voting || !hasFundedUnit}
                              onClick={(event) => {
                                event.stopPropagation()
                                castVote(row.trackId)
                              }}
                              className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/80 hover:border-[color:var(--theme-accent-strong)] hover:bg-[color:var(--theme-accent-strong)]/20 hover:text-white disabled:opacity-40"
                            >
                              {rowVoting ? (
                                <Loader2 className="h-4 w-4 animate-spin text-[color:var(--theme-accent)]" />
                              ) : (
                                <>
                                  <ChevronUp className="h-4 w-4" />
                                  <span className="text-[9px] font-semibold uppercase tracking-wide">
                                    {t('pulse.upvote')}
                                  </span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}
            </GlassCard>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
