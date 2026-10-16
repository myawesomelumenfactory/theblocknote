import { useEffect, useState } from 'react'
import { Languages, Loader2 } from 'lucide-react'
import { translateText } from '../services/translate'
import { useLanguage } from '../src/i18n/LanguageContext'
import { englishNameOf } from '../src/i18n/languages'

/**
 * "Translate" toggle for a message. Renders the translation below the button
 * in the language selected in the switcher.
 */
export default function TranslateButton({ text, className = '', textClassName = '' }) {
  const { t, lang } = useLanguage()
  const [state, setState] = useState({ status: 'idle' })
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open || !text) return
    let cancelled = false
    setState({ status: 'loading' })
    translateText(text, lang)
      .then((result) => {
        if (!cancelled) setState({ status: 'done', lang, ...result })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [open, text, lang])

  const toggle = () => {
    if (open) {
      setOpen(false)
      setState({ status: 'idle' })
      return
    }
    setOpen(true)
  }

  const shown = open && state.status === 'done' && state.lang === lang
  const targetName = englishNameOf(lang)

  return (
    <div className={className}>
      <button
        type="button"
        onClick={toggle}
        disabled={open && state.status === 'loading'}
        title={t('translate.into', { language: targetName })}
        className="inline-flex items-center gap-1 text-[13px] text-[color:var(--theme-accent)] hover:underline disabled:opacity-60"
      >
        {open && state.status === 'loading' ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Languages className="w-3.5 h-3.5" />
        )}
        {open && state.status === 'loading'
          ? t('translate.loading')
          : open
            ? t('translate.hide')
            : t('translate.show')}
      </button>
      {open && state.status === 'error' ? (
        <p className="text-[13px] text-red-400 mt-1">{t('translate.failed')}</p>
      ) : null}
      {shown ? (
        <div className="mt-1 border-l-2 border-[color:var(--theme-accent)]/40 pl-2">
          <p className={textClassName}>{state.same ? t('translate.same') : state.text}</p>
          <p className="text-[12px] text-[color:var(--theme-fg-subtle)] mt-0.5">
            {t('translate.credit', { provider: state.provider })}
            {' · '}
            {targetName}
          </p>
        </div>
      ) : null}
    </div>
  )
}
