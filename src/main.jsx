import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import { Buffer } from 'buffer'
import { LanguageProvider } from './i18n/LanguageContext'

window.Buffer = Buffer

if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister()
    }
  })
  if (window.caches) {
    caches.keys().then((keys) => {
      keys.forEach((key) => caches.delete(key))
    })
  }
}

const Router = import.meta.env.PROD ? HashRouter : BrowserRouter

createRoot(document.getElementById('root')).render(
  <Router>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </Router>,
)
