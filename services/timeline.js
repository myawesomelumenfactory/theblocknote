import { commentBelongsToMessage, parseProtocolValue } from './immutableProtocol'

/** Topic buckets for trending, matched against message text (first best match wins). */
export const TIMELINE_CATEGORIES = [
  {
    id: 'bitcoin',
    words: ['bitcoin', 'btc', 'block', 'blockchain', 'hash', 'eh/s', 'satoshi', 'stacking', 'immutable', 'decentraliz', 'verify', 'consensus', 'theblocknote', 'ledger'],
  },
  {
    id: 'voices',
    words: ['protest', 'right', 'revolution', 'resist', 'freedom', 'free', 'speech', 'censor', 'voice', 'vote', 'stand', 'prisoner', 'power to the people', 'shadow ban', 'expression', 'opinion', 'demand'],
  },
  {
    id: 'world',
    words: ['war', 'palestine', ' un ', 'u.n.', 'russia', 'ukraine', 'canada', 'eu ', 'europe', 'france', 'french', 'iran', 'us-', 'oil', 'government', 'immigration', 'corruption', 'budget', 'terror', 'arrest', 'army', 'strait', 'declaration', 'peace'],
  },
  {
    id: 'tech',
    words: ['tiktok', 'reddit', 'gafam', 'big tech', 'algorithm', ' ai', 'ai.', 'singularity', 'internet', 'social media'],
  },
  {
    id: 'society',
    words: ['climate', 'nature', 'creation', 'healthcare', 'health', 'education', 'school', 'humans', 'equal', 'mess', 'future'],
  },
  {
    id: 'culture',
    words: ['venice', 'film', 'movie', 'ovation', 'music', 'macklemore', 'festival', 'artist'],
  },
]
export const FALLBACK_CATEGORY = 'thoughts'

const HASHTAG_RE = /#([\p{L}\p{N}_]{2,30})/gu

export function hashtagsOf(text) {
  return [...String(text || '').matchAll(HASHTAG_RE)].map((m) => m[1].toLowerCase())
}

export function categorize(text) {
  const haystack = ` ${String(text || '').toLowerCase()} `
  let best = FALLBACK_CATEGORY
  let bestScore = 0
  for (const category of TIMELINE_CATEGORIES) {
    const score = category.words.reduce((n, word) => n + (haystack.includes(word) ? 1 : 0), 0)
    if (score > bestScore) {
      best = category.id
      bestScore = score
    }
  }
  return best
}

function stripQuotes(text) {
  return String(text || '').replace(/^"+|"+$/g, '').trim()
}

/**
 * Turn raw OP_RETURN records into posts with likes (upvotes), dislikes and replies.
 * @returns {Array<{ index, txid, time, text, unconfirmed, ups, downs, comments, category, hashtags }>}
 */
export function buildTimeline(records) {
  const posts = new Map()
  const votes = []
  const comments = []

  for (const record of records || []) {
    const parsed = parseProtocolValue(record.value)
    if (!parsed) continue
    if (parsed.kind === 'message') {
      const text = stripQuotes(parsed.text)
      if (!text || text === 'undefined') continue
      posts.set(record.index, {
        index: record.index,
        txid: String(record.index).split('_')[0],
        time: Number(record.time) || 0,
        text,
        unconfirmed: Boolean(record.unconfirmed),
        ups: 0,
        downs: 0,
        comments: [],
        category: categorize(text),
        hashtags: hashtagsOf(text),
      })
    } else if (parsed.kind === 'vote_up' || parsed.kind === 'vote_down') {
      votes.push({ target: `${parsed.hash}_${parsed.vout}`, up: parsed.kind === 'vote_up' })
    } else if (parsed.kind === 'comment') {
      comments.push({
        ...parsed,
        txid: String(record.index).split('_')[0],
        time: Number(record.time) || 0,
        unconfirmed: Boolean(record.unconfirmed),
      })
    }
  }

  for (const vote of votes) {
    const post = posts.get(vote.target)
    if (!post) continue
    if (vote.up) post.ups += 1
    else post.downs += 1
  }

  const list = [...posts.values()]
  for (const comment of comments) {
    const post = list.find((p) => commentBelongsToMessage(comment, p.index))
    if (post) post.comments.push({ txid: comment.txid, time: comment.time, text: comment.text, unconfirmed: comment.unconfirmed })
  }
  for (const post of list) post.comments.sort((a, b) => a.time - b.time)

  return list.sort((a, b) => b.time - a.time)
}

/** Engagement with time decay, so fresh discussion outranks old applause. */
export function trendingScore(post, now = Date.now() / 1000) {
  const engagement = 1 + post.ups - post.downs + 2 * post.comments.length
  const ageHours = Math.max(0, now - post.time) / 3600
  return engagement / Math.pow(ageHours + 2, 0.6)
}

/**
 * Trending posts grouped by category (and hashtag topics), best categories first.
 * @returns {Array<{ id, kind: 'category'|'hashtag', posts, count, engagement }>}
 */
export function buildTrending(posts, { perTopic = 3, now = Date.now() / 1000 } = {}) {
  const groups = new Map()
  const add = (id, kind, post) => {
    if (!groups.has(id)) groups.set(id, { id, kind, posts: [] })
    groups.get(id).posts.push(post)
  }
  for (const post of posts) {
    add(post.category, 'category', post)
    for (const tag of post.hashtags) add(`#${tag}`, 'hashtag', post)
  }

  return [...groups.values()]
    .map((group) => {
      const ranked = [...group.posts].sort((a, b) => trendingScore(b, now) - trendingScore(a, now))
      return {
        ...group,
        count: group.posts.length,
        engagement: ranked.reduce((n, p) => n + p.ups + p.comments.length, 0),
        heat: ranked.reduce((n, p) => n + trendingScore(p, now), 0),
        posts: ranked.slice(0, perTopic),
      }
    })
    .filter((group) => group.kind === 'category' || group.count > 1)
    .sort((a, b) => b.heat - a.heat)
}
