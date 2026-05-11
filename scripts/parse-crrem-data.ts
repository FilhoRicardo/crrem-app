/**
 * Build-time script: parse the CRREM v2.05 reference xlsx files into compact
 * JSON the runtime providers can consume synchronously.
 *
 * Inputs (in references/):
 *   - pathways-v2.05.xlsx           — CO2 + EUI pathway curves
 *   - emission-factors-v2.05.xlsx   — Grid EFs per region/year + static EFs
 *   - postal-code-lookup-v2.05.xlsx — Sub-national region resolver
 *
 * Output:
 *   - src/engine/crrem-data.json    — { pathways, gridEFs, staticEFs, postalCodes }
 *
 * Run: bun scripts/parse-crrem-data.ts
 *      (re-run after every CRREM data update)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'

const __filename = fileURLToPath(import.meta.url)
const ROOT = dirname(dirname(__filename))
const REF_DIR = join(ROOT, 'references')
const OUT = join(ROOT, 'src', 'engine', 'crrem-data.json')

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function loadWorkbook(file: string): XLSX.WorkBook {
  return XLSX.read(readFileSync(join(REF_DIR, file)), { type: 'buffer' })
}

function loadSheet(file: string, sheetName: string): unknown[][] {
  const wb = loadWorkbook(file)
  const sheet = wb.Sheets[sheetName]
  if (!sheet) throw new Error(`No sheet "${sheetName}" in ${file}`)
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true })
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function asString(v: unknown): string | null {
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') return String(v)
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Pathways — header at row 4, data from row 5
//   columns: Region(continent) | Country | Region Code | Property Type |
//            Abbreviation | Code | Unit | 2020..2050
// Carbon and EUI live in separate sheets, both keyed by (Country, PropertyType).
// We use Country as the lookup key because that's where pathways are stored
// for European countries; for USA/Canada the "Country" column holds the
// sub-national CRREM region (e.g. "NYSTc_Mixed mild_4A").
// ─────────────────────────────────────────────────────────────────────────────

const HEADER_ROW = 4
const DATA_START_ROW = 5

interface Curve { years: number[]; values: number[] }

function readPathwaySheet(file: string, sheetName: string): Map<string, Curve> {
  const rows = loadSheet(file, sheetName)
  const header = rows[HEADER_ROW] ?? []
  // Year columns start where header is a 4-digit integer
  const yearCols: Array<{ col: number; year: number }> = []
  for (let c = 0; c < header.length; c++) {
    const n = asNumber(header[c])
    if (n !== null && n >= 2000 && n <= 2100 && Number.isInteger(n)) {
      yearCols.push({ col: c, year: n })
    }
  }
  if (yearCols.length === 0) throw new Error(`No year columns in ${sheetName}`)

  const out = new Map<string, Curve>()
  for (let r = DATA_START_ROW; r < rows.length; r++) {
    const row = rows[r]
    if (!row) continue
    // CRREM v2.05 layout:
    //   col 0 = continent ("Europe" / "North America" / "Asia Pacific")
    //   col 1 = country ("Austria", "USA", "Canada", "Australia", "Hong Kong", …)
    //   col 2 = region code (2-letter ISO for European countries; sub-national
    //           CRREM region code like "NYSTc_Mixed mild_4A" or "AUS6" for the
    //           three countries with sub-national pathways)
    //   col 3 = property type
    //
    // We key by col 2 when it's a sub-national region code (not a 2-letter ISO),
    // and by col 1 (country) otherwise. This makes the postal-code lookup
    // (which returns codes like "AUS6" / "NYSTc_Mixed mild_4A") line up with
    // pathway lookups, while European users can still resolve by country name.
    const country = asString(row[1])
    const code = asString(row[2])
    const propType = asString(row[3])
    if (!country || !propType) continue
    const isSubnational = !!code && code.length > 3 && code !== country
    const region = isSubnational ? code : country

    const years: number[] = []
    const values: number[] = []
    for (const { col, year } of yearCols) {
      const v = asNumber(row[col])
      if (v === null) continue
      years.push(year)
      values.push(v)
    }
    if (years.length === 0) continue

    const key = `${region}::${propType}`
    out.set(key, { years, values })
  }
  return out
}

const co2Curves = readPathwaySheet('pathways-v2.05.xlsx', 'CO2 Pathways (sqm)')
const euiCurves = readPathwaySheet('pathways-v2.05.xlsx', 'EUI Pathways kWh (sqm)')

const pathways: Record<string, Record<string, { years: number[]; carbon: number[]; eui: number[] }>> = {}
const allKeys = new Set<string>([...co2Curves.keys(), ...euiCurves.keys()])
for (const key of allKeys) {
  const [region, propType] = key.split('::')
  const co2 = co2Curves.get(key)
  const eui = euiCurves.get(key)
  // Use CO2 years as canonical (CO2 + EUI sheets have the same year columns in v2.05).
  const years = co2?.years ?? eui?.years ?? []
  if (years.length === 0) continue
  if (!pathways[region]) pathways[region] = {}
  pathways[region][propType] = {
    years,
    carbon: co2?.values ?? Array(years.length).fill(NaN),
    eui: eui?.values ?? Array(years.length).fill(NaN),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Emission factors — single sheet "Emission Factors"
//   Header row 4: Region | Code | Country | 2020..2050
// Layout has all-electricity rows (one per country/sub-region) followed by
// a static-EF block. Static block uses Code col for the carrier name.
// ─────────────────────────────────────────────────────────────────────────────

const efRows = loadSheet('emission-factors-v2.05.xlsx', 'Emission Factors')
const efHeader = efRows[HEADER_ROW] ?? []
const efYearCols: Array<{ col: number; year: number }> = []
for (let c = 0; c < efHeader.length; c++) {
  const n = asNumber(efHeader[c])
  if (n !== null && n >= 2000 && n <= 2100 && Number.isInteger(n)) {
    efYearCols.push({ col: c, year: n })
  }
}

const gridEFs: Record<string, { years: number[]; values: number[] }> = {}
const staticEFs: Record<string, number> = {}
let gridSection = true

for (let r = DATA_START_ROW; r < efRows.length; r++) {
  const row = efRows[r]
  if (!row) continue
  const region = asString(row[0])
  const code = asString(row[1])
  const country = asString(row[2])

  // Detect the static-EF header (row that starts a new section like "Fixed Emission Factors")
  if (region && /fixed|static|other carrier|combustion/i.test(region)) {
    gridSection = false
    continue
  }
  // Some rows in v2.05 mark the section break with a fully-blank region+code+country.
  if (!region && !code && !country) {
    // blank divider — keep going
    continue
  }

  if (gridSection) {
    // Grid EF row: prefer Country (col 2) as the key; fall back to Code (col 1)
    const key = country ?? code ?? region
    if (!key) continue
    const years: number[] = []
    const values: number[] = []
    for (const { col, year } of efYearCols) {
      const v = asNumber(row[col])
      if (v === null) continue
      years.push(year)
      values.push(v)
    }
    if (years.length === 0) continue
    gridEFs[key] = { years, values }
  } else {
    // Static EF row: carrier name in code/country column, single value
    const carrier = country ?? code ?? region
    if (!carrier) continue
    // Take the first numeric value in the row (static EFs are year-independent)
    for (const { col } of efYearCols) {
      const v = asNumber(row[col])
      if (v !== null) {
        const canon = canonicaliseCarrier(carrier)
        if (canon && staticEFs[canon] === undefined) staticEFs[canon] = v
        break
      }
    }
  }
}

function canonicaliseCarrier(s: string): string | null {
  const x = s.toLowerCase().replace(/[\s_-]/g, '')
  if (x.includes('gas')) return 'Gas'
  if (x.includes('oil') || x.includes('diesel') || x.includes('kerosene')) return 'Oil'
  if (x.includes('biomass') || x.includes('wood')) return 'Biomass'
  if (x.includes('districtheat') || x.includes('steam') || x === 'dh') return 'District_Heating'
  if (x.includes('districtcool') || x === 'dc') return 'District_Cooling'
  if (x.includes('otherfuel') || x.includes('lpg') || x.includes('propane')) return 'Other_Fuels'
  return null
}

// District heating/cooling fallback — CRREM v2.05 references the UK baseline
// when a local DH/DC EF isn't published. Bake those in as last-resort defaults.
if (staticEFs.District_Heating === undefined) staticEFs.District_Heating = 0.20431
if (staticEFs.District_Cooling === undefined) staticEFs.District_Cooling = 0.38

// ─────────────────────────────────────────────────────────────────────────────
// Postal-code lookup — three sheets, one per country
// ─────────────────────────────────────────────────────────────────────────────

interface PostalEntry { country: string; codeKey: string; pathwayRegion: string }

function readPostalSheet(file: string, sheetName: string, country: string): PostalEntry[] {
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(loadWorkbook(file).Sheets[sheetName], { defval: null, raw: true })
  const out: PostalEntry[] = []
  for (const row of rows) {
    const code = asString(row['Zip'] ?? row['postcode'] ?? row['FSA'] ?? row['Postcode'])
    const pathway = asString(row['CRREM Pathway'])
    if (code && pathway) out.push({ country, codeKey: code, pathwayRegion: pathway })
  }
  return out
}

const postalEntries = [
  ...readPostalSheet('postal-code-lookup-v2.05.xlsx', 'US_Zip_GEA_ClimateZone', 'USA'),
  ...readPostalSheet('postal-code-lookup-v2.05.xlsx', 'AUS_Postcode_ClimateZone', 'Australia'),
  ...readPostalSheet('postal-code-lookup-v2.05.xlsx', 'CAN_FSA_Province', 'Canada'),
]

const postalCodes: Record<string, Record<string, string>> = {}
for (const e of postalEntries) {
  if (!postalCodes[e.country]) postalCodes[e.country] = {}
  postalCodes[e.country][e.codeKey] = e.pathwayRegion
}

// ─────────────────────────────────────────────────────────────────────────────
// HDD / CDD climate adjustment factors (EU 30 countries, v2.05)
//
// hdd-cdd-eu-v2.05.xlsx ships:
//   - HDD_2024 / CDD_2024 baseline degree-days
//   - HDD_45_pa / CDD_45_pa : annual %-change under RCP 4.5 (medium scenario)
//   - HDD_85_pa / CDD_85_pa : annual %-change under RCP 8.5 (high scenario)
//
// Per CRREM method, heating-related energy in year Y scales by HDD growth
// vs baseline; cooling-related by CDD growth. HDD_pa is negative (warmer →
// less heat), CDD_pa is positive (warmer → more cooling).
//
// We extract only the country-aggregate rows (where ZIP Code cell is null)
// to keep payload tiny. ZIP-level adjustment is deferred.
// ─────────────────────────────────────────────────────────────────────────────

interface ClimateRow {
  baselineYear: number
  cddBase: number; cdd45Pa: number; cdd85Pa: number
  hddBase: number; hdd45Pa: number; hdd85Pa: number
}

const climate: Record<string, ClimateRow> = {}
try {
  const wbClim = loadWorkbook('hdd-cdd-eu-v2.05.xlsx')
  const sheet = wbClim.Sheets['HDD CDD Zip Code Matching 2024']
  if (sheet) {
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true })
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r]
      if (!row) continue
      if (row[0] !== null) continue  // country aggregate rows have null ZIP Code
      const country = asString(row[1])
      if (!country || climate[country]) continue
      // _pa rates are what drive the adjustment (factor doesn't use the baseline)
      // — accept the country even if baseline values are null (UK, Switzerland)
      const cdd45Pa = asNumber(row[8])
      const hdd45Pa = asNumber(row[11])
      if (cdd45Pa === null && hdd45Pa === null) continue
      climate[country] = {
        baselineYear: 2024,
        cddBase: asNumber(row[7]) ?? 0,
        cdd45Pa: cdd45Pa ?? 0, cdd85Pa: asNumber(row[9]) ?? 0,
        hddBase: asNumber(row[10]) ?? 0,
        hdd45Pa: hdd45Pa ?? 0, hdd85Pa: asNumber(row[12]) ?? 0,
      }
    }
  }
} catch (e) {
  console.warn('Climate parse skipped:', e instanceof Error ? e.message : e)
}

// ─────────────────────────────────────────────────────────────────────────────
// Write
// ─────────────────────────────────────────────────────────────────────────────

const output = {
  meta: {
    generated: new Date().toISOString(),
    source: 'CRREM v2.05 reference data',
    counts: {
      pathwayRegions: Object.keys(pathways).length,
      pathwayCombos: Object.values(pathways).reduce((s, r) => s + Object.keys(r).length, 0),
      gridEFRegions: Object.keys(gridEFs).length,
      staticEFCarriers: Object.keys(staticEFs).length,
      postalCountries: Object.keys(postalCodes).length,
      postalEntries: Object.values(postalCodes).reduce((s, r) => s + Object.keys(r).length, 0),
      climateCountries: Object.keys(climate).length,
    },
  },
  pathways,
  gridEFs,
  staticEFs,
  postalCodes,
  climate,
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(output))

console.log(`\nWrote ${OUT}`)
console.log(`  ${output.meta.counts.pathwayRegions} pathway regions, ${output.meta.counts.pathwayCombos} region×property combos`)
console.log(`  ${output.meta.counts.gridEFRegions} grid-EF regions`)
console.log(`  ${output.meta.counts.staticEFCarriers} static-carrier EFs`)
console.log(`  ${output.meta.counts.postalCountries} postal-code countries (${output.meta.counts.postalEntries} entries)`)
console.log(`  ${output.meta.counts.climateCountries} HDD/CDD climate countries`)

// Sample
const samples = [
  ['Germany', 'Office'],
  ['United Kingdom', 'Office'],
  ['Hong Kong (PRC)', 'Shopping Center'],
  ['NYSTc_Mixed mild_4A', 'Office'],
]
console.log('\nSample lookups (CO2 in 2024 / EUI in 2024):')
for (const [region, prop] of samples) {
  const p = pathways[region]?.[prop]
  if (p) {
    const i = p.years.indexOf(2024)
    if (i >= 0) console.log(`  ${region} / ${prop}: CO2=${p.carbon[i]?.toFixed(2)} EUI=${p.eui[i]?.toFixed(2)}`)
    else console.log(`  ${region} / ${prop}: no 2024 data (have ${p.years[0]}-${p.years[p.years.length - 1]})`)
  } else {
    console.log(`  ${region} / ${prop}: NOT FOUND`)
  }
}
