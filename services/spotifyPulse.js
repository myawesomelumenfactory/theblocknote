import {
  SPOTIFY_TRACK_ID_RE,
  parsePulseVoteValue,
  parseProtocolValue,
} from './immutableProtocol.js'

const OEMBED = 'https://open.spotify.com/oembed'
const ITUNES_SEARCH = 'https://itunes.apple.com/search'
const SPOTIFY_SEARCH = '/api/spotify/search'

/**
 * Extract a Spotify track id from a URL, URI, or bare id.
 */
export function extractSpotifyTrackId(input) {
  const raw = String(input || '').trim()
  if (!raw) return null
  if (SPOTIFY_TRACK_ID_RE.test(raw)) return raw

  const uri = raw.match(/spotify:track:([0-9A-Za-z]{22})/i)
  if (uri) return uri[1]

  try {
    const url = new URL(raw)
    if (!/spotify\.com$/i.test(url.hostname) && !/\.spotify\.com$/i.test(url.hostname)) {
      return null
    }
    const parts = url.pathname.split('/').filter(Boolean)
    const trackIdx = parts.findIndex((p) => p === 'track')
    if (trackIdx >= 0 && SPOTIFY_TRACK_ID_RE.test(parts[trackIdx + 1] || '')) {
      return parts[trackIdx + 1]
    }
  } catch {
    /* not a URL */
  }

  return null
}

export function spotifyTrackUrl(trackId) {
  return `https://open.spotify.com/track/${trackId}`
}

export function spotifyEmbedUrl(trackId) {
  return `https://open.spotify.com/embed/track/${trackId}?utm_source=theblocknote`
}

/**
 * Resolve title + cover via Spotify oEmbed (no API key; CORS-friendly).
 */
export async function fetchSpotifyTrackMeta(trackId) {
  const id = String(trackId || '').trim()
  if (!SPOTIFY_TRACK_ID_RE.test(id)) {
    throw new Error('Invalid Spotify track id')
  }

  const url = `${OEMBED}?url=${encodeURIComponent(spotifyTrackUrl(id))}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Spotify oEmbed HTTP ${response.status}`)
  const data = await response.json()

  return {
    trackId: id,
    title: String(data?.title || 'Unknown track').trim(),
    artist: null,
    coverUrl: data?.thumbnail_url || null,
    embedUrl: data?.iframe_url || spotifyEmbedUrl(id),
    previewUrl: null,
    provider: 'spotify',
  }
}

async function searchSpotifyTracks(query, limit = 8) {
  try {
    const endpoint = `${SPOTIFY_SEARCH}?q=${encodeURIComponent(query)}&limit=${limit}`
    const response = await fetch(endpoint)
    if (response.status === 503) {
      const data = await response.json().catch(() => ({}))
      return {
        ok: false,
        configured: false,
        tracks: [],
        error: data.error || 'Spotify not configured',
      }
    }
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      return {
        ok: false,
        configured: true,
        tracks: [],
        error: data.error || `Spotify search HTTP ${response.status}`,
      }
    }
    const data = await response.json()
    return {
      ok: true,
      configured: true,
      tracks: Array.isArray(data.tracks) ? data.tracks : [],
    }
  } catch (error) {
    return {
      ok: false,
      configured: null,
      tracks: [],
      error: error.message || 'Spotify search failed',
    }
  }
}

async function searchItunesTracks(query, limit = 8) {
  try {
    const endpoint =
      `${ITUNES_SEARCH}?term=${encodeURIComponent(query)}` +
      `&entity=song&limit=${limit}`
    const response = await fetch(endpoint)
    if (!response.ok) return []
    const data = await response.json()
    return (data.results || [])
      .filter((row) => row.kind === 'song' && row.trackName)
      .map((row) => ({
        trackId: null,
        itunesId: String(row.trackId),
        title: row.trackName,
        artist: row.artistName || null,
        coverUrl:
          String(row.artworkUrl100 || '').replace('100x100bb', '300x300bb') || null,
        previewUrl: row.previewUrl || null,
        embedUrl: null,
        provider: 'itunes',
        displayTitle: `${row.trackName}${row.artistName ? ` · ${row.artistName}` : ''}`,
      }))
  } catch {
    return []
  }
}

/**
 * Live typeahead search.
 * Prefers Spotify (Vite /api/spotify proxy). Falls back to iTunes (no API key).
 * When Spotify is configured, iTunes hits are upgraded to Spotify track ids.
 */
export async function searchTracks(query, { limit = 8 } = {}) {
  const q = String(query || '').trim()
  if (q.length < 2) return { tracks: [], source: null }

  const asSpotifyId = extractSpotifyTrackId(q)
  if (asSpotifyId) {
    const meta = await fetchSpotifyTrackMeta(asSpotifyId)
    return { tracks: [meta], source: 'spotify', spotifyConfigured: true }
  }

  const spotify = await searchSpotifyTracks(q, limit)
  if (spotify.ok && spotify.tracks.length) {
    return {
      tracks: spotify.tracks,
      source: 'spotify',
      spotifyConfigured: true,
    }
  }

  const itunes = await searchItunesTracks(q, limit)
  if (!itunes.length) {
    return {
      tracks: [],
      source: null,
      spotifyConfigured: spotify.configured,
      error: spotify.error || null,
    }
  }

  // Spotify configured but empty/error — still try title upgrades per iTunes hit.
  if (spotify.configured) {
    const upgraded = []
    for (const hit of itunes) {
      const match = await searchSpotifyTracks(
        `track:${hit.title}${hit.artist ? ` artist:${hit.artist}` : ''}`,
        1
      )
      if (match.ok && match.tracks[0]) upgraded.push(match.tracks[0])
      else upgraded.push(hit)
    }
    return {
      tracks: upgraded,
      source: upgraded.some((t) => t.provider === 'spotify') ? 'mixed' : 'itunes',
      spotifyConfigured: true,
    }
  }

  return {
    tracks: itunes,
    source: 'itunes',
    spotifyConfigured: false,
    error: spotify.error || null,
  }
}

/**
 * Aggregate on-chain pulse votes into a ranked chart.
 * Optional metaById enriches rows with title/cover once fetched.
 */
export function rankPulseTracks(records, metaById = {}) {
  const tallies = new Map()

  for (const row of records || []) {
    const parsed =
      row?.kind === 'pulse_vote'
        ? { kind: 'pulse_vote', trackId: row.trackId, provider: row.provider || 's' }
        : parsePulseVoteValue(row?.value) || parseProtocolValue(row?.value)
    if (parsed?.kind !== 'pulse_vote' || !parsed.trackId) continue

    const key = parsed.trackId
    const current = tallies.get(key) || {
      trackId: key,
      provider: parsed.provider || 's',
      votes: 0,
      latestTime: 0,
      samples: [],
    }
    current.votes += 1
    const time = Number(row?.time) || 0
    if (time > current.latestTime) current.latestTime = time
    if (row?.index) current.samples.push(row.index)
    tallies.set(key, current)
  }

  const ranked = [...tallies.values()].sort((a, b) => {
    if (b.votes !== a.votes) return b.votes - a.votes
    return b.latestTime - a.latestTime
  })

  return ranked.map((row, index) => {
    const meta = metaById[row.trackId] || {}
    return {
      ...row,
      rank: index + 1,
      title: meta.title || null,
      artist: meta.artist || null,
      coverUrl: meta.coverUrl || null,
      embedUrl: meta.embedUrl || spotifyEmbedUrl(row.trackId),
    }
  })
}
