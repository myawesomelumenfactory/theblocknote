const OVERLAY_KEY = 'immutablesOverlay'

export const PUBLISHED_IMMUTABLES_URL =
  import.meta.env.VITE_IMMUTABLES_URL ||
  'https://raw.githubusercontent.com/myawesomelumenfactory/theblocknote/main/public/data/immutables.json'

export function readImmutablesOverlay() {
  try {
    const parsed = JSON.parse(localStorage.getItem(OVERLAY_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function mergeImmutables(base, extra) {
  const byIndex = new Map()
  for (const row of [...(base || []), ...(extra || [])]) {
    if (!row?.index) continue
    byIndex.set(row.index, row)
  }
  return [...byIndex.values()]
}

export async function appendImmutable(entry) {
  const overlay = mergeImmutables(readImmutablesOverlay(), [entry])
  localStorage.setItem(OVERLAY_KEY, JSON.stringify(overlay))

  try {
    await fetch('/__immutables/append', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    })
  } catch {
    // Static hosts cannot write immutables.json; overlay still updates the UI.
  }

  return overlay
}

async function fetchImmutableList(url) {
  try {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) return []
    const data = await response.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

export async function loadImmutableRecords(bundled) {
  let records = Array.isArray(bundled) ? bundled : []
  records = mergeImmutables(
    records,
    await fetchImmutableList(`${import.meta.env.BASE_URL}data/immutables.json`)
  )
  records = mergeImmutables(records, await fetchImmutableList(PUBLISHED_IMMUTABLES_URL))
  return mergeImmutables(records, readImmutablesOverlay())
}
