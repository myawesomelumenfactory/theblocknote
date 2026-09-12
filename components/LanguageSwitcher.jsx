import { useLanguage } from '../src/i18n/LanguageContext'

export default function LanguageSwitcher({ onSelect }) {
  const { lang, setLang, t } = useLanguage()

  const choose = (next) => {
    setLang(next)
    onSelect?.(next)
  }

  const buttonClass = (active) =>
    `px-2.5 py-1 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 ${
      active
        ? 'bg-[color:var(--theme-nav-active-bg)] text-white border border-[color:var(--theme-nav-active-border)]'
        : 'text-white/55 border border-transparent hover:text-white hover:bg-white/10'
    }`

  return (
    <div
      role="group"
      aria-label={t('lang.switcher')}
      className="flex items-center rounded-xl border border-white/10 bg-white/5 p-0.5"
    >
      <button
        type="button"
        aria-pressed={lang === 'en'}
        aria-label={t('lang.en')}
        className={buttonClass(lang === 'en')}
        onClick={() => choose('en')}
      >
        EN
      </button>
      <button
        type="button"
        aria-pressed={lang === 'fr'}
        aria-label={t('lang.fr')}
        className={buttonClass(lang === 'fr')}
        onClick={() => choose('fr')}
      >
        FR
      </button>
    </div>
  )
}
