import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useLanguage } from '../src/i18n/LanguageContext'

const JAAS_APP_ID = 'vpaas-magic-cookie-22d2622ea03d488c89ba1f45f3fb7e73'
const JAAS_DOMAIN = '8x8.vc'
const JAAS_ROOM = `${JAAS_APP_ID}/SampleAppKeenVisasCopeVery`
const JAAS_SCRIPT = `https://8x8.vc/${JAAS_APP_ID}/external_api.js`

function loadJaasScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'))
  if (window.JitsiMeetExternalAPI) return Promise.resolve(window.JitsiMeetExternalAPI)

  const existing = document.querySelector(`script[src="${JAAS_SCRIPT}"]`)
  if (existing) {
    return new Promise((resolve, reject) => {
      if (window.JitsiMeetExternalAPI) {
        resolve(window.JitsiMeetExternalAPI)
        return
      }
      existing.addEventListener('load', () => resolve(window.JitsiMeetExternalAPI))
      existing.addEventListener('error', () => reject(new Error('Failed to load JaaS')))
    })
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = JAAS_SCRIPT
    script.async = true
    script.onload = () => resolve(window.JitsiMeetExternalAPI)
    script.onerror = () => reject(new Error('Failed to load JaaS'))
    document.head.appendChild(script)
  })
}

/**
 * 8x8 JaaS / Jitsi video stream room.
 */
export default function DirectStreamPage() {
  const { t } = useLanguage()
  const containerRef = useRef(null)
  const apiRef = useRef(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function mount() {
      try {
        setStatus('loading')
        setError(null)
        const JitsiMeetExternalAPI = await loadJaasScript()
        if (cancelled || !containerRef.current) return
        if (!JitsiMeetExternalAPI) throw new Error('JitsiMeetExternalAPI missing')

        // Tear down any prior instance before remounting.
        if (apiRef.current) {
          try {
            apiRef.current.dispose()
          } catch {
            /* ignore */
          }
          apiRef.current = null
        }
        containerRef.current.innerHTML = ''

        apiRef.current = new JitsiMeetExternalAPI(JAAS_DOMAIN, {
          roomName: JAAS_ROOM,
          parentNode: containerRef.current,
          width: '100%',
          height: '100%',
          configOverwrite: {
            prejoinConfig: { enabled: true },
          },
          interfaceConfigOverwrite: {
            MOBILE_APP_PROMO: false,
          },
        })
        if (!cancelled) setStatus('ready')
      } catch (err) {
        console.error(err)
        if (!cancelled) {
          setStatus('error')
          setError(err.message || t('stream.error'))
        }
      }
    }

    mount()

    return () => {
      cancelled = true
      if (apiRef.current) {
        try {
          apiRef.current.dispose()
        } catch {
          /* ignore */
        }
        apiRef.current = null
      }
    }
  }, [t])

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 pt-4 pb-8">
      <div className="mx-auto max-w-6xl space-y-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
          <h2 className="text-lg font-bold text-white">{t('stream.title')}</h2>
        </div>
        <p className="text-sm text-white/50">{t('stream.lead')}</p>

        <div
          className="relative overflow-hidden rounded-2xl border border-red-500/30 bg-black"
          style={{ height: 'min(78vh, 720px)' }}
        >
          {status === 'loading' ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-black/80 text-white/70">
              <Loader2 className="h-5 w-5 animate-spin text-red-400" />
              {t('stream.loading')}
            </div>
          ) : null}
          {status === 'error' ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center px-6 text-center text-sm text-red-300">
              {error || t('stream.error')}
            </div>
          ) : null}
          <div ref={containerRef} id="jaas-container" className="h-full w-full" />
        </div>
      </div>
    </div>
  )
}
