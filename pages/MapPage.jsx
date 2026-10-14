import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronUp, Globe2, Loader2, Search } from 'lucide-react'
import GlassCard from '../components/GlassCard'
import { windowMotion } from '../services/introMotion'
import { SharedContext } from '../src/SharedContext'
import {
  applyCountryVote,
  getHighestFundedUnit,
  validateUTXO,
} from '../services/BitcoinService'
import { loadImmutableRecords, subscribeImmutables } from '../services/ImmutablesStore'
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  countCountryVotes,
  getWorldCountries,
} from '../services/worldMap'
import immutablesData, { immutablesState } from 'virtual:immutables'
import { useLanguage } from '../src/i18n/LanguageContext'
import { useTheme } from '../src/theme/ThemeContext'
import { pointerOffset } from '../services/pageZoom'

const FEE = 450

const MAP_COLORS = {
  dark: {
    baseFill: 'rgba(255,255,255,0.08)',
    stroke: 'rgba(255,255,255,0.22)',
    hoverStroke: 'rgba(255,255,255,0.85)',
  },
  light: {
    baseFill: 'rgba(0,0,0,0.05)',
    stroke: 'rgba(0,0,0,0.6)',
    hoverStroke: '#000000',
  },
}

function voteFill(votes, maxVotes, baseFill) {
  if (!votes) return baseFill
  const strength = Math.sqrt(votes / Math.max(maxVotes, 1))
  return `rgba(247,147,26,${(0.25 + 0.7 * strength).toFixed(3)})`
}

export default function MapPage() {
  const { t, locale } = useLanguage()
  const { refs, setCurrentIndex, ensureUtxoHex } = useContext(SharedContext)
  const { theme } = useTheme()
  const colors = theme === 'bitcoin-orange' ? MAP_COLORS.light : MAP_COLORS.dark

  const [records, setRecords] = useState([])
  const [pendingVotes, setPendingVotes] = useState([])
  const [hovered, setHovered] = useState(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const [selectedCode, setSelectedCode] = useState(null)
  const [query, setQuery] = useState('')
  const [voting, setVoting] = useState(false)
  const [votingCode, setVotingCode] = useState(null)
  const [error, setError] = useState(null)
  const [lastTx, setLastTx] = useState(null)

  const mapRef = useRef(null)
  const countries = useMemo(() => getWorldCountries(), [])
  const countryByCode = useMemo(
    () => new Map(countries.map((c) => [c.code, c])),
    [countries]
  )

  const hasFundedUnit = Boolean(getHighestFundedUnit(refs, FEE))

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

  const votes = useMemo(
    () => countCountryVotes([...records, ...pendingVotes]),
    [records, pendingVotes]
  )
  const maxVotes = useMemo(() => Math.max(0, ...votes.values()), [votes])
  const totalVotes = useMemo(
    () => [...votes.values()].reduce((sum, n) => sum + n, 0),
    [votes]
  )

  const ranking = useMemo(
    () =>
      [...votes.entries()]
        .filter(([code]) => countryByCode.has(code))
        .sort((a, b) => b[1] - a[1] || countryByCode.get(a[0]).name.localeCompare(countryByCode.get(b[0]).name))
        .map(([code, count], i) => ({ ...countryByCode.get(code), votes: count, rank: i + 1 })),
    [votes, countryByCode]
  )

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    return countries.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8)
  }, [countries, query])

  const selected = selectedCode ? countryByCode.get(selectedCode) : null
  const formatVotes = (count) =>
    t(count === 1 ? 'map.voteCount' : 'map.voteCountPlural', {
      count: Number(count || 0).toLocaleString(locale),
    })

  const handleMouseMove = useCallback((event) => {
    if (!mapRef.current) return
    const { x, y } = pointerOffset(event, mapRef.current)
    setTooltipPos({ x, y })
  }, [])

  const castVote = useCallback(
    async (code) => {
      if (!code) return
      if (!hasFundedUnit) {
        setError(t('compose.noFundedUnit'))
        return
      }

      setVoting(true)
      setVotingCode(code)
      setError(null)
      setLastTx(null)

      try {
        const selectedUnit = getHighestFundedUnit(refs, FEE)
        if (!selectedUnit) throw new Error(t('compose.noFundedUnit'))
        if (setCurrentIndex) setCurrentIndex(selectedUnit.index)
        const utxo = ensureUtxoHex ? await ensureUtxoHex(selectedUnit.index) : selectedUnit
        if (!validateUTXO(utxo)) throw new Error('Invalid UTXO data')

        const result = await applyCountryVote(utxo, code, FEE)
        if (!result.success) throw new Error(result.error || t('map.voteFailed'))

        setLastTx(result.transactionId)
        setPendingVotes((prev) => [
          ...prev,
          {
            index: `${result.transactionId}_pending`,
            time: Math.floor(Date.now() / 1000),
            value: result.encoded,
            kind: 'country_vote',
            code,
            unconfirmed: true,
          },
        ])
      } catch (err) {
        console.error(err)
        setError(err.message || t('map.voteFailed'))
      } finally {
        setVoting(false)
        setVotingCode(null)
      }
    },
    [hasFundedUnit, refs, setCurrentIndex, ensureUtxoHex, t]
  )

  const selectCountry = (code) => {
    setSelectedCode(code)
    setError(null)
    setLastTx(null)
  }

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
        <GlassCard className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2 text-white/50 text-xs uppercase tracking-[0.18em] mb-2">
                <Globe2 className="w-3.5 h-3.5 text-[color:var(--theme-accent)]" />
                {t('map.eyebrow')}
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-white">{t('map.title')}</h2>
              <p className="text-white/60 mt-2 max-w-2xl leading-relaxed">{t('map.lead')}</p>
              <p className="text-white/40 text-xs mt-3 font-mono">{t('map.protocolHint')}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
              {formatVotes(totalVotes)}
            </div>
          </div>

          <div
            ref={mapRef}
            className="relative w-full"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHovered(null)}
          >
            <svg
              viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
              className="w-full h-auto"
              role="img"
              aria-label={t('map.title')}
            >
              {countries.map((country) => {
                const count = votes.get(country.code) || 0
                const isSelected = country.code === selectedCode
                const isHovered = country.code === hovered?.code
                return (
                  <path
                    key={country.code}
                    d={country.path}
                    fill={voteFill(count, maxVotes, colors.baseFill)}
                    stroke={isSelected ? 'var(--theme-accent)' : isHovered ? colors.hoverStroke : colors.stroke}
                    strokeWidth={isSelected ? 1.6 : isHovered ? 1.1 : 0.5}
                    className="cursor-pointer transition-[fill] duration-200 hover:brightness-125"
                    aria-label={`${country.name} · ${formatVotes(count)}`}
                    onMouseEnter={() => setHovered(country)}
                    onClick={() => selectCountry(country.code)}
                  />
                )
              })}
            </svg>

            {hovered ? (
              <div
                className="theme-glass pointer-events-none absolute z-10 rounded-xl border border-[color:var(--theme-card-border)] bg-[color:var(--theme-card-bg)] px-3 py-2 text-sm shadow-xl backdrop-blur-md"
                style={{
                  left: tooltipPos.x,
                  top: tooltipPos.y,
                  transform: 'translate(-50%, calc(-100% - 12px))',
                }}
              >
                <div className="font-semibold text-white whitespace-nowrap">{hovered.name}</div>
                <div className="text-xs tabular-nums text-[color:var(--theme-accent-soft)] whitespace-nowrap">
                  {formatVotes(votes.get(hovered.code) || 0)}
                </div>
              </div>
            ) : null}
          </div>
        </GlassCard>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <GlassCard className="p-6 md:p-8 space-y-4">
            <div className="relative">
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <Search className="w-4 h-4 text-white/40 shrink-0" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('map.searchPlaceholder')}
                  autoComplete="off"
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
                />
              </div>
              {searchResults.length > 0 ? (
                <ul className="theme-glass absolute z-20 mt-2 w-full rounded-2xl border border-[color:var(--theme-card-border)] bg-[color:var(--theme-card-bg)] backdrop-blur-md shadow-xl overflow-hidden">
                  {searchResults.map((country) => (
                    <li key={country.code}>
                      <button
                        type="button"
                        onClick={() => {
                          selectCountry(country.code)
                          setQuery('')
                        }}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left text-sm text-white hover:bg-white/10"
                      >
                        <span className="truncate">{country.name}</span>
                        <span className="shrink-0 text-xs tabular-nums text-white/45">
                          {formatVotes(votes.get(country.code) || 0)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            {selected ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="text-white/45 text-xs uppercase tracking-[0.14em] mb-1">
                  {t('map.selected')}
                </div>
                <div className="text-2xl font-bold text-white">{selected.name}</div>
                <div className="text-sm tabular-nums text-[color:var(--theme-accent-soft)] mt-1">
                  {formatVotes(votes.get(selected.code) || 0)}
                </div>
                <button
                  type="button"
                  onClick={() => castVote(selected.code)}
                  disabled={voting || !hasFundedUnit}
                  className="mt-4 w-full rounded-xl bg-[color:var(--theme-accent-strong)] text-black font-semibold px-4 py-2.5 text-sm hover:brightness-110 disabled:opacity-40 inline-flex items-center justify-center gap-2"
                >
                  {voting && votingCode === selected.code ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ChevronUp className="w-4 h-4" />
                  )}
                  {t('map.upvoteCountry', { name: selected.name })}
                </button>
              </div>
            ) : (
              <p className="text-sm text-white/50 py-4 text-center">{t('map.pickCountry')}</p>
            )}

            {!hasFundedUnit ? <p className="text-xs text-white/40">{t('map.needSpark')}</p> : null}
            {error ? <p className="text-sm text-red-300">{error}</p> : null}
            {lastTx ? (
              <a
                href={`https://mempool.space/tx/${lastTx}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-xs text-[color:var(--theme-accent-soft)] hover:underline font-mono truncate"
              >
                {t('map.voteBroadcast', { txid: lastTx })}
              </a>
            ) : null}
          </GlassCard>

          <GlassCard className="p-6 md:p-8">
            <h3 className="text-lg font-bold text-white mb-1">{t('map.rankingTitle')}</h3>
            <p className="text-sm text-white/50 mb-4">{t('map.rankingLead')}</p>

            {ranking.length === 0 ? (
              <p className="text-sm text-white/40 py-6 text-center">{t('map.rankingEmpty')}</p>
            ) : (
              <ol className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
                {ranking.map((row) => {
                  const barPct = Math.max(8, Math.round((row.votes / Math.max(maxVotes, 1)) * 100))
                  const active = row.code === selectedCode
                  return (
                    <li key={row.code}>
                      <div
                        className={`relative overflow-hidden rounded-2xl border ${
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
                            onClick={() => selectCountry(row.code)}
                            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1 text-left hover:bg-white/5"
                          >
                            <span className="w-7 shrink-0 text-center text-sm font-semibold tabular-nums text-white/55">
                              #{row.rank}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-white">{row.name}</span>
                              <span className="block text-[11px] font-medium tabular-nums text-[color:var(--theme-accent-soft)]">
                                {formatVotes(row.votes)}
                              </span>
                            </span>
                          </button>
                          <button
                            type="button"
                            title={t('map.upvoteCountry', { name: row.name })}
                            disabled={voting || !hasFundedUnit}
                            onClick={() => castVote(row.code)}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/80 hover:border-[color:var(--theme-accent-strong)] hover:bg-[color:var(--theme-accent-strong)]/20 hover:text-white disabled:opacity-40"
                          >
                            {voting && votingCode === row.code ? (
                              <Loader2 className="h-4 w-4 animate-spin text-[color:var(--theme-accent)]" />
                            ) : (
                              <ChevronUp className="h-4 w-4" />
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
    </motion.div>
  )
}
