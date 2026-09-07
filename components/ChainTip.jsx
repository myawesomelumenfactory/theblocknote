import { useChainTip } from '../services/ChainTipStore'
import { useLanguage } from '../src/i18n/LanguageContext'

export default function ChainTip() {
  const height = useChainTip()
  const { t, locale } = useLanguage()
  const label = Number.isFinite(height) ? height.toLocaleString(locale) : '—'

  return (
    <a
      href={Number.isFinite(height) ? `https://mempool.space/block/${height}` : 'https://mempool.space'}
      target="_blank"
      rel="noopener noreferrer"
      title={Number.isFinite(height) ? t('chain.latestNamed', { height: label }) : t('chain.latest')}
      className="flex flex-col items-start leading-none pr-1"
    >
      <span className="text-[10px] uppercase tracking-wide text-white/40">{t('chain.block')}</span>
      <span className="text-sm font-semibold text-white tabular-nums">{label}</span>
    </a>
  )
}
