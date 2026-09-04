import { fillRecentImmutables } from './ImmutableLiveFill.js'

const OVERLAY_KEY = 'immutablesOverlay'

export const PUBLISHED_IMMUTABLES_URL =
  import.meta.env.VITE_IMMUTABLES_URL ||
  'https://raw.githubusercontent.com/myawesomelumenfactory/theblocknote/main/public/data/immutables.json'

export const PUBLISHED_STATE_URL =
  import.meta.env.VITE_IMMUTABLES_STATE_URL ||
  'https://raw.githubusercontent.com/myawesomelumenfactory/theblocknote/main/public/data/immutables-state.json'

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

async function fetchJson(url) {
  try {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

async function fetchImmutableList(url) {
  const data = await fetchJson(url)
  return Array.isArray(data) ? data : []
}

async function fetchPublishedState() {
  const local = await fetchJson(`${import.meta.env.BASE_URL}data/immutables-state.json`)
  const published = await fetchJson(PUBLISHED_STATE_URL)
  const lastHeight = [published, local]
    .map((row) => Number(row?.lastHeight))
    .filter((height) => Number.isFinite(height))
  return lastHeight.length ? Math.max(...lastHeight) : null
}

export async function loadImmutableRecords(bundled) {
  let records = Array.isArray(bundled) ? bundled : []
  records = mergeImmutables(
    records,
    await fetchImmutableList(`${import.meta.env.BASE_URL}data/immutables.json`)
  )
  records = mergeImmutables(records, await fetchImmutableList(PUBLISHED_IMMUTABLES_URL))

  try {
    const lastHeight = await fetchPublishedState()
    records = mergeImmutables(records, await fillRecentImmutables(lastHeight))
  } catch {
    // Keep the published file if the live tip fill cannot run.
  }

  return mergeImmutables(records, readImmutablesOverlay())
}
