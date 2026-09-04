const TOKEN_URL = 'https://login.blockstream.com/realms/blockstream-public/protocol/openid-connect/token'
const ENTERPRISE_API = 'https://enterprise.blockstream.info/api'
const PROXY_PREFIX = '/blockstream-api'

let cachedToken = null
let tokenExpiresAt = 0
let tokenInFlight = null

async function getAccessToken(env, forceRefresh = false) {
  const clientId = env.BLOCKSTREAM_CLIENT_ID
  const clientSecret = env.BLOCKSTREAM_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Missing BLOCKSTREAM_CLIENT_ID or BLOCKSTREAM_CLIENT_SECRET')
  }

  const now = Date.now()
  if (!forceRefresh && cachedToken && now < tokenExpiresAt - 60_000) {
    return cachedToken
  }
  if (tokenInFlight) return tokenInFlight

  tokenInFlight = (async () => {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
        scope: 'openid',
      }),
    })
    const data = await response.json()
    if (!response.ok || !data.access_token) {
      throw new Error(data.error_description || data.error || `Token request failed (${response.status})`)
    }
    cachedToken = data.access_token
    tokenExpiresAt = Date.now() + (Number(data.expires_in) || 300) * 1000
    return cachedToken
  })()

  try {
    return await tokenInFlight
  } finally {
    tokenInFlight = null
  }
}

function attachProxy(server, env) {
  server.middlewares.use(async (req, res, next) => {
    if (!req.url?.startsWith(PROXY_PREFIX)) return next()

    try {
      const path = req.url.slice(PROXY_PREFIX.length) || '/'
      const forward = async (forceRefresh = false) => {
        const token = await getAccessToken(env, forceRefresh)
        return fetch(`${ENTERPRISE_API}${path}`, {
          method: req.method,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: req.headers.accept || '*/*',
          },
        })
      }

      let upstream = await forward(false)
      if (upstream.status === 401) {
        cachedToken = null
        tokenExpiresAt = 0
        upstream = await forward(true)
      }

      const body = Buffer.from(await upstream.arrayBuffer())
      res.statusCode = upstream.status
      const contentType = upstream.headers.get('content-type')
      if (contentType) res.setHeader('Content-Type', contentType)
      res.end(body)
    } catch (error) {
      console.warn('Blockstream enterprise proxy failed:', error.message)
      res.statusCode = 502
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: error.message }))
    }
  })
}

export function blockstreamEnterpriseProxy(env) {
  return {
    name: 'blockstream-enterprise-proxy',
    configureServer(server) {
      attachProxy(server, env)
    },
    configurePreviewServer(server) {
      attachProxy(server, env)
    },
  }
}
