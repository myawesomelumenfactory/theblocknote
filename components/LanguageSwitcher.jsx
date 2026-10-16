import { useLanguage } from '../src/i18n/LanguageContext'
import { LANGUAGES, languageOf } from '../src/i18n/languages'

export default function LanguageSwitcher({ onSelect }) {
  const { lang, setLang, t } = useLanguage()
  const current = languageOf(lang)

  const choose = (next) => {
    setLang(next)
    onSelect?.(next)
  }

  return (
    <label className="chrome-toggle relative inline-flex items-center rounded-xl border border-white/10 bg-white/5">
      <span className="sr-only">{t('lang.switcher')}</span>
      <select
        value={lang}
        aria-label={t('lang.switcher')}
        title={current ? `${current.flag} ${current.nativeName} · ${current.englishName}` : t('lang.switcher')}
        onChange={(event) => choose(event.target.value)}
        className="appearance-none cursor-pointer bg-transparent text-white text-xs font-semibold tracking-wide pl-2.5 pr-7 py-1.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-white/30 max-w-[11rem]"
      >
        {LANGUAGES.map((language) => (
          <option key={language.code} value={language.code} className="bg-[#111] text-white">
            {language.flag} {language.nativeName}
          </option>
        ))}
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-2 text-white/50 text-[10px] leading-none"
      >
        ▾
      </span>
    </label>
  )
}
