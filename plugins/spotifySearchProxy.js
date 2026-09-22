const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const API = 'https://api.spotify.com/v1'
const PROXY_PREFIX = '/api/spotify'

let cachedToken = null
let tokenExpiresAt = 0
let tokenInFlight = null

async function getAccessToken(env, forceRefresh = false) {
  const clientId = env.SPOTIFY_CLIENT_ID
  const clientSecret = env.SPOTIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET')
  }

  const now = Date.now()
  if (!forceRefresh && cachedToken && now < tokenExpiresAt - 60_000) {
    return cachedToken
  }
  if (tokenInFlight) return tokenInFlight

  tokenInFlight = (async () => {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
    })
    const data = await response.json()
    if (!response.ok || !data.access_token) {
      throw new Error(data.error_description || data.error || `Spotify token failed (${response.status})`)
    }
    cachedToken = data.access_token
    tokenExpiresAt = Date.now() + (Number(data.expires_in) || 3600) * 1000
    return cachedToken
  })()

  try {
    return await tokenInFlight
  } finally {
    tokenInFlight = null
  }
}

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

function attachProxy(server, env) {
  server.middlewares.use(async (req, res, next) => {
    if (!req.url?.startsWith(PROXY_PREFIX)) return next()

    try {
      const url = new URL(req.url, 'http://127.0.0.1')
      if (url.pathname === `${PROXY_PREFIX}/search`) {
        const q = (url.searchParams.get('q') || '').trim()
        if (!q) return sendJson(res, 400, { error: 'Missing q' })
        if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) {
          return sendJson(res, 503, {
            error: 'Spotify search is not configured',
            code: 'SPOTIFY_NOT_CONFIGURED',
          })
        }

        const forward = async (forceRefresh = false) => {
          const token = await getAccessToken(env, forceRefresh)
          const endpoint = new URL(`${API}/search`)
          endpoint.searchParams.set('q', q)
          endpoint.searchParams.set('type', 'track')
          endpoint.searchParams.set('limit', url.searchParams.get('limit') || '8')
          return fetch(endpoint, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          })
        }

        let upstream = await forward(false)
        if (upstream.status === 401) {
          cachedToken = null
          tokenExpiresAt = 0
          upstream = await forward(true)
        }

        const data = await upstream.json()
        if (!upstream.ok) {
          return sendJson(res, upstream.status, {
            error: data.error?.message || data.error || 'Spotify search failed',
          })
        }

        const tracks = (data.tracks?.items || []).map((item) => ({
          trackId: item.id,
          title: item.name,
          artist: (item.artists || []).map((a) => a.name).join(', '),
          coverUrl: item.album?.images?.[1]?.url || item.album?.images?.[0]?.url || null,
          previewUrl: item.preview_url || null,
          embedUrl: `https://open.spotify.com/embed/track/${item.id}?utm_source=theblocknote`,
          provider: 'spotify',
        }))

        return sendJson(res, 200, { tracks })
      }

      return sendJson(res, 404, { error: 'Not found' })
    } catch (error) {
      console.warn('Spotify search proxy failed:', error.message)
      return sendJson(res, 502, { error: error.message || 'Spotify proxy failed' })
    }
  })
}

/**
 * Dev-server Spotify Client Credentials search proxy:
 *   GET /api/spotify/search?q=...
 *
 * Requires SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET in .env (not VITE_*).
 */
export function spotifySearchProxy(env = {}) {
  return {
    name: 'spotify-search-proxy',
    configureServer(server) {
      attachProxy(server, env)
    },
    configurePreviewServer(server) {
      attachProxy(server, env)
    },
  }
}
