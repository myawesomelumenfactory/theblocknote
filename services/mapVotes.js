import { verifyEvent } from 'nostr-tools/pure'
import { MAP_VOTE_TAG, mapVoteText, validateMapVoteEvent } from './declarationCore'
import { getPool, loadArchive, stampAndPublish } from './declarations'
import { FREE_NOTE_RELAYS, getFreeNoteIdentity } from './freeNotes'

export { resolveDeclarationStatuses as resolveMapVoteStatuses } from './declarations'

/**
 * Free country upvote: the vote text is fingerprinted, stamped by OpenTimestamps
 * (anchored in Bitcoin within hours), announced on Nostr and pinned on IPFS.
 * @param {{ code: string, name: string }} country
 * @param {(step: 'stamping' | 'publishing') => void} [onStep]
 */
export async function postMapVote(country, onStep) {
  const { pubkey } = getFreeNoteIdentity()
  const time = Math.floor(Date.now() / 1000)
  const content = mapVoteText({ code: country.code, name: country.name, pubkey, time })
  const result = await stampAndPublish(
    {
      content,
      topic: MAP_VOTE_TAG,
      tags: [['country', country.code]],
      alt: `The Block Note map vote for ${country.name}, anchored in Bitcoin through OpenTimestamps`,
      createdAt: time,
    },
    onStep,
  )
  return {
    ...result,
    vote: {
      eventId: result.event.id,
      pubkey,
      time,
      code: country.code,
      cid: result.cid,
      digestHex: result.digestHex,
      proofs: [result.proof],
      anchor: null,
    },
  }
}

/** Free votes from the pinned archive merged with live ones from Nostr, each re-validated. */
export async function fetchMapVotes(limit = 2000) {
  const [archive, events] = await Promise.all([
    loadArchive('map-votes'),
    getPool()
      .querySync(FREE_NOTE_RELAYS, { kinds: [1], '#t': [MAP_VOTE_TAG], limit }, { maxWait: 4000 })
      .catch(() => []),
  ])

  const byId = new Map()
  for (const row of archive) {
    if (!row?.eventId || !row.code || !row.digest) continue
    byId.set(row.eventId, {
      eventId: row.eventId,
      pubkey: row.pubkey,
      time: row.created_at,
      code: row.code,
      cid: row.cid,
      digestHex: row.digest,
      proofs: row.ots ? [row.ots] : [],
      anchor: row.anchor || null,
    })
  }

  for (const event of events) {
    if (byId.has(event.id) || !verifyEvent(event)) continue
    const valid = await validateMapVoteEvent(event)
    if (!valid) continue
    byId.set(event.id, {
      eventId: event.id,
      pubkey: event.pubkey,
      time: event.created_at,
      code: valid.code,
      cid: valid.cid,
      digestHex: valid.digestHex,
      proofs: valid.ots ? [valid.ots] : [],
      anchor: null,
    })
  }
  return [...byId.values()].sort((a, b) => b.time - a.time)
}

/**
 * One free vote per key per country: Nostr keys cost nothing, so repeats from
 * the same key are not counted again.
 * @returns {Map<string, number>} code → distinct voters
 */
export function tallyMapVotes(votes) {
  const voters = new Map()
  for (const vote of votes) {
    if (!voters.has(vote.code)) voters.set(vote.code, new Set())
    voters.get(vote.code).add(vote.pubkey)
  }
  return new Map([...voters].map(([code, keys]) => [code, keys.size]))
}
