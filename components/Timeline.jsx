import { useContext, useEffect, useMemo, useState } from 'react'
import { ExternalLink, Flame, Heart, Loader2, MessageCircle, Search, X } from 'lucide-react'
import immutablesData, { immutablesState } from 'virtual:immutables'
import { SharedContext } from '../src/SharedContext'
import { useLanguage } from '../src/i18n/LanguageContext'
import { applyComment, applyVoteUp, getHighestFundedUnit, sendBitcoinTransaction, validateUTXO } from '../services/BitcoinService'
import { appendImmutable, loadImmutableRecords, subscribeImmutables } from '../services/ImmutablesStore'
import { COMMENT_TEXT_MAX, MESSAGE_TEXT_MAX, encodeMessage } from '../services/immutableProtocol'
import { buildTimeline, buildTrending, trendingScore } from '../services/timeline'

const FEE = 450
const PAGE_SIZE = 20
const LIKED_KEY = 'theblocknote:timeline-liked'

function readLiked() {
  try {
    return new Set(JSON.parse(localStorage.getItem(LIKED_KEY) || '[]'))
  } catch {
    return new Set()
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

function PostItem({ post, t, locale, liked, canAct, busy, open, onToggle, onLike, onReply, highlighted }) {
  const [draft, setDraft] = useState('')
  return (
    <article
      id={`post-${post.index}`}
      className={`px-4 pt-3 pb-2 border-b border-[color:var(--theme-card-border)] transition-colors hover:bg-white/[0.03] ${
        highlighted ? 'bg-[color:var(--theme-accent)]/10' : ''
      }`}
    >
      <div className="flex gap-3">
        <Avatar seed={post.txid} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-[15px] min-w-0">
            <span className="font-bold text-white truncate">{t('timeline.entity')}</span>
            <span className="text-[color:var(--theme-fg-muted)] truncate">
              @{post.txid.slice(0, 8)} · {relativeTime(post.time, locale)}
            </span>
            {post.unconfirmed ? (
              <span className="ml-1 text-[11px] text-[color:var(--theme-fg-muted)] border border-[color:var(--theme-card-border)] rounded-full px-1.5">
                {t('timeline.mempool')}
              </span>
            ) : null}
            <span className="ml-auto text-[12px] text-[color:var(--theme-accent)] shrink-0">
              {t(`timeline.cat.${post.category}`)}
            </span>
          </div>
          <p className="text-[15px] leading-5 text-white whitespace-pre-wrap break-words mt-0.5">{post.text}</p>

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
            <button
              type="button"
              onClick={onLike}
              disabled={!canAct || busy === 'like'}
              title={canAct ? t('timeline.likeHint') : t('timeline.needUnit')}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 hover:text-pink-500 disabled:opacity-50 disabled:hover:text-inherit ${
                liked ? 'text-pink-500' : ''
              }`}
            >
              {busy === 'like' ? (
                <Loader2 className="w-[18px] h-[18px] animate-spin" />
              ) : (
                <Heart className="w-[18px] h-[18px]" fill={liked ? 'currentColor' : 'none'} />
              )}
              <span className="tabular-nums">{post.ups || ''}</span>
            </button>
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
          </div>

          {open ? (
            <div className="mt-1 mb-2 space-y-2">
              {post.comments.map((comment) => (
                <div key={comment.txid} className="flex gap-2">
                  <Avatar seed={comment.txid} size={24} />
                  <div className="min-w-0 text-[14px]">
                    <span className="text-[color:var(--theme-fg-muted)]">
                      @{comment.txid.slice(0, 8)} · {relativeTime(comment.time, locale)}
                    </span>
                    <p className="text-white break-words">{comment.text}</p>
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
                  onChange={(event) => setDraft(event.target.value.slice(0, COMMENT_TEXT_MAX))}
                  disabled={!canAct}
                  placeholder={canAct ? t('timeline.replyPlaceholder') : t('timeline.needUnit')}
                  className="flex-1 min-w-0 bg-transparent border-b border-[color:var(--theme-card-border)] py-1.5 text-[14px] text-white placeholder-[color:var(--theme-fg-subtle)] focus:outline-none focus:border-[color:var(--theme-accent)]"
                />
                <span className="text-[12px] tabular-nums text-[color:var(--theme-fg-subtle)]">
                  {COMMENT_TEXT_MAX - draft.length}
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
  const [query, setQuery] = useState('')
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [openThreads, setOpenThreads] = useState(() => new Set())
  const [highlight, setHighlight] = useState(null)
  const [liked, setLiked] = useState(readLiked)
  const [busy, setBusy] = useState({})
  const [notice, setNotice] = useState(null)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)

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

  const unit = getHighestFundedUnit(Array.isArray(refs) ? refs : [], FEE)
  const entityAddress = unit?.public_key || null
  const canAct = Boolean(unit)

  const posts = useMemo(() => buildTimeline(records), [records])
  const trending = useMemo(() => buildTrending(posts), [posts])

  const feed = useMemo(() => {
    const needle = query.trim().toLowerCase()
    let list = posts
    if (topic) {
      list = topic.startsWith('#')
        ? list.filter((p) => p.hashtags.includes(topic.slice(1)))
        : list.filter((p) => p.category === topic)
    }
    if (needle) list = list.filter((p) => p.text.toLowerCase().includes(needle))
    if (tab === 'trending') {
      const now = Date.now() / 1000
      list = [...list].sort((a, b) => trendingScore(b, now) - trendingScore(a, now))
    }
    return list
  }, [posts, topic, query, tab])

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

  const handlePost = async () => {
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

  const handleLike = async (post) => {
    setPostBusy(post.index, 'like')
    setNotice(null)
    try {
      const { selected, utxo } = await spendUnit()
      const [hash, vout] = post.index.split('_')
      const result = await applyVoteUp(utxo, hash, vout, FEE)
      if (!result.success) throw new Error(result.error || t('timeline.likeFailed'))
      await appendImmutable({
        index: `${result.transactionId}_0`,
        time: Math.floor(Date.now() / 1000),
        value: `t 0 1 ${hash} ${vout}`,
        unconfirmed: true,
      })
      setLiked((prev) => {
        const next = new Set(prev).add(post.index)
        localStorage.setItem(LIKED_KEY, JSON.stringify([...next]))
        return next
      })
      await finish(selected, result, t('timeline.liked'))
    } catch (err) {
      setNotice({ type: 'error', text: err.message || t('timeline.likeFailed') })
    } finally {
      setPostBusy(post.index, null)
    }
  }

  const handleReply = async (post, text) => {
    if (!text.trim()) return false
    setPostBusy(post.index, 'reply')
    setNotice(null)
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

  const remaining = MESSAGE_TEXT_MAX - draft.length

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
                  <Heart className="w-3 h-3" /> {post.ups}
                </span>                <span className="inline-flex items-center gap-1">
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

  return (
    <div className="w-full flex justify-center gap-8 px-0 lg:px-6 pb-16">
      <main className="w-full max-w-[680px] min-w-0 border-x border-[color:var(--theme-card-border)] bg-[color:var(--theme-card-bg)]">
        <div className="sticky top-0 z-10 bg-[color:var(--theme-card-bg)]/85 backdrop-blur-md border-b border-[color:var(--theme-card-border)]">
          <h2 className="px-4 pt-3 pb-1 text-xl font-bold text-white">{t('timeline.home')}</h2>
          <div className="flex" role="tablist">
            {['latest', 'trending', 'topics'].map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`flex-1 py-3 text-[15px] hover:bg-white/[0.06] ${id === 'topics' ? 'lg:hidden' : ''}`}
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
          <Avatar seed={entityAddress || '??'} />
          <div className="flex-1 min-w-0">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value.slice(0, MESSAGE_TEXT_MAX))}
              placeholder={t('timeline.composePlaceholder')}
              rows={2}
              className="w-full bg-transparent resize-none text-xl text-white placeholder-[color:var(--theme-fg-subtle)] focus:outline-none py-2"
            />
            <div className="flex items-center justify-between gap-3 border-t border-[color:var(--theme-card-border)] pt-2">
              <span className="text-[13px] text-[color:var(--theme-fg-muted)] truncate">
                {entityAddress
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
                  disabled={!canAct || !draft.trim() || posting}
                  className="rounded-full bg-[color:var(--theme-accent)] text-white font-bold text-[15px] px-5 py-2 hover:brightness-110 disabled:opacity-50"
                >
                  {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('timeline.post')}
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
                {t('timeline.viewTx')}
              </a>
            ) : null}
          </div>
        ) : null}

        {topic ? (
          <div className="px-4 py-2 border-b border-[color:var(--theme-card-border)] flex items-center gap-2 text-[14px]">
            <span className="text-[color:var(--theme-fg-muted)]">{t('timeline.filtered')}</span>
            <button
              type="button"
              onClick={() => setTopic(null)}
              className="inline-flex items-center gap-1 rounded-full bg-[color:var(--theme-accent)]/15 text-[color:var(--theme-accent)] px-3 py-0.5 font-semibold"
            >
              {topicLabel(topic)}
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : null}

        {tab === 'topics' ? (
          <div className="lg:hidden">{trendingList}</div>
        ) : feed.length === 0 ? (
          <p className="px-4 py-10 text-center text-[color:var(--theme-fg-muted)]">{t('timeline.empty')}</p>
        ) : (
          feed.slice(0, visible).map((post) => (
            <PostItem
              key={post.index}
              post={post}
              t={t}
              locale={locale}
              liked={liked.has(post.index)}
              canAct={canAct}
              busy={busy[post.index]}
              open={openThreads.has(post.index)}
              highlighted={highlight === post.index}
              onToggle={() => toggleThread(post.index)}
              onLike={() => handleLike(post)}
              onReply={(text) => handleReply(post, text)}
            />
          ))
        )}
        {tab !== 'topics' && feed.length > visible ? (
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

          <section className="rounded-2xl border border-[color:var(--theme-card-border)] overflow-hidden">
            <h3 className="px-4 pt-3 pb-2 text-xl font-bold text-white flex items-center gap-2">
              <Flame className="w-5 h-5 text-[color:var(--theme-accent)]" />
              {t('timeline.trendingTitle')}
            </h3>
            {trendingList}
          </section>

          <section className="rounded-2xl border border-[color:var(--theme-card-border)] px-4 py-3">
            <h3 className="text-[15px] font-bold text-white">{t('timeline.aboutTitle')}</h3>
            <p className="text-[13px] text-[color:var(--theme-fg-muted)] mt-1 leading-relaxed">{t('timeline.aboutBody')}</p>
          </section>
        </div>
      </aside>
    </div>
  )
}
