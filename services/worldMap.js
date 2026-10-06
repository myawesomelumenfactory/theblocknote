import { geoNaturalEarth1, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import worldTopology from 'world-atlas/countries-110m.json'
import { parseCountryVoteValue } from './immutableProtocol'

export const MAP_WIDTH = 960
export const MAP_HEIGHT = 500

/** Places the atlas ships without an ISO 3166-1 numeric id. */
const CODES_BY_NAME = {
  Kosovo: 'XKX',
  'N. Cyprus': 'XNC',
  Somaliland: 'XSL',
}

let cachedCountries = null

/**
 * Every country in the atlas with a stable vote code and a pre-projected SVG path.
 * @returns {{ code: string, name: string, path: string }[]}
 */
export function getWorldCountries() {
  if (cachedCountries) return cachedCountries

  const collection = feature(worldTopology, worldTopology.objects.countries)
  const features = collection.features.filter(
    (f) => f.properties?.name !== 'Antarctica'
  )
  const projection = geoNaturalEarth1().fitSize([MAP_WIDTH, MAP_HEIGHT], {
    type: 'FeatureCollection',
    features,
  })
  const toPath = geoPath(projection)

  cachedCountries = features
    .map((f) => {
      const name = f.properties?.name || 'Unknown'
      const code = f.id != null && f.id !== '' ? String(f.id).padStart(3, '0') : CODES_BY_NAME[name]
      const path = toPath(f)
      return code && path ? { code, name, path } : null
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name))

  return cachedCountries
}

/**
 * Count confirmed and pending country upvotes.
 * @returns {Map<string, number>} code → votes
 */
export function countCountryVotes(records) {
  const counts = new Map()
  for (const row of records || []) {
    const code =
      row?.kind === 'country_vote' && row.code
        ? row.code
        : parseCountryVoteValue(row?.value)?.code
    if (!code) continue
    counts.set(code, (counts.get(code) || 0) + 1)
  }
  return counts
}
