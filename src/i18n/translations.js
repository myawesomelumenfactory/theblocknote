import { LOCALES } from './languages'

/**
 * UI catalogs live in `src/i18n/locales/*.json`.
 * English and French are hand-maintained; other languages are generated
 * with `node scripts/generate-ui-locales.mjs`.
 */
const localeModules = import.meta.glob('./locales/*.json', { eager: true })

function codeFromPath(filePath) {
  const match = filePath.match(/\/([^/]+)\.json$/)
  return match ? match[1] : null
}

export const translations = Object.fromEntries(
  Object.entries(localeModules)
    .map(([filePath, mod]) => {
      const code = codeFromPath(filePath)
      return code ? [code, mod.default || mod] : null
    })
    .filter(Boolean),
)

for (const code of LOCALES) {
  if (!translations[code]) {
    console.warn(`[i18n] Missing locale file for "${code}", falling back to English`)
  }
}

export const LIVE_KIND_COUNT = translations.en?.live?.kinds?.length || 20
