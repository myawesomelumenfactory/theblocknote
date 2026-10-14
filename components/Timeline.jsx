import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowBigDown,
  ArrowBigUp,
  Bitcoin,
  Clock,
  Cpu,
  ExternalLink,
  Flame,
  Globe,
  Hash,
  House,
  Leaf,
  Lightbulb,
  Loader2,
  Megaphone,
  MessageCircle,
  Palette,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react'
import immutablesData, { immutablesState } from 'virtual:immutables'
import { SharedContext } from '../src/SharedContext'
import { useLanguage } from '../src/i18n/LanguageContext'
import { applyComment, getHighestFundedUnit, sendBitcoinTransaction, validateUTXO } from '../services/BitcoinService'
import { appendImmutable, loadImmutableRecords, subscribeImmutables } from '../services/ImmutablesStore'
import { COMMENT_TEXT_MAX, MESSAGE_TEXT_MAX, encodeMessage } from '../services/immutableProtocol'
import {
  FALLBACK_CATEGORY,
  TIMELINE_CATEGORIES,
  buildTimeline,
  buildTrending,
  categorize,
  hashtagsOf,
  trendingScore,
} from '../services/timeline'
import {
  DECLARATION_REPLY_MAX,
  fetchDeclarationReactions,
  fetchDeclarations,
  fetchMessageVotes,
  postDeclaration,
  replyToDeclaration,
  resolveDeclarationStatuses,
  shortNpub,
  voteDeclaration,
  voteMessage,
} from '../services/declarations'
import { DECLARATION_MAX } from '../services/declarationCore'
import { gatewayUrl } from '../services/ipfs'
import { getFreeNoteIdentity } from '../services/freeNotes'
import TranslateButton from './TranslateButton'

const FEE = 450
const PAGE_SIZE = 20
const CATEGORY_ICONS = {
  bitcoin: Bitcoin,
  voices: Megaphone,
  world: Globe,
  tech: Cpu,
  society: Leaf,
  culture: Palette,
  [FALLBACK_CATEGORY]: Lightbulb,
}
const CATEGORY_COLORS = {
  bitcoin: 'text-[#f7931a]',
  voices: 'text-rose-500',
  world: 'text-sky-500',
  tech: 'text-violet-500',
  society: 'text-emerald-600',
  culture: 'text-fuchsia-500',
  [FALLBACK_CATEGORY]: 'text-amber-500',
}
const NAV_CATEGORIES = [...TIMELINE_CATEGORIES.map((c) => c.id), FALLBACK_CATEGORY]
const NAV_HASHTAGS = 6

const VOTES_KEY = 'theblocknote:timeline-votes'
const LEGACY_LIKED_KEY = 'theblocknote:timeline-liked'

const VOTE_BUTTONS = [
  { direction: 'up', Icon: ArrowBigUp, color: 'text-emerald-500', hover: 'hover:text-emerald-500', count: (p) => p.ups },
  { direction: 'down', Icon: ArrowBigDown, color: 'text-red-500', hover: 'hover:text-red-500', count: (p) => p.downs },
]

/** @returns {Record<string, 'up' | 'down'>} post index → this browser's vote */
function readMyVotes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(VOTES_KEY) || '{}')
    const votes = parsed && typeof parsed === 'object' ? parsed : {}
    for (const index of JSON.parse(localStorage.getItem(LEGACY_LIKED_KEY) || '[]')) votes[index] ||= 'up'
    return votes
  } catch {
    return {}
  }
}

function hueOf(seed) {
  let h = 0
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

function Avatar({ seed, size = 40 }) {
  const hue = hueOf(seed)
  return (
    <div
      aria-hidden="true"
      className="shrink-0 rounded-full grid place-items-center font-bold uppercase"
      style={{
        color: '#ffffff',
        width: size,
        height: size,
        fontSize: size * 0.34,
        background: `linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${(hue + 50) % 360} 70% 30%))`,
      }}
    >
      {String(seed).slice(0, 2)}
    </div>
  )
}

function relativeTime(seconds, locale) {
  const diff = Date.now() / 1000 - seconds
  if (diff < 60) return `${Math.max(1, Math.floor(diff))}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  const date = new Date(seconds * 1000)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
}

function shortAddress(address) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : ''
}

function DeclarationBadge({ status, t, locale }) {
  if (status?.status === 'anchored') {
    return (
      <a
        href={status.txid ? `https://mempool.space/tx/${status.txid}` : `https://mempool.space/block/${status.blockHash}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-emerald-600 hover:underline"
      >
        <ShieldCheck className="w-[16px] h-[16px]" />
        {t('timeline.anchored', { height: Number(status.height).toLocaleString(locale) })}
      </a>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-1" title={t('timeline.pendingHint')}>
      <Clock className="w-[16px] h-[16px]" />
      {status ? t('timeline.pending') : t('timeline.checking')}
    </span>
  )
}

function voteStatusTitle(voteStatus, t, locale) {
  if (voteStatus?.status === 'anchored') {
    return t('timeline.voteAnchored', { height: Number(voteStatus.height).toLocaleString(locale) })
  }
  if (voteStatus?.status === 'none') return t('timeline.alreadyVoted')
  return voteStatus ? t('timeline.votePending') : t('timeline.checking')
}

function PostItem({ post, t, locale, myVote, canAct, busy, open, onToggle, onVote, onReply, highlighted, status, replyStatuses, voteStatus }) {
  const [draft, setDraft] = useState('')
  const declaration = post.kind === 'declaration'
  const replyMax = declaration ? DECLARATION_REPLY_MAX : COMMENT_TEXT_MAX
  return (
    <article
      id={`post-${post.index}`}
      className={`px-4 pt-3 pb-2 border-b border-[color:var(--theme-card-border)] transition-colors hover:bg-white/[0.03] ${
        highlighted ? 'bg-[color:var(--theme-accent)]/10' : ''
      }`}
    >
      <div className="flex gap-3">
        <Avatar seed={post.seed} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-[15px] min-w-0">
            <span className="font-bold text-white truncate">{t('timeline.entity')}</span>
            <span className="text-[color:var(--theme-fg-muted)] truncate">
              {post.handle} · {relativeTime(post.time, locale)}
            </span>
            {declaration ? (
              <span className="ml-1 text-[11px] text-[color:var(--theme-accent)] border border-[color:var(--theme-accent)]/40 rounded-full px-1.5">
                {t('timeline.declared')}
              </span>
            ) : null}
            {post.unconfirmed ? (
              <span className="ml-1 text-[11px] text-[color:var(--theme-fg-muted)] border border-[color:var(--theme-card-border)] rounded-full px-1.5">
                {t('timeline.mempool')}
              </span>
            ) : null}
            <span className={`ml-auto text-[12px] shrink-0 ${CATEGORY_COLORS[post.category] || 'text-[color:var(--theme-accent)]'}`}>
              {t(`timeline.cat.${post.category}`)}
            </span>
          </div>
          <p className="text-[15px] leading-5 text-white whitespace-pre-wrap break-words mt-0.5">{post.text}</p>
          <TranslateButton
            text={post.text}
            className="mt-1"
            textClassName="text-[15px] leading-5 text-white whitespace-pre-wrap break-words"
          />

          <div className="flex items-center justify-between max-w-md mt-2 -ml-2 text-[13px] text-[color:var(--theme-fg-muted)]">
            <button
              type="button"
              onClick={onToggle}
              className="group inline-flex items-center gap-1 rounded-full px-2 py-1 hover:text-[color:var(--theme-accent)]"
              aria-expanded={open}
            >
              <MessageCircle className="w-[18px] h-[18px]" />
              <span className="tabular-nums">{post.comments.length || ''}</span>
            </button>
            <div className="inline-flex items-center gap-1" role="group" aria-label={t('timeline.voteLabel')}>
              {VOTE_BUTTONS.map((button) => {
                const { direction, Icon, color, hover, count } = button
                const chosen = myVote === direction
                return (
                  <button
                    key={direction}
                    type="button"
                    onClick={() => onVote(direction)}
                    disabled={Boolean(myVote) || Boolean(busy)}
                    aria-pressed={chosen}
                    title={
                      myVote
                        ? chosen && voteStatus !== undefined
                          ? voteStatusTitle(voteStatus, t, locale)
                          : t('timeline.alreadyVoted')
                        : t(`timeline.${direction === 'up' ? 'voteUpFree' : 'voteDownFree'}`)
                    }
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-1 ${
                      chosen ? `${color} cursor-default` : `${hover} disabled:opacity-50 disabled:hover:text-inherit`
                    }`}
                  >
                    {busy === `vote-${direction}` ? (
                      <Loader2 className="w-[18px] h-[18px] animate-spin" />
                    ) : (
                      <Icon className="w-[18px] h-[18px]" fill={chosen ? 'currentColor' : 'none'} />
                    )}
                    <span className="tabular-nums">{count(post) || ''}</span>
                  </button>
                )
              })}
            </div>
            {declaration ? (
              <>
                <DeclarationBadge status={status} t={t} locale={locale} />
                <a
                  href={gatewayUrl(post.cid)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={post.cid}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-1 hover:text-[color:var(--theme-accent)]"
                >
                  <ExternalLink className="w-[16px] h-[16px]" />
                  IPFS
                </a>
              </>
            ) : (
              <a
                href={`https://mempool.space/tx/${post.txid}`}
                target="_blank"
                rel="noopener noreferrer"
                title={new Date(post.time * 1000).toLocaleString(locale)}
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 hover:text-[color:var(--theme-accent)]"
              >
                <ExternalLink className="w-[16px] h-[16px]" />
                {t('timeline.onChain')}
              </a>
            )}
          </div>

          {open ? (
            <div className="mt-1 mb-2 space-y-2">
              {post.comments.map((comment) => (
                <div key={comment.txid} className="flex gap-2">
                  <Avatar seed={comment.seed || comment.txid} size={24} />
                  <div className="min-w-0 text-[14px]">
                    <span className="text-[color:var(--theme-fg-muted)]">
                      {comment.handle || `@${comment.txid.slice(0, 8)}`} · {relativeTime(comment.time, locale)}
                    </span>
                    <p className="text-white break-words">{comment.text}</p>
                    <TranslateButton text={comment.text} textClassName="text-white break-words" />
                    {comment.anchored ? (
                      <div className="flex items-center -ml-2 text-[12px] text-[color:var(--theme-fg-muted)]">
                        <DeclarationBadge status={replyStatuses?.get(comment.txid)} t={t} locale={locale} />
                        <a
                          href={gatewayUrl(comment.cid)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={comment.cid}
                          className="inline-flex items-center gap-1 rounded-full px-2 py-1 hover:text-[color:var(--theme-accent)]"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          IPFS
                        </a>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
              {post.comments.length === 0 ? (
                <p className="text-[13px] text-[color:var(--theme-fg-muted)]">{t('timeline.noReplies')}</p>
              ) : null}
              <form
                className="flex items-center gap-2"
                onSubmit={async (event) => {
                  event.preventDefault()
                  if (await onReply(draft)) setDraft('')
                }}
              >
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value.slice(0, replyMax))}
                  disabled={!canAct}
                  placeholder={
                    declaration
                      ? t('timeline.replyAnchoredPlaceholder')
                      : canAct
                        ? t('timeline.replyPlaceholder')
                        : t('timeline.needUnit')
                  }
                  className="flex-1 min-w-0 bg-transparent border-b border-[color:var(--theme-card-border)] py-1.5 text-[14px] text-white placeholder-[color:var(--theme-fg-subtle)] focus:outline-none focus:border-[color:var(--theme-accent)]"
                />
                <span className="text-[12px] tabular-nums text-[color:var(--theme-fg-subtle)]">
                  {replyMax - draft.length}
                </span>
                <button
                  type="submit"
                  disabled={!canAct || !draft.trim() || busy === 'reply'}
                  className="rounded-full bg-[color:var(--theme-accent)] text-white font-bold text-[13px] px-4 py-1.5 disabled:opacity-50"
                >
                  {busy === 'reply' ? <Loader2 className="w-4 h-4 animate-spin" /> : t('timeline.reply')}
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  )
}

export default function Timeline() {
  const { t, locale } = useLanguage()
  const { refs, ensureUtxoHex, refreshRefs, setCurrentIndex } = useContext(SharedContext)

  const [records, setRecords] = useState(immutablesData)
  const [tab, setTab] = useState('latest')
  const [topic, setTopic] = useState(null)
  const [voteSort, setVoteSort] = useState(null)
  const [query, setQuery] = useState('')
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [openThreads, setOpenThreads] = useState(() => new Set())
  const [highlight, setHighlight] = useState(null)
  const [myVotes, setMyVotes] = useState(readMyVotes)
  const [busy, setBusy] = useState({})
  const [notice, setNotice] = useState(null)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [mode, setMode] = useState('free')
  const [postStep, setPostStep] = useState(null)
  const [declarations, setDeclarations] = useState([])
  const [declStatuses, setDeclStatuses] = useState(new Map())
  const [declReactions, setDeclReactions] = useState(new Map())
  const [messageVotes, setMessageVotes] = useState(new Map())
  const [replyStatuses, setReplyStatuses] = useState(new Map())
  const [voteStatuses, setVoteStatuses] = useState(new Map())

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

  const refreshDeclarations = useCallback(async () => {
    const list = await fetchDeclarations()
    setDeclarations(list)
    const ids = list.map((d) => d.eventId)
    const [statuses, reactions] = await Promise.all([
      resolveDeclarationStatuses(list),
      fetchDeclarationReactions(ids),
    ])
    setDeclStatuses(statuses)
    setDeclReactions(reactions)
  }, [])

  useEffect(() => {
    refreshDeclarations().catch((err) => console.warn('Declarations failed to load', err))
  }, [refreshDeclarations])

  const unit = getHighestFundedUnit(Array.isArray(refs) ? refs : [], FEE)
  const entityAddress = unit?.public_key || null
  const canAct = Boolean(unit)
  const freeIdentity = useMemo(() => getFreeNoteIdentity(), [])

  const chainPosts = useMemo(() => buildTimeline(records), [records])
  const chainKey = chainPosts.map((p) => p.index).join(',')
  useEffect(() => {
    if (!chainKey) return
    let cancelled = false
    fetchMessageVotes(chainKey.split(','))
      .then((votes) => {
        if (!cancelled) setMessageVotes(votes)
      })
      .catch((err) => console.warn('Message votes failed to load', err))
    return () => {
      cancelled = true
    }
  }, [chainKey])

  const posts = useMemo(() => {
    const chain = chainPosts.map((p) => {
      const free = messageVotes.get(p.index)
      return {
        ...p,
        kind: 'chain',
        seed: p.txid,
        handle: `@${p.txid.slice(0, 8)}`,
        ups: p.ups + (free?.ups.size || 0),
        downs: p.downs + (free?.downs.size || 0),
      }
    })
    const declared = declarations.map((d) => {
      const reactions = declReactions.get(d.eventId)
      return {
        index: `decl:${d.eventId}`,
        kind: 'declaration',
        eventId: d.eventId,
        pubkey: d.pubkey,
        cid: d.cid,
        time: d.time,
        text: d.text,
        seed: d.pubkey,
        handle: `@${shortNpub(d.pubkey)}`,
        ups: reactions?.ups.size || 0,
        downs: reactions?.downs.size || 0,
        comments: (reactions?.replies || []).map((r) => ({
          txid: r.id,
          time: r.time,
          text: r.text,
          seed: r.pubkey,
          handle: `@${shortNpub(r.pubkey)}`,
          anchored: Boolean(r.anchored),
          cid: r.cid,
        })),
        category: categorize(d.text),
        hashtags: hashtagsOf(d.text),
        unconfirmed: false,
      }
    })
    return [...chain, ...declared].sort((a, b) => b.time - a.time)
  }, [chainPosts, messageVotes, declarations, declReactions])
  const trending = useMemo(() => buildTrending(posts), [posts])
  const categoryCounts = useMemo(() => {
    const counts = new Map()
    for (const post of posts) counts.set(post.category, (counts.get(post.category) || 0) + 1)
    return counts
  }, [posts])
  const navHashtags = useMemo(
    () => trending.filter((group) => group.kind === 'hashtag').slice(0, NAV_HASHTAGS),
    [trending],
  )

  const feed = useMemo(() => {
    const needle = query.trim().toLowerCase()
    let list = posts
    if (topic) {
      list = topic.startsWith('#')
        ? list.filter((p) => p.hashtags.includes(topic.slice(1)))
        : list.filter((p) => p.category === topic)
    }
    if (needle) list = list.filter((p) => p.text.toLowerCase().includes(needle))
    if (voteSort) {
      const field = voteSort === 'up' ? 'ups' : 'downs'
      list = list
        .filter((p) => p[field] > 0)
        .sort((a, b) => b[field] - a[field] || (b.ups - b.downs) - (a.ups - a.downs) || b.time - a.time)
    } else if (tab === 'trending') {
      const now = Date.now() / 1000
      list = [...list].sort((a, b) => trendingScore(b, now) - trendingScore(a, now))
    }
    return list
  }, [posts, topic, query, tab, voteSort])
  const votedCounts = useMemo(
    () => ({ up: posts.filter((p) => p.ups > 0).length, down: posts.filter((p) => p.downs > 0).length }),
    [posts],
  )

  const topicLabel = (id) => (id.startsWith('#') ? id : t(`timeline.cat.${id}`))

  const setPostBusy = (index, value) => setBusy((prev) => ({ ...prev, [index]: value }))

  const spendUnit = async () => {
    const selected = getHighestFundedUnit(Array.isArray(refs) ? refs : [], FEE)
    if (!selected) throw new Error(t('timeline.needUnit'))
    if (setCurrentIndex) setCurrentIndex(selected.index)
    const utxo = ensureUtxoHex ? await ensureUtxoHex(selected.index) : selected
    return { selected, utxo }
  }

  const finish = async (selected, result, text) => {
    setNotice({ type: 'success', text, url: result.explorerUrl })
    if (refreshRefs) await refreshRefs({ watch: true, address: selected.public_key })
  }

  const handleDeclare = async () => {
    const text = draft.trim()
    if (!text) return
    setPosting(true)
    setNotice(null)
    try {
      const { relays, cid } = await postDeclaration(text, setPostStep)
      setDraft('')
      setTab('latest')
      setTopic(null)
      setNotice({ type: 'success', text: t('timeline.declaredOk', { relays }), url: gatewayUrl(cid), urlLabel: t('timeline.viewIpfs') })
      await refreshDeclarations()
    } catch (err) {
      setNotice({ type: 'error', text: err.message || t('timeline.declareFailed') })
    } finally {
      setPosting(false)
      setPostStep(null)
    }
  }

  const handlePost = async () => {
    if (mode === 'free') return handleDeclare()
    const text = draft.trim()
    if (!text) return
    setPosting(true)
    setNotice(null)
    try {
      const { selected, utxo } = await spendUnit()
      if (!validateUTXO(utxo)) throw new Error('Invalid UTXO data')
      const result = await sendBitcoinTransaction(utxo, text, FEE)
      if (!result.success) throw new Error(result.error || t('timeline.postFailed'))
      await appendImmutable({
        index: `${result.transactionId}_0`,
        time: Math.floor(Date.now() / 1000),
        value: encodeMessage(text),
        unconfirmed: true,
      })
      setDraft('')
      setTab('latest')
      setTopic(null)
      await finish(selected, result, t('timeline.posted'))
    } catch (err) {
      setNotice({ type: 'error', text: err.message || t('timeline.postFailed') })
    } finally {
      setPosting(false)
    }
  }

  const rememberVote = (index, direction) =>
    setMyVotes((prev) => {
      const next = { ...prev, [index]: direction }
      localStorage.setItem(VOTES_KEY, JSON.stringify(next))
      return next
    })

  /** Free anchored votes on a post: declarations by event id, on-chain messages by `txid_vout`. */
  const freeVotesOn = (post) =>
    post.kind === 'declaration' ? declReactions.get(post.eventId) : messageVotes.get(post.index)

  const myVoteOn = (post) => {
    const reactions = freeVotesOn(post)
    if (reactions?.ups.has(freeIdentity.pubkey)) return 'up'
    if (reactions?.downs.has(freeIdentity.pubkey)) return 'down'
    return myVotes[post.index] || null
  }

  /** @param {'up' | 'down'} direction */
  const handleVote = async (post, direction) => {
    if (myVoteOn(post) || busy[post.index]) return
    setPostBusy(post.index, `vote-${direction}`)
    setNotice(null)
    const declaration = post.kind === 'declaration'
    const key = declaration ? post.eventId : post.index
    try {
      const vote = declaration ? await voteDeclaration(post, direction) : await voteMessage(post.index, direction)
      rememberVote(post.index, direction)
      const setVotes = declaration ? setDeclReactions : setMessageVotes
      setVotes((prev) => {
        const next = new Map(prev)
        const entry = next.get(key) || { ups: new Set(), downs: new Set(), votes: new Map(), replies: [] }
        const field = direction === 'up' ? 'ups' : 'downs'
        next.set(key, {
          ...entry,
          [field]: new Set(entry[field]).add(freeIdentity.pubkey),
          votes: new Map(entry.votes).set(freeIdentity.pubkey, vote),
        })
        return next
      })
      setVoteStatuses((prev) => new Map(prev).set(vote.eventId, { status: 'pending' }))
    } catch (err) {
      setNotice({ type: 'error', text: err.message || t('timeline.voteFailed') })
    } finally {
      setPostBusy(post.index, null)
    }
  }

  const handleReply = async (post, text) => {
    if (!text.trim()) return false
    setPostBusy(post.index, 'reply')
    setNotice(null)
    if (post.kind === 'declaration') {
      try {
        const reply = await replyToDeclaration(post, text)
        setDeclReactions((prev) => {
          const next = new Map(prev)
          const entry = next.get(post.eventId) || { ups: new Set(), downs: new Set(), replies: [] }
          next.set(post.eventId, { ...entry, replies: [...entry.replies, reply] })
          return next
        })
        setReplyStatuses((prev) => new Map(prev).set(reply.id, { status: 'pending' }))
        return true
      } catch (err) {
        setNotice({ type: 'error', text: err.message || t('timeline.replyFailed') })
        return false
      } finally {
        setPostBusy(post.index, null)
      }
    }
    try {
      const { selected, utxo } = await spendUnit()
      const [hash, vout] = post.index.split('_')
      const result = await applyComment(utxo, hash, vout, text, FEE)
      if (!result.success) throw new Error(result.error || t('timeline.replyFailed'))
      await appendImmutable({
        index: `${result.transactionId}_0`,
        time: Math.floor(Date.now() / 1000),
        value: result.encoded,
        kind: 'comment',
        unconfirmed: true,
      })
      await finish(selected, result, t('timeline.replied'))
      return true
    } catch (err) {
      setNotice({ type: 'error', text: err.message || t('timeline.replyFailed') })
      return false
    } finally {
      setPostBusy(post.index, null)
    }
  }

  const requestedReplyStatuses = useRef(new Set())
  useEffect(() => {
    const due = []
    for (const index of openThreads) {
      if (!String(index).startsWith('decl:')) continue
      for (const reply of declReactions.get(index.slice(5))?.replies || []) {
        if (!reply.anchored || requestedReplyStatuses.current.has(reply.id)) continue
        requestedReplyStatuses.current.add(reply.id)
        due.push(reply)
      }
    }
    if (due.length === 0) return
    resolveDeclarationStatuses(due).then((statuses) =>
      setReplyStatuses((prev) => {
        const next = new Map(prev)
        for (const [id, status] of statuses) next.set(id, status)
        return next
      }),
    )
  }, [openThreads, declReactions])

  const requestedVoteStatuses = useRef(new Set())
  useEffect(() => {
    const due = []
    for (const entry of [...declReactions.values(), ...messageVotes.values()]) {
      const mine = entry.votes?.get(freeIdentity.pubkey)
      if (!mine?.anchored || requestedVoteStatuses.current.has(mine.eventId)) continue
      requestedVoteStatuses.current.add(mine.eventId)
      due.push(mine)
    }
    if (due.length === 0) return
    resolveDeclarationStatuses(due).then((statuses) =>
      setVoteStatuses((prev) => {
        const next = new Map(prev)
        for (const [id, status] of statuses) next.set(id, status)
        return next
      }),
    )
  }, [declReactions, messageVotes, freeIdentity])

  const myVoteStatus = (post) => {
    const mine = freeVotesOn(post)?.votes?.get(freeIdentity.pubkey)
    if (!mine) return undefined
    if (!mine.anchored) return { status: 'none' }
    return voteStatuses.get(mine.eventId) || null
  }

  const toggleThread = (index) =>
    setOpenThreads((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })

  const jumpTo = (post) => {
    setTopic(null)
    setQuery('')
    setTab('latest')
    const position = posts.findIndex((p) => p.index === post.index)
    setVisible((v) => Math.max(v, position + 5))
    setOpenThreads((prev) => new Set(prev).add(post.index))
    setHighlight(post.index)
    requestAnimationFrame(() =>
      document.getElementById(`post-${post.index}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    )
  }

  const draftMax = mode === 'free' ? DECLARATION_MAX : MESSAGE_TEXT_MAX
  const remaining = draftMax - draft.length
  const canPost = mode === 'free' || canAct

  const pickTopic = (id) => {
    setTopic(id)
    setTab('latest')
  }

  const trendingList = trending.map((group) => (
    <div key={group.id} className="border-t border-[color:var(--theme-card-border)]">
      <button
        type="button"
        onClick={() => pickTopic(group.id)}
        className="w-full text-left px-4 pt-3 pb-1 hover:bg-white/[0.03]"
      >
        <p className="text-[13px] text-[color:var(--theme-fg-muted)]">
          {t(group.count === 1 ? 'timeline.trendingInOne' : 'timeline.trendingIn', { count: group.count })}
        </p>
        <p className="text-[15px] font-bold text-white">{topicLabel(group.id)}</p>
      </button>
      <ul className="pb-2">
        {group.posts.map((post) => (
          <li key={post.index}>
            <button
              type="button"
              onClick={() => jumpTo(post)}
              className="w-full text-left px-4 py-1.5 hover:bg-white/[0.03]"
            >
              <p className="text-[14px] text-white/90 line-clamp-2">{post.text}</p>
              <p className="text-[12px] text-[color:var(--theme-fg-muted)] mt-0.5 flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <ArrowBigUp className="w-3 h-3" /> {post.ups}
                </span>
                <span className="inline-flex items-center gap-1">
                  <ArrowBigDown className="w-3 h-3" /> {post.downs}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MessageCircle className="w-3 h-3" /> {post.comments.length}
                </span>
                <span>{relativeTime(post.time, locale)}</span>
              </p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  ))

  const navButton = (item) => {
    const { key, label, Icon, count, active, onSelect, color = 'text-[color:var(--theme-accent)]' } = item
    return (
      <button
        key={key}
        type="button"
        onClick={onSelect}
        aria-current={active ? 'page' : undefined}
        className={`group w-full flex items-center gap-4 rounded-full px-4 py-2.5 text-left transition-colors ${
          active ? 'bg-[color:var(--theme-accent)]/10' : 'hover:bg-white/[0.06]'
        }`}
      >
        <Icon className={`w-6 h-6 shrink-0 ${color}`} strokeWidth={active ? 2.75 : 2} />
        <span className={`flex-1 truncate text-[19px] text-white ${active ? 'font-bold' : ''}`}>{label}</span>
        <span className="text-[13px] tabular-nums text-[color:var(--theme-fg-muted)]">{count}</span>
      </button>
    )
  }

  const navItem = ({ id, label, Icon, count, color }) =>
    navButton({
      key: id ?? 'all',
      label,
      Icon,
      count,
      color,
      active: topic === id,
      onSelect: () => {
        setTopic(id)
        setTab('latest')
      },
    })

  const voteSortItem = (direction) =>
    navButton({
      key: `votes-${direction}`,
      label: t(direction === 'up' ? 'timeline.mostUp' : 'timeline.mostDown'),
      Icon: direction === 'up' ? ArrowBigUp : ArrowBigDown,
      count: votedCounts[direction],
      active: voteSort === direction,
      color: direction === 'up' ? 'text-emerald-500' : 'text-red-500',
      onSelect: () => {
        setVoteSort((current) => (current === direction ? null : direction))
        setTab('latest')
      },
    })

  const categoryList = (
    <>
      {navItem({ id: null, label: t('timeline.allPosts'), Icon: House, count: posts.length })}
      {NAV_CATEGORIES.map((id) =>
        navItem({
          id,
          label: t(`timeline.cat.${id}`),
          Icon: CATEGORY_ICONS[id],
          color: CATEGORY_COLORS[id],
          count: categoryCounts.get(id) || 0,
        }),
      )}
      <h3 className="px-4 pt-5 pb-2 text-[15px] font-bold text-[color:var(--theme-fg-muted)]">
        {t('timeline.mostVotedTitle')}
      </h3>
      {voteSortItem('up')}
      {voteSortItem('down')}
      {navHashtags.length > 0 ? (
        <>
          <h3 className="px-4 pt-5 pb-2 text-[15px] font-bold text-[color:var(--theme-fg-muted)]">
            {t('timeline.hashtagsTitle')}
          </h3>
          {navHashtags.map((group) =>
            navItem({ id: group.id, label: group.id.slice(1), Icon: Hash, count: group.count }),
          )}
        </>
      ) : null}
    </>
  )

  return (
    <div className="w-full flex justify-center gap-8 xl:gap-12 px-0 lg:px-6 pb-16">
      <aside className="hidden xl:block w-[260px] shrink-0 pt-2">
        <nav
          className="sticky top-2 rounded-2xl border border-[color:var(--theme-card-border)] bg-[color:var(--theme-card-bg)] py-3"
          aria-label={t('timeline.categoriesTitle')}
        >
          <h3 className="px-4 pb-2 text-xl font-bold text-white">{t('timeline.categoriesTitle')}</h3>
          {categoryList}
        </nav>
      </aside>

      <main className="w-full max-w-[680px] min-w-0 border-x lg:border lg:rounded-2xl lg:mt-2 overflow-clip border-[color:var(--theme-card-border)] bg-[color:var(--theme-card-bg)]">
        <div className="sticky top-0 z-10 bg-[color:var(--theme-card-bg)] backdrop-blur-xl backdrop-saturate-150 border-b border-[color:var(--theme-card-border)]">
          <h2 className="px-4 pt-3 pb-1 text-xl font-bold text-white">{t('timeline.home')}</h2>
          <div className="flex" role="tablist">
            {['latest', 'trending', 'topics', 'categories'].map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`flex-1 py-3 text-[15px] hover:bg-white/[0.06] ${
                  id === 'topics' ? 'lg:hidden' : id === 'categories' ? 'xl:hidden' : ''
                }`}
              >
                <span
                  className={`relative inline-block pb-3 -mb-3 ${
                    tab === id ? 'font-bold text-white' : 'text-[color:var(--theme-fg-muted)]'
                  }`}
                >
                  {t(`timeline.tab.${id}`)}
                  {tab === id ? (
                    <span className="absolute left-0 right-0 bottom-0 h-1 rounded-full bg-[color:var(--theme-accent)]" />
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3 px-4 pt-3 pb-2 border-b border-[color:var(--theme-card-border)]">
          <Avatar seed={mode === 'free' ? freeIdentity.pubkey : entityAddress || '??'} />
          <div className="flex-1 min-w-0">
            <div className="flex gap-1 pt-1" role="group" aria-label={t('timeline.modeLabel')}>
              {['free', 'chain'].map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={mode === id}
                  onClick={() => {
                    setMode(id)
                    setDraft((d) => d.slice(0, id === 'free' ? DECLARATION_MAX : MESSAGE_TEXT_MAX))
                  }}
                  className={`rounded-full px-3 py-1 text-[13px] font-semibold border ${
                    mode === id
                      ? 'border-[color:var(--theme-accent)] bg-[color:var(--theme-accent)]/10 text-[color:var(--theme-accent)]'
                      : 'border-[color:var(--theme-card-border)] text-[color:var(--theme-fg-muted)] hover:bg-white/[0.06]'
                  }`}
                >
                  {t(`timeline.mode.${id}`)}
                </button>
              ))}
            </div>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value.slice(0, draftMax))}
              placeholder={mode === 'free' ? t('timeline.declarePlaceholder') : t('timeline.composePlaceholder')}
              rows={mode === 'free' ? 3 : 2}
              className="w-full bg-transparent resize-none text-xl text-white placeholder-[color:var(--theme-fg-subtle)] focus:outline-none py-2"
            />
            <div className="flex items-center justify-between gap-3 border-t border-[color:var(--theme-card-border)] pt-2">
              <span className="text-[13px] text-[color:var(--theme-fg-muted)] truncate">
                {mode === 'free'
                  ? t('timeline.freeHint', { handle: shortNpub(freeIdentity.pubkey) })
                  : entityAddress
                    ? t('timeline.speakingAs', { address: shortAddress(entityAddress) })
                    : t('timeline.needUnit')}
              </span>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`text-[13px] tabular-nums ${remaining < 10 ? 'text-orange-400' : 'text-[color:var(--theme-fg-subtle)]'}`}>
                  {remaining}
                </span>
                <button
                  type="button"
                  onClick={handlePost}
                  disabled={!canPost || !draft.trim() || posting}
                  className="inline-flex items-center gap-2 rounded-full bg-[color:var(--theme-accent)] text-white font-bold text-[15px] px-5 py-2 hover:brightness-110 disabled:opacity-50"
                >
                  {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {postStep === 'stamping'
                    ? t('timeline.stepStamping')
                    : postStep === 'publishing'
                      ? t('timeline.stepPublishing')
                      : posting
                        ? null
                        : mode === 'free'
                          ? t('timeline.declare')
                          : t('timeline.post')}
                </button>
              </div>
            </div>
          </div>
        </div>

        {notice ? (
          <div
            className={`px-4 py-2 text-[14px] border-b border-[color:var(--theme-card-border)] ${
              notice.type === 'error' ? 'text-red-400' : 'text-[color:var(--theme-accent)]'
            }`}
          >
            {notice.text}{' '}
            {notice.url ? (
              <a href={notice.url} target="_blank" rel="noopener noreferrer" className="underline">
                {notice.urlLabel || t('timeline.viewTx')}
              </a>
            ) : null}
          </div>
        ) : null}

        {topic || voteSort ? (
          <div className="px-4 py-2 border-b border-[color:var(--theme-card-border)] flex items-center gap-2 text-[14px]">
            <span className="text-[color:var(--theme-fg-muted)]">{t('timeline.filtered')}</span>
            {[
              topic ? { key: 'topic', label: topicLabel(topic), clear: () => setTopic(null) } : null,
              voteSort
                ? { key: 'votes', label: t(voteSort === 'up' ? 'timeline.mostUp' : 'timeline.mostDown'), clear: () => setVoteSort(null) }
                : null,
            ]
              .filter(Boolean)
              .map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.clear}
                  className="inline-flex items-center gap-1 rounded-full bg-[color:var(--theme-accent)]/15 text-[color:var(--theme-accent)] px-3 py-0.5 font-semibold"
                >
                  {chip.label}
                  <X className="w-3.5 h-3.5" />
                </button>
              ))}
          </div>
        ) : null}

        {tab === 'topics' ? (
          <div className="lg:hidden">{trendingList}</div>
        ) : tab === 'categories' ? (
          <nav className="xl:hidden py-2" aria-label={t('timeline.categoriesTitle')}>
            {categoryList}
          </nav>
        ) : feed.length === 0 ? (
          <p className="px-4 py-10 text-center text-[color:var(--theme-fg-muted)]">{t('timeline.empty')}</p>
        ) : (
          feed.slice(0, visible).map((post) => (
            <PostItem
              key={post.index}
              post={post}
              t={t}
              locale={locale}
              myVote={myVoteOn(post)}
              canAct={post.kind === 'declaration' || canAct}
              status={post.kind === 'declaration' ? declStatuses.get(post.eventId) : undefined}
              replyStatuses={post.kind === 'declaration' ? replyStatuses : undefined}
              voteStatus={myVoteStatus(post)}
              busy={busy[post.index]}
              open={openThreads.has(post.index)}
              highlighted={highlight === post.index}
              onToggle={() => toggleThread(post.index)}
              onVote={(direction) => handleVote(post, direction)}
              onReply={(text) => handleReply(post, text)}
            />
          ))
        )}
        {tab !== 'topics' && tab !== 'categories' && feed.length > visible ? (
          <button
            type="button"
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
            className="w-full py-4 text-[15px] text-[color:var(--theme-accent)] hover:bg-white/[0.03]"
          >
            {t('timeline.showMore')}
          </button>
        ) : null}
      </main>

      <aside className="hidden lg:block w-[380px] shrink-0 pt-2">
        <div className="sticky top-2 space-y-4">
          <label className="flex items-center gap-3 rounded-full bg-[color:var(--theme-inset-bg)] border border-transparent focus-within:border-[color:var(--theme-accent)] px-4 py-2.5">
            <Search className="w-4 h-4 text-[color:var(--theme-fg-muted)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('timeline.search')}
              className="flex-1 bg-transparent text-[15px] text-white placeholder-[color:var(--theme-fg-muted)] focus:outline-none"
            />
          </label>

          <section className="rounded-2xl border border-[color:var(--theme-card-border)] bg-[color:var(--theme-card-bg)] overflow-hidden">
            <h3 className="px-4 pt-3 pb-2 text-xl font-bold text-white flex items-center gap-2">
              <Flame className="w-5 h-5 text-[color:var(--theme-accent)]" />
              {t('timeline.trendingTitle')}
            </h3>
            {trendingList}
          </section>

          <section className="rounded-2xl border border-[color:var(--theme-card-border)] bg-[color:var(--theme-card-bg)] px-4 py-3">
            <h3 className="text-[15px] font-bold text-white">{t('timeline.aboutTitle')}</h3>
            <p className="text-[13px] text-[color:var(--theme-fg-muted)] mt-1 leading-relaxed">{t('timeline.aboutBody')}</p>
          </section>
        </div>
      </aside>
    </div>
  )
}
