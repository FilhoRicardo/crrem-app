import type { Asset, Carrier, EFProvider, PathwayProvider, PathwayPoint } from './types'
import data from './crrem-data.json'

// ────────────────────────────────────────────────────────────────────────────
// Type-narrow the imported JSON so call sites stay sane.
// ────────────────────────────────────────────────────────────────────────────

interface Curve { years: number[]; carbon: number[]; eui: number[] }
interface GridCurve { years: number[]; values: number[] }

const PATHWAYS = data.pathways as Record<string, Record<string, Curve>>
const GRID_EFS = data.gridEFs as Record<string, GridCurve>
const STATIC_EFS = data.staticEFs as Partial<Record<string, number>>
const POSTAL_CODES = data.postalCodes as Record<string, Record<string, string>>

interface ClimateRow {
  baselineYear: number
  cddBase: number; cdd45Pa: number; cdd85Pa: number
  hddBase: number; hdd45Pa: number; hdd85Pa: number
}
const CLIMATE = (data as { climate?: Record<string, ClimateRow> }).climate ?? {}

/**
 * CRREM RCP scenario for HDD/CDD adjustment.
 * - 'rcp45' (medium-emissions, default) — moderate warming, IPCC's middle path
 * - 'rcp85' (high-emissions) — worst-case business-as-usual
 * - 'none' (off) — no climate adjustment, energy demand stays flat
 */
export type ClimateScenario = 'none' | 'rcp45' | 'rcp85'

/**
 * Heating + cooling adjustment factors for `year` vs the asset's
 * reporting year, given the country's climate row.
 *
 * factor = (1 + pa/100) ^ (year - baselineYear)
 *
 * Returns null when climate data isn't available for `country`.
 */
export function getClimateFactors(
  country: string,
  year: number,
  scenario: ClimateScenario = 'rcp45',
): { heatingFactor: number; coolingFactor: number } | null {
  if (scenario === 'none') return { heatingFactor: 1, coolingFactor: 1 }
  const row = CLIMATE[country] ?? CLIMATE[canonCountry(country)]
  if (!row) return null
  const yrs = year - row.baselineYear
  if (yrs === 0) return { heatingFactor: 1, coolingFactor: 1 }
  const hddPa = scenario === 'rcp85' ? row.hdd85Pa : row.hdd45Pa
  const cddPa = scenario === 'rcp85' ? row.cdd85Pa : row.cdd45Pa
  return {
    heatingFactor: Math.pow(1 + hddPa / 100, yrs),
    coolingFactor: Math.pow(1 + cddPa / 100, yrs),
  }
}

/** True when the bundled CRREM v2.05 ships HDD/CDD data for this country. */
export function hasClimateData(country: string): boolean {
  return !!(CLIMATE[country] ?? CLIMATE[canonCountry(country)])
}

// ────────────────────────────────────────────────────────────────────────────
// NUTS-3 ZIP-level climate (lazy-loaded; ~6 MB raw / 600 kB gzipped)
//
// Loaded on demand from /eu-climate-nuts3.json the first time someone calls
// loadEuNuts3Climate(). Once loaded, getClimateFactorsByZip(country, zip)
// returns the per-NUTS-3 row for that exact postal code instead of the
// country aggregate. ~10× geographic precision.
//
// Falls back gracefully: if the file isn't available (e.g. offline) or the
// ZIP isn't in the table, getClimateFactorsByZip returns null and callers
// drop back to the country-aggregate getClimateFactors().
// ────────────────────────────────────────────────────────────────────────────

interface Nuts3Bundle {
  climateNuts3: Record<string, ClimateRow>
  zipToNuts3: Record<string, Record<string, string>>
}
let nuts3State: Nuts3Bundle | 'loading' | 'failed' | null = null
let nuts3Promise: Promise<void> | null = null

export function loadEuNuts3Climate(baseUrl = '/eu-climate-nuts3.json'): Promise<void> {
  if (nuts3State && nuts3State !== 'failed') {
    return nuts3State === 'loading' ? (nuts3Promise ?? Promise.resolve()) : Promise.resolve()
  }
  nuts3State = 'loading'
  nuts3Promise = fetch(baseUrl)
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json() as Promise<{ climateNuts3: Nuts3Bundle['climateNuts3']; zipToNuts3: Nuts3Bundle['zipToNuts3'] }>
    })
    .then(data => {
      nuts3State = { climateNuts3: data.climateNuts3, zipToNuts3: data.zipToNuts3 }
    })
    .catch(err => {
      console.warn('NUTS-3 climate data unavailable, falling back to country-level:', err)
      nuts3State = 'failed'
    })
  return nuts3Promise
}

export function isNuts3Loaded(): boolean {
  return !!nuts3State && nuts3State !== 'loading' && nuts3State !== 'failed'
}

/**
 * NUTS-3-precision climate factors for a country + postal code.
 * Returns null when:
 *   - NUTS-3 bundle isn't loaded yet (call loadEuNuts3Climate() first)
 *   - country isn't in the EU-30 covered by the bundle
 *   - ZIP isn't in the lookup
 *
 * Callers should fall back to getClimateFactors(country, year, scenario)
 * which always returns *something* (country-level or null).
 */
export function getClimateFactorsByZip(
  country: string,
  postalCode: string,
  year: number,
  scenario: ClimateScenario = 'rcp45',
): { heatingFactor: number; coolingFactor: number } | null {
  if (scenario === 'none') return { heatingFactor: 1, coolingFactor: 1 }
  if (!nuts3State || nuts3State === 'loading' || nuts3State === 'failed') return null
  const c = canonCountry(country)
  const zipMap = nuts3State.zipToNuts3[c] ?? nuts3State.zipToNuts3[country]
  if (!zipMap) return null
  // Try exact ZIP, then progressively shorter prefixes (handles padded codes)
  let code = String(postalCode).trim()
  let nuts3: string | undefined
  while (code.length > 0 && !nuts3) {
    nuts3 = zipMap[code]
    if (!nuts3) code = code.slice(0, -1)
  }
  if (!nuts3) return null
  const row = nuts3State.climateNuts3[nuts3]
  if (!row) return null
  const yrs = year - row.baselineYear
  if (yrs === 0) return { heatingFactor: 1, coolingFactor: 1 }
  const hddPa = scenario === 'rcp85' ? row.hdd85Pa : row.hdd45Pa
  const cddPa = scenario === 'rcp85' ? row.cdd85Pa : row.cdd45Pa
  return {
    heatingFactor: Math.pow(1 + hddPa / 100, yrs),
    coolingFactor: Math.pow(1 + cddPa / 100, yrs),
  }
}

export const CRREM_DATA_META = data.meta as {
  generated: string
  source: string
  counts: Record<string, number>
}

// ────────────────────────────────────────────────────────────────────────────
// Region resolution
//
// Priority for "what CRREM region does this asset belong to?":
//   1. asset.region — explicit override the user typed
//   2. postal-code lookup using asset.country + asset.postal_code
//      (only USA / Australia / Canada have postal lookups in v2.05)
//   3. asset.country itself, when CRREM publishes country-level pathways
//      (most European/Asian countries)
//
// For pathway lookups specifically we then fall back from the sub-national
// region to the parent country if a sub-national region exists in the postal
// data but doesn't have its own pathway curve (e.g. "AUS6" → "Australia"
// in v2.05 where Australia is published country-level only).
// ────────────────────────────────────────────────────────────────────────────

const COUNTRY_ALIASES: Record<string, string> = {
  USA: 'USA', 'United States': 'USA', US: 'USA',
  UK: 'United Kingdom', GB: 'United Kingdom',
  HK: 'Hong Kong',
}

function canonCountry(country: string): string {
  return COUNTRY_ALIASES[country] ?? country
}

/**
 * Map a CRREM sub-national region code back to its parent country.
 *
 * Some sub-national regions (USA NYSTc_*, AUS1..AUS8, Canadian provinces)
 * have postal-code lookup entries but the v2.05 pathway / EF data may only
 * be published at country-level for some regions (Australia is the obvious
 * one — postal lookup gives AUS6 but pathway/EF data is keyed by "Australia"
 * with sub-region EF entries by NCC zone).
 *
 * Used as a final fallback when an exact sub-national lookup misses.
 */
const SUBNATIONAL_PARENT: Record<string, string> = (() => {
  const m: Record<string, string> = {}
  // Australia — postal lookup returns AUS1 .. AUS8
  for (let i = 1; i <= 8; i++) m[`AUS${i}`] = 'Australia'
  return m
})()

function parentCountryOf(region: string): string | null {
  if (SUBNATIONAL_PARENT[region]) return SUBNATIONAL_PARENT[region]
  // USA pathway codes look like "NYSTc_Mixed mild_4A" — first underscore-segment
  // is a sub-national identifier; canonical country is "USA".
  if (/^[A-Z]{3,5}c_/.test(region)) return 'USA'
  return null
}

function postalResolve(country: string, postalCode: string | undefined): string | null {
  if (!postalCode) return null
  const c = canonCountry(country)
  const lookup = POSTAL_CODES[c]
  if (!lookup) return null
  // Try the exact code first, then progressively shorter prefixes (handles ZIP+4 etc.).
  let code = String(postalCode).trim()
  while (code.length > 0) {
    if (lookup[code]) return lookup[code]
    code = code.slice(0, -1)
  }
  return null
}

/**
 * Resolve the CRREM region key the runtime should look up pathways/EFs against.
 * Returns the asset's own override first, then a postal-resolved sub-national
 * code, then the canonical country name.
 */
export function resolveCRREMRegion(asset: Pick<Asset, 'country' | 'postal_code' | 'region'>): string {
  if (asset.region && asset.region.trim().length > 0) return asset.region.trim()
  const postal = postalResolve(asset.country, asset.postal_code)
  if (postal) return postal
  return canonCountry(asset.country)
}

// ────────────────────────────────────────────────────────────────────────────
// Diagnostics — track unknown regions so the UI can warn the user instead of
// silently falling back to a generic exponential. Per CRREM Prime Directive #1.
// ────────────────────────────────────────────────────────────────────────────

const unknownPathwayRegions = new Set<string>()
const unknownGridRegions = new Set<string>()
const fallbackPathwayRegions = new Set<string>()  // sub-national → country fallback

export function getProviderDiagnostics(): {
  unknownPathwayRegions: string[]
  unknownGridRegions: string[]
  fallbackPathwayRegions: string[]
} {
  return {
    unknownPathwayRegions: [...unknownPathwayRegions],
    unknownGridRegions: [...unknownGridRegions],
    fallbackPathwayRegions: [...fallbackPathwayRegions],
  }
}

export function clearProviderDiagnostics(): void {
  unknownPathwayRegions.clear()
  unknownGridRegions.clear()
  fallbackPathwayRegions.clear()
}

// ────────────────────────────────────────────────────────────────────────────
// EF Provider
// ────────────────────────────────────────────────────────────────────────────

function lookupGridEF(region: string, year: number): number | null {
  // Exact match first
  let curve = GRID_EFS[region]
  if (!curve) {
    // Sub-national → country fallback — same chain as pathway resolution.
    // For Australia we rely on the static AU fallback below since the v2.05 EF
    // sheet stores Australia per NCC subregion (no country aggregate).
    const explicitParent = parentCountryOf(region)
    const candidates = [
      explicitParent,
      region.split('_')[0],
    ].filter((s): s is string => !!s && s !== region && s !== region.split('_')[0])
    for (const c of candidates) {
      if (GRID_EFS[c]) { curve = GRID_EFS[c]; break }
    }
  }
  if (!curve) return null
  return interpYear(curve.years, curve.values, year)
}

// Country-level grid EF defaults for countries the v2.05 EF sheet stores only
// at sub-region granularity. Sourced from CRREM A-001..A-004 worked-example
// fixtures (NSW = AUS6 ≈ 0.66 → declines to ~0.05 by 2050; representative of
// the Australia coal/gas-heavy grid trajectory).
const STATIC_COUNTRY_GRID_EFS: Record<string, GridCurve> = {
  Australia: {
    years: [2024, 2030, 2035, 2040, 2045, 2050],
    values: [0.66, 0.50, 0.35, 0.22, 0.12, 0.05],
  },
}
function staticCountryGridEF(region: string, year: number): number | null {
  const explicitParent = parentCountryOf(region)
  const c = STATIC_COUNTRY_GRID_EFS[region] ?? (explicitParent ? STATIC_COUNTRY_GRID_EFS[explicitParent] : undefined)
  if (!c) return null
  return interpYear(c.years, c.values, year)
}

function interpYear(years: number[], values: number[], year: number): number {
  if (years.length === 0) return 0
  if (year <= years[0]) return values[0]
  if (year >= years[years.length - 1]) return values[values.length - 1]
  const i = years.indexOf(year)
  if (i >= 0) return values[i]
  // Linear interpolation
  for (let j = 0; j < years.length - 1; j++) {
    if (year > years[j] && year < years[j + 1]) {
      const t = (year - years[j]) / (years[j + 1] - years[j])
      return values[j] + t * (values[j + 1] - values[j])
    }
  }
  return values[values.length - 1]
}

const STATIC_FALLBACK: Partial<Record<Carrier, number>> = {
  Gas: 0.18316,
  Oil: 0.26515,
  Biomass: 0.01550,
  District_Heating: 0.20431,
  District_Cooling: 0.38,
  Other_Fuels: 0.26515,
  Renew_Consumed: 0,
  Renew_Exported: 0,
}

export const efProvider: EFProvider = (carrier, region, year) => {
  if (carrier === 'Elec_Grid') {
    const v = lookupGridEF(region, year)
    if (v !== null) return v
    // Country-level static fallback (handles Australia where v2.05 has only sub-regions)
    const staticV = staticCountryGridEF(region, year)
    if (staticV !== null) return staticV
    // Generic decline: 0.30 in 2024, 4%/yr decay, floored at 0.02.
    if (region) unknownGridRegions.add(region)
    const yrs = Math.max(0, year - 2024)
    return Math.max(0.02, 0.30 * Math.exp(-0.04 * yrs))
  }
  // Non-electric carriers: prefer parsed CRREM static EFs, fall back to local table
  return STATIC_EFS[carrier] ?? STATIC_FALLBACK[carrier] ?? 0
}

// ────────────────────────────────────────────────────────────────────────────
// Pathway Provider
// ────────────────────────────────────────────────────────────────────────────

function lookupPathway(region: string, propertyType: string, year: number): PathwayPoint | null {
  let bucket = PATHWAYS[region]
  if (!bucket) {
    // Try sub-national → country fallback (e.g. AUS6 → Australia)
    // 1. Explicit parent map (most reliable — handles AUS sub-codes + USA NYSTc_*)
    // 2. Trim trailing digits / underscore-prefix (heuristic last-resort)
    const explicitParent = parentCountryOf(region)
    const candidates = [
      explicitParent,
      region.replace(/\d+$/, '').replace(/_+$/, ''),
      region.split('_')[0],
    ].filter((s): s is string => !!s && s !== region)
    for (const c of candidates) {
      if (PATHWAYS[c]) {
        bucket = PATHWAYS[c]
        fallbackPathwayRegions.add(`${region} → ${c}`)
        break
      }
    }
  }
  if (!bucket) return null

  // Property-type matching is loose. Try exact, then case-insensitive contains.
  let curve = bucket[propertyType]
  if (!curve) {
    const want = propertyType.toLowerCase()
    for (const [name, c] of Object.entries(bucket)) {
      if (name.toLowerCase() === want) { curve = c; break }
    }
  }
  if (!curve) {
    // Loose fallback — first property whose name shares a substring with what we want.
    const want = propertyType.toLowerCase()
    for (const [name, c] of Object.entries(bucket)) {
      const n = name.toLowerCase()
      if (n.includes(want) || want.includes(n)) { curve = c; break }
    }
  }
  if (!curve) return null

  return {
    carbon_kgco2e_m2: interpYear(curve.years, curve.carbon, year),
    eui_kwh_m2: interpYear(curve.years, curve.eui, year),
  }
}

export const pathwayProvider: PathwayProvider = (region, propertyType, year) => {
  const p = lookupPathway(region, propertyType, year)
  if (p) return p

  if (region) unknownPathwayRegions.add(`${region}/${propertyType}`)
  // Last-resort generic fallback — sector-average decline. Always paired with
  // a UI warning so the user knows they're not getting CRREM data.
  const yrs = Math.max(0, year - 2024)
  return {
    carbon_kgco2e_m2: 50 * Math.exp(-0.18 * yrs),
    eui_kwh_m2: 200 * Math.exp(-0.06 * yrs),
  }
}
