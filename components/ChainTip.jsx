import { useChainTip } from '../services/ChainTipStore'

export default function ChainTip() {
  const height = useChainTip()
  const label = Number.isFinite(height) ? height.toLocaleString('en-US') : '—'

  return (
    <a
      href={Number.isFinite(height) ? `https://mempool.space/block/${height}` : 'https://mempool.space'}
      target="_blank"
      rel="noopener noreferrer"
      title={Number.isFinite(height) ? `Latest Bitcoin block ${label}` : 'Latest Bitcoin block'}
      className="flex flex-col items-start leading-none pr-1"
    >
      <span className="text-[10px] uppercase tracking-wide text-white/40">Block</span>
      <span className="text-sm font-semibold text-white tabular-nums">{label}</span>
    </a>
  )
}
