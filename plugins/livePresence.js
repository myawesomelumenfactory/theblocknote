import { handleLivePresence } from '../services/livePresence.js'

export function livePresence() {
  return {
    name: 'live-presence',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          if (await handleLivePresence(req, res)) return
        } catch (error) {
          console.warn('Live presence failed:', error.message)
        }
        next()
      })
    },
  }
}
