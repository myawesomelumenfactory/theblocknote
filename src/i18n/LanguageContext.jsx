import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { LOCALES, localeOf, matchBrowserLanguage } from './languages'
import { translations } from './translations'

const STORAGE_KEY = 'theblocknote.lang'
const LanguageContext = createContext(null)

function detectLocale() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (LOCALES.includes(stored)) return stored
  } catch {
    // Ignore storage errors.
  }
  const browser = typeof navigator !== 'undefined' ? navigator.language || '' : ''
  return matchBrowserLanguage(browser)
}

function lookup(dict, key) {
  return key.split('.').reduce((value, part) => (value == null ? value : value[part]), dict)
}

function interpolate(template, vars) {
  if (typeof template !== 'string') return template
  return template.replace(/\{(\w+)\}/g, (_, name) =>
    vars[name] == null ? '' : String(vars[name])
  )
}

/** Prefer the selected language catalog; fall back to English for missing keys/files. */
function uiDict(lang) {
  return translations[lang] || translations.en
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(detectLocale)

  const setLang = useCallback((next) => {
    if (!LOCALES.includes(next)) return
    setLangState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Ignore storage errors.
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = ['ar', 'he', 'fa', 'ur'].includes(lang) ? 'rtl' : 'ltr'
    document.title = lookup(uiDict(lang), 'app.title') || 'The Block Note'
  }, [lang])

  const t = useCallback(
    (key, vars = {}) => {
      const raw = lookup(uiDict(lang), key) ?? lookup(translations.en, key) ?? key
      return interpolate(raw, vars)
    },
    [lang]
  )

  const value = useMemo(
    () => ({
      lang,
      setLang,
      t,
      locale: localeOf(lang),
    }),
    [lang, setLang, t]
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const value = useContext(LanguageContext)
  if (!value) {
    throw new Error('useLanguage must be used within LanguageProvider')
  }
  return value
}
