/**
 * Languages offered in the switcher. UI chrome is fully translated for `en` and
 * `fr`; every other code falls back to English labels. Message translation
 * (Translate button) uses `englishName` as the target for any selected language.
 */
export const LANGUAGES = [
  { code: 'ar', englishName: 'Arabic', nativeName: 'العربية', locale: 'ar', flag: '🇸🇦' },
  { code: 'bn', englishName: 'Bengali', nativeName: 'বাংলা', locale: 'bn-BD', flag: '🇧🇩' },
  { code: 'bg', englishName: 'Bulgarian', nativeName: 'Български', locale: 'bg-BG', flag: '🇧🇬' },
  { code: 'ca', englishName: 'Catalan', nativeName: 'Català', locale: 'ca-ES', flag: '🇦🇩' },
  { code: 'zh', englishName: 'Chinese (Simplified)', nativeName: '简体中文', locale: 'zh-CN', flag: '🇨🇳' },
  { code: 'zh-TW', englishName: 'Chinese (Traditional)', nativeName: '繁體中文', locale: 'zh-TW', flag: '🇹🇼' },
  { code: 'hr', englishName: 'Croatian', nativeName: 'Hrvatski', locale: 'hr-HR', flag: '🇭🇷' },
  { code: 'cs', englishName: 'Czech', nativeName: 'Čeština', locale: 'cs-CZ', flag: '🇨🇿' },
  { code: 'da', englishName: 'Danish', nativeName: 'Dansk', locale: 'da-DK', flag: '🇩🇰' },
  { code: 'nl', englishName: 'Dutch', nativeName: 'Nederlands', locale: 'nl-NL', flag: '🇳🇱' },
  { code: 'en', englishName: 'English', nativeName: 'English', locale: 'en-US', flag: '🇺🇸' },
  { code: 'et', englishName: 'Estonian', nativeName: 'Eesti', locale: 'et-EE', flag: '🇪🇪' },
  { code: 'fi', englishName: 'Finnish', nativeName: 'Suomi', locale: 'fi-FI', flag: '🇫🇮' },
  { code: 'fr', englishName: 'French', nativeName: 'Français', locale: 'fr-FR', flag: '🇫🇷' },
  { code: 'de', englishName: 'German', nativeName: 'Deutsch', locale: 'de-DE', flag: '🇩🇪' },
  { code: 'el', englishName: 'Greek', nativeName: 'Ελληνικά', locale: 'el-GR', flag: '🇬🇷' },
  { code: 'he', englishName: 'Hebrew', nativeName: 'עברית', locale: 'he-IL', flag: '🇮🇱' },
  { code: 'hi', englishName: 'Hindi', nativeName: 'हिन्दी', locale: 'hi-IN', flag: '🇮🇳' },
  { code: 'hu', englishName: 'Hungarian', nativeName: 'Magyar', locale: 'hu-HU', flag: '🇭🇺' },
  { code: 'id', englishName: 'Indonesian', nativeName: 'Bahasa Indonesia', locale: 'id-ID', flag: '🇮🇩' },
  { code: 'it', englishName: 'Italian', nativeName: 'Italiano', locale: 'it-IT', flag: '🇮🇹' },
  { code: 'ja', englishName: 'Japanese', nativeName: '日本語', locale: 'ja-JP', flag: '🇯🇵' },
  { code: 'ko', englishName: 'Korean', nativeName: '한국어', locale: 'ko-KR', flag: '🇰🇷' },
  { code: 'lv', englishName: 'Latvian', nativeName: 'Latviešu', locale: 'lv-LV', flag: '🇱🇻' },
  { code: 'lt', englishName: 'Lithuanian', nativeName: 'Lietuvių', locale: 'lt-LT', flag: '🇱🇹' },
  { code: 'ms', englishName: 'Malay', nativeName: 'Bahasa Melayu', locale: 'ms-MY', flag: '🇲🇾' },
  { code: 'no', englishName: 'Norwegian', nativeName: 'Norsk', locale: 'nb-NO', flag: '🇳🇴' },
  { code: 'fa', englishName: 'Persian', nativeName: 'فارسی', locale: 'fa-IR', flag: '🇮🇷' },
  { code: 'pl', englishName: 'Polish', nativeName: 'Polski', locale: 'pl-PL', flag: '🇵🇱' },
  { code: 'pt', englishName: 'Portuguese', nativeName: 'Português', locale: 'pt-PT', flag: '🇵🇹' },
  { code: 'pt-BR', englishName: 'Portuguese (Brazil)', nativeName: 'Português (Brasil)', locale: 'pt-BR', flag: '🇧🇷' },
  { code: 'ro', englishName: 'Romanian', nativeName: 'Română', locale: 'ro-RO', flag: '🇷🇴' },
  { code: 'ru', englishName: 'Russian', nativeName: 'Русский', locale: 'ru-RU', flag: '🇷🇺' },
  { code: 'sk', englishName: 'Slovak', nativeName: 'Slovenčina', locale: 'sk-SK', flag: '🇸🇰' },
  { code: 'sl', englishName: 'Slovenian', nativeName: 'Slovenščina', locale: 'sl-SI', flag: '🇸🇮' },
  { code: 'es', englishName: 'Spanish', nativeName: 'Español', locale: 'es-ES', flag: '🇪🇸' },
  { code: 'sv', englishName: 'Swedish', nativeName: 'Svenska', locale: 'sv-SE', flag: '🇸🇪' },
  { code: 'th', englishName: 'Thai', nativeName: 'ไทย', locale: 'th-TH', flag: '🇹🇭' },
  { code: 'tr', englishName: 'Turkish', nativeName: 'Türkçe', locale: 'tr-TR', flag: '🇹🇷' },
  { code: 'uk', englishName: 'Ukrainian', nativeName: 'Українська', locale: 'uk-UA', flag: '🇺🇦' },
  { code: 'ur', englishName: 'Urdu', nativeName: 'اردو', locale: 'ur-PK', flag: '🇵🇰' },
  { code: 'vi', englishName: 'Vietnamese', nativeName: 'Tiếng Việt', locale: 'vi-VN', flag: '🇻🇳' },
]

export const LOCALES = LANGUAGES.map((language) => language.code)

const byCode = new Map(LANGUAGES.map((language) => [language.code, language]))

export function languageOf(code) {
  return byCode.get(code) || null
}

/** MyMemory / API language code (zh-TW → zh-TW, pt-BR → pt-BR). */
export function translateCode(code) {
  return languageOf(code)?.code || 'en'
}

export function englishNameOf(code) {
  return languageOf(code)?.englishName || code
}

export function localeOf(code) {
  return languageOf(code)?.locale || 'en-US'
}

/** Match a browser tag like `pt-BR` or `zh-Hans` to a supported code. */
export function matchBrowserLanguage(tag) {
  const raw = String(tag || '').toLowerCase()
  if (!raw) return 'en'
  const exact = LOCALES.find((code) => code.toLowerCase() === raw)
  if (exact) return exact
  if (raw.startsWith('zh-hant') || raw.startsWith('zh-tw') || raw.startsWith('zh-hk')) return 'zh-TW'
  if (raw.startsWith('zh')) return 'zh'
  if (raw.startsWith('pt-br')) return 'pt-BR'
  if (raw.startsWith('pt')) return 'pt'
  if (raw.startsWith('nb') || raw.startsWith('nn') || raw.startsWith('no')) return 'no'
  const primary = raw.split('-')[0]
  return LOCALES.find((code) => code.toLowerCase() === primary) || 'en'
}
