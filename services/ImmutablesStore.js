import { catchUpImmutables } from './ImmutableLiveFill.js'

const OVERLAY_KEY = 'immutablesOverlay'
const RECORDS_KEY = 'theblocknote.immutables'
const STATE_KEY = 'theblocknote.immutablesState'

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

function readStoredRecords() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECORDS_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function readStoredState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STATE_KEY) || 'null')
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function parseState(raw, records = []) {
  const lastHeight = Number(raw?.lastHeight)
  return {
    lastHeight: Number.isFinite(lastHeight) ? lastHeight : null,
    from: raw?.from ?? 906867,
    to: raw?.to ?? lastHeight ?? null,
    tip: Number(raw?.tip) || lastHeight || null,
    count: Array.isArray(records) ? records.length : Number(raw?.count) || 0,
    updatedAt: raw?.updatedAt || new Date().toISOString(),
  }
}

function persistSnapshot(records, state) {
  const nextState = parseState(state, records)
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records))
    localStorage.setItem(STATE_KEY, JSON.stringify(nextState))
  } catch {
    // Private mode or quota; the in-memory snapshot still renders.
  }
  return nextState
}

function hydrateFromBundled(bundledRecords, bundledState) {
  const bundled = Array.isArray(bundledRecords) ? bundledRecords : []
  const storedRecords = readStoredRecords()
  const storedState = parseState(readStoredState(), storedRecords)
  const pageState = parseState(bundledState, bundled)

  const storedHeight = storedState.lastHeight
  const pageHeight = pageState.lastHeight

  if (!Number.isFinite(storedHeight) || (Number.isFinite(pageHeight) && pageHeight > storedHeight)) {
    const records = mergeImmutables(storedRecords, bundled)
    const state = persistSnapshot(records, {
      ...pageState,
      count: records.length,
      updatedAt: new Date().toISOString(),
    })
    return { records, state }
  }

  const records = mergeImmutables(bundled, storedRecords)
  const state = persistSnapshot(records, {
    ...storedState,
    count: records.length,
    updatedAt: storedState.updatedAt || new Date().toISOString(),
  })
  return { records, state }
}

export async function appendImmutable(entry) {
  const overlay = mergeImmutables(readImmutablesOverlay(), [entry])
  localStorage.setItem(OVERLAY_KEY, JSON.stringify(overlay))

  const records = mergeImmutables(readStoredRecords(), [entry])
  persistSnapshot(records, {
    ...parseState(readStoredState(), records),
    count: records.length,
    updatedAt: new Date().toISOString(),
  })

  try {
    await fetch('/__immutables/append', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    })
  } catch {
    // Static hosts cannot write the JSON files; localStorage still updates the UI.
  }

  return overlay
}

const PROGRESS_EVENT = 'theblocknote:immutables-progress'

let catchUpInFlight = null
let lastProgress = {
  scanning: false,
  startHeight: null,
  tip: null,
  addedThisRun: 0,
  error: null,
}

function emitWindow(name, detail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(detail === undefined ? new Event(name) : new CustomEvent(name, { detail }))
}

function emitImmutablesUpdated() {
  emitWindow('theblocknote:immutables')
}

export function getImmutablesProgress() {
  const records = readStoredRecords()
  const state = parseState(readStoredState(), records)
  const lastHeight = state.lastHeight
  const tip = Number(lastProgress.tip) || state.tip
  const remaining =
    Number.isFinite(lastHeight) && Number.isFinite(tip) ? Math.max(0, tip - lastHeight) : null
  const startHeight = lastProgress.startHeight ?? lastHeight
  const catchUpSpan =
    Number.isFinite(tip) && Number.isFinite(startHeight) ? Math.max(1, tip - startHeight) : 1
  const catchUpDone =
    Number.isFinite(lastHeight) && Number.isFinite(startHeight)
      ? Math.max(0, lastHeight - startHeight)
      : 0
  const scanning = Boolean(catchUpInFlight) || lastProgress.scanning
  const caughtUp = Number.isFinite(lastHeight) && Number.isFinite(tip) && lastHeight >= tip

  return {
    scanning,
    caughtUp,
    lastHeight,
    tip,
    from: state.from,
    count: records.length,
    updatedAt: state.updatedAt,
    startHeight,
    addedThisRun: lastProgress.addedThisRun || 0,
    remaining,
    percent: caughtUp || remaining === 0
      ? 100
      : Math.min(100, (catchUpDone / catchUpSpan) * 100),
    error: lastProgress.error,
  }
}

function emitProgress(partial = {}) {
  lastProgress = {
    ...lastProgress,
    ...partial,
    scanning: partial.scanning ?? Boolean(catchUpInFlight),
  }
  emitWindow(PROGRESS_EVENT, getImmutablesProgress())
}

export function subscribeImmutablesProgress(onProgress) {
  if (typeof window === 'undefined') return () => {}
  const notify = (event) => onProgress(event?.detail || getImmutablesProgress())
  onProgress(getImmutablesProgress())
  window.addEventListener(PROGRESS_EVENT, notify)
  window.addEventListener('theblocknote:immutables', notify)
  return () => {
    window.removeEventListener(PROGRESS_EVENT, notify)
    window.removeEventListener('theblocknote:immutables', notify)
  }
}

function startCatchUp(lastHeight) {
  if (catchUpInFlight) return catchUpInFlight

  lastProgress = {
    scanning: true,
    startHeight: lastHeight,
    tip: lastProgress.tip,
    addedThisRun: 0,
    error: null,
  }
  emitProgress({ scanning: true, startHeight: lastHeight, addedThisRun: 0, error: null })

  catchUpInFlight = (async () => {
    const { extra, tip, lastHeight: scannedTo } = await catchUpImmutables(lastHeight, {
      onBlock: ({ height, tip: chainTip, added }) => {
        const records = mergeImmutables(readStoredRecords(), added)
        persistSnapshot(records, {
          ...parseState(readStoredState(), records),
          lastHeight: height,
          to: height,
          tip: chainTip,
          count: records.length,
          updatedAt: new Date().toISOString(),
        })
        lastProgress.addedThisRun += added.length
        emitProgress({
          scanning: true,
          tip: chainTip,
          lastHeight: height,
          addedThisRun: lastProgress.addedThisRun,
        })
      },
    })

    const records = mergeImmutables(readStoredRecords(), extra)
    persistSnapshot(records, {
      ...parseState(readStoredState(), records),
      lastHeight: scannedTo ?? lastHeight,
      to: scannedTo ?? lastHeight,
      tip: tip || parseState(readStoredState(), records).tip,
      count: records.length,
      updatedAt: new Date().toISOString(),
    })
    emitProgress({
      scanning: false,
      tip: tip || lastProgress.tip,
      addedThisRun: extra.length,
      error: null,
    })
    if ((scannedTo ?? lastHeight) !== lastHeight || extra.length) {
      emitImmutablesUpdated()
    }
    return records
  })()
    .catch((error) => {
      emitProgress({
        scanning: false,
        error: error?.message || 'Catch-up failed',
      })
      return readStoredRecords()
    })
    .finally(() => {
      catchUpInFlight = null
      lastProgress.scanning = false
      emitProgress({ scanning: false })
    })

  return catchUpInFlight
}

export async function loadImmutableRecords(bundledRecords, bundledState) {
  const snapshot = hydrateFromBundled(bundledRecords, bundledState)
  startCatchUp(snapshot.state.lastHeight)
  return mergeImmutables(snapshot.records, readImmutablesOverlay())
}
