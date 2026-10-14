export const THEMES = ['bitcoin-orange', 'deep-ledger', 'timeline']

export const DEFAULT_THEME = 'bitcoin-orange'

export const THEME_META = {
  'bitcoin-orange': {
    id: 'bitcoin-orange',
    nameKey: 'theme.bitcoinOrange',
  },
  'deep-ledger': {
    id: 'deep-ledger',
    nameKey: 'theme.deepLedger',
  },
  timeline: {
    id: 'timeline',
    nameKey: 'theme.timeline',
  },
}

export function isTheme(value) {
  return THEMES.includes(value)
}
