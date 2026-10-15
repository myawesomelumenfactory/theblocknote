import { useState } from 'react'
import { Languages, Loader2 } from 'lucide-react'
import { translateText } from '../services/translate'
import { useLanguage } from '../src/i18n/LanguageContext'

/**
 * "Translate" toggle for a message. Renders the translation below the button
 * in the user's interface language, with the provider credited.
 */
export default function TranslateButton({ text, className = '', textClassName = '' }) {
  const { t, lang } = useLanguage()
  const [state, setState] = useState({ status: 'idle' })

  const toggle = async () => {
    if (state.status === 'done' && state.lang === lang) {
      setState({ status: 'idle' })
      return
    }
    setState({ status: 'loading' })
    try {
      const result = await translateText(text, lang)
      setState({ status: 'done', lang, ...result })
    } catch {
      setState({ status: 'error' })
    }
  }

  const shown = state.status === 'done' && state.lang === lang

  return (
    <div className={className}>
      <button
        type="button"
        onClick={toggle}
        disabled={state.status === 'loading'}
        className="inline-flex items-center gap-1 text-[13px] text-[color:var(--theme-accent)] hover:underline disabled:opacity-60"
      >
        {state.status === 'loading' ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Languages className="w-3.5 h-3.5" />
        )}
        {state.status === 'loading' ? t('translate.loading') : shown ? t('translate.hide') : t('translate.show')}
      </button>
      {state.status === 'error' ? (
        <p className="text-[13px] text-red-400 mt-1">{t('translate.failed')}</p>
      ) : null}
      {shown ? (
        <div className="mt-1 border-l-2 border-[color:var(--theme-accent)]/40 pl-2">
          <p className={textClassName}>{state.same ? t('translate.same') : state.text}</p>
          <p className="text-[12px] text-[color:var(--theme-fg-subtle)] mt-0.5">
            {t('translate.credit', { provider: state.provider })}
          </p>
        </div>
      ) : null}
    </div>
  )
}
