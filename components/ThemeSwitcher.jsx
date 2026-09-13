import { useTheme } from '../src/theme/ThemeContext'
import { THEME_META } from '../src/theme/themes'
import { useLanguage } from '../src/i18n/LanguageContext'

export default function ThemeSwitcher() {
  const { theme, setTheme, themes } = useTheme()
  const { t } = useLanguage()

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 pb-4 pt-2">
      <div
        role="group"
        aria-label={t('theme.switcher')}
        className="theme-glass chrome-toggle mx-auto max-w-md flex items-center justify-center gap-1 rounded-2xl border border-[color:var(--theme-card-border)] bg-[color:var(--theme-card-bg)] p-1 shadow-[var(--theme-panel-shadow)]"
      >
        {themes.map((id) => {
          const active = theme === id
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => setTheme(id)}
              className={`flex-1 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold tracking-wide transition-all duration-200 ${
                active
                  ? 'bg-[color:var(--theme-nav-active-bg)] text-white border border-[color:var(--theme-nav-active-border)] shadow-[var(--theme-nav-active-shadow)]'
                  : 'text-[color:var(--theme-fg-muted)] border border-transparent hover:text-[color:var(--theme-fg)] hover:bg-[color:var(--theme-chip-bg)]'
              }`}
            >
              {t(THEME_META[id].nameKey)}
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-center text-[11px] text-[color:var(--theme-fg-subtle)]">{t('theme.hint')}</p>
    </div>
  )
}
