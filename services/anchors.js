import { verifyEvent } from 'nostr-tools/pure'
import { base64ToBytes, describeProof } from './opentimestamps'
import {
  DECLARATION_TAG,
  KIND_COMMENT,
  KIND_EVENT_REACTION,
  KIND_EXTERNAL_REACTION,
  MAP_VOTE_TAG,
  REPLY_TAG,
  VOTE_TAG,
  tagValue,
  validateDeclarationEvent,
  validateMapVoteEvent,
  validateReplyEvent,
  validateVoteEvent,
} from './declarationCore'
import { getPool, loadArchive } from './declarations'
import { FREE_NOTE_RELAYS } from './freeNotes'

export const ANCHOR_TOPICS = [DECLARATION_TAG, REPLY_TAG, VOTE_TAG, MAP_VOTE_TAG]

const TYPE_BY_TOPIC = {
  [DECLARATION_TAG]: 'declaration',
  [REPLY_TAG]: 'reply',
  [VOTE_TAG]: 'vote',
  [MAP_VOTE_TAG]: 'mapVote',
}

const VALIDATORS = {
  declaration: validateDeclarationEvent,
  reply: validateReplyEvent,
  vote: validateVoteEvent,
  mapVote: validateMapVoteEvent,
}

const ARCHIVES = [
  ['declarations', 'declaration'],
  ['replies', 'reply'],
  ['votes', 'vote'],
  ['map-votes', 'mapVote'],
]

function summarize(type, content, extra = {}) {
  if (type === 'vote') return extra.direction === 'down' || content === '-' ? '−1' : '+1'
  if (type === 'mapVote') return String(content || '').split('\n')[0].replace(/^Map vote · /, '') || extra.code || ''
  return content || ''
}

async function pendingCalendars(b64) {
  try {
    const { calendars } = await describeProof(base64ToBytes(b64))
    return calendars.map((url) => url.replace(/^https?:\/\//, '').replace(/\/+$/, ''))
  } catch {
    return []
  }
}

/** Turn a relay event into a queue item, or null when it does not check out. */
export async function anchorItemFromEvent(event) {
  const type = TYPE_BY_TOPIC[tagValue(event, 't')]
  if (!type || !verifyEvent(event)) return null
  const valid = await VALIDATORS[type](event)
  if (!valid?.ots) return null
  return {
    eventId: event.id,
    type,
    time: event.created_at,
    text: summarize(type, event.content),
    cid: valid.cid,
    digestHex: valid.digestHex,
    proofs: [valid.ots],
    anchor: null,
    calendars: await pendingCalendars(valid.ots),
  }
}

/**
 * Every The Block Note item stamped since `since` (seconds): declarations, replies,
 * votes and map votes, from the relays and the pinned archives.
 */
export async function fetchAnchorQueue({ since, limit = 500 } = {}) {
  const [events, ...archives] = await Promise.all([
    getPool()
      .querySync(
        FREE_NOTE_RELAYS,
        {
          kinds: [1, KIND_EVENT_REACTION, KIND_EXTERNAL_REACTION, KIND_COMMENT],
          '#t': ANCHOR_TOPICS,
          ...(since ? { since } : {}),
          limit,
        },
        { maxWait: 5000 },
      )
      .catch(() => []),
    ...ARCHIVES.map(([name]) => loadArchive(name)),
  ])

  const byId = new Map()
  archives.forEach((rows, i) => {
    const type = ARCHIVES[i][1]
    for (const row of rows) {
      const time = Number(row?.created_at)
      if (!row?.eventId || !row.digest || !row.ots || (since && time < since)) continue
      byId.set(row.eventId, {
        eventId: row.eventId,
        type,
        time,
        text: summarize(type, '', row),
        cid: row.cid,
        digestHex: row.digest,
        proofs: [row.ots],
        anchor: row.anchor || null,
        calendars: [],
      })
    }
  })

  const items = await Promise.all(events.map(anchorItemFromEvent))
  for (const item of items) {
    if (!item) continue
    const archived = byId.get(item.eventId)
    byId.set(item.eventId, archived ? { ...item, anchor: archived.anchor } : item)
  }

  const list = [...byId.values()]
  await Promise.all(
    list.map(async (item) => {
      if (item.calendars.length === 0 && !item.anchor) item.calendars = await pendingCalendars(item.proofs[0])
    }),
  )
  return list.sort((a, b) => b.time - a.time)
}

/** Time and height of the latest Bitcoin block, from mempool.space. */
export async function fetchLatestBlock() {
  const res = await fetch('https://mempool.space/api/v1/blocks')
  if (!res.ok) throw new Error(`mempool.space answered ${res.status}`)
  const [block] = await res.json()
  return block ? { height: block.height, time: block.timestamp } : null
}
