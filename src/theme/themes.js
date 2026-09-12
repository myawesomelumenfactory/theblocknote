export const THEMES = ['bitcoin-orange', 'deep-ledger']

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
}

export function isTheme(value) {
  return THEMES.includes(value)
}
