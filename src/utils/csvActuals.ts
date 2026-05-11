import type { Carrier, YearActual } from '../engine/types'

const CANONICAL_CARRIERS: Carrier[] = [
  'Elec_Grid', 'District_Heating', 'District_Cooling', 'Gas', 'Oil', 'Biomass',
  'Other_Fuels', 'Renew_Consumed', 'Renew_Exported',
]

const MONTH_NAMES: Record<string, number> = {
  jan: 0, january: 0, '01': 0, '1': 0,
  feb: 1, february: 1, '02': 1, '2': 1,
  mar: 2, march: 2, '03': 2, '3': 2,
  apr: 3, april: 3, '04': 3, '4': 3,
  may: 4, '05': 4, '5': 4,
  jun: 5, june: 5, '06': 5, '6': 5,
  jul: 6, july: 6, '07': 6, '7': 6,
  aug: 7, august: 7, '08': 7, '8': 7,
  sep: 8, sept: 8, september: 8, '09': 8, '9': 8,
  oct: 9, october: 9, '10': 9,
  nov: 10, november: 10, '11': 10,
  dec: 11, december: 11, '12': 11,
}

function normalizeHeader(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_-]+/g, '')
}

function carrierFromHeader(header: string): Carrier | null {
  const h = normalizeHeader(header)
  for (const c of CANONICAL_CARRIERS) {
    if (normalizeHeader(c) === h) return c
  }
  // Common aliases
  if (h === 'electricity' || h === 'elec' || h === 'electric' || h === 'grid') return 'Elec_Grid'
  if (h === 'gasnatural' || h === 'naturalgas') return 'Gas'
  if (h === 'dh' || h === 'heat' || h === 'districtheating' || h === 'steam') return 'District_Heating'
  if (h === 'dc' || h === 'cooling' || h === 'districtcooling') return 'District_Cooling'
  if (h === 'pv' || h === 'solar' || h === 'renewables') return 'Renew_Consumed'
  if (h === 'export' || h === 'exported' || h === 'renewableexport') return 'Renew_Exported'
  return null
}

/** Parse a single CSV line, handling quoted fields with embedded commas. */
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') inQ = false
      else cur += ch
    } else {
      if (ch === '"') inQ = true
      else if (ch === ',') { out.push(cur); cur = '' }
      else cur += ch
    }
  }
  out.push(cur)
  return out.map(s => s.trim())
}

export interface CsvParseResult {
  actuals: YearActual[]
  warnings: string[]
}

/**
 * Parse a CSV of monthly meter readings into a list of YearActual.
 *
 * Two layouts supported:
 *
 * **Wide** (one row per month, carriers across columns)
 * ```
 * Year,Month,Elec_Grid,District_Heating
 * 2024,Jan,70000,120000
 * 2024,Feb,65000,100000
 * ...
 * ```
 *
 * **Long** (one row per carrier-month)
 * ```
 * Year,Month,Carrier,Value
 * 2024,Jan,Elec_Grid,70000
 * ...
 * ```
 *
 * Months may be Jan|January|01|1 (case-insensitive). Carrier names accept
 * common aliases (electricity → Elec_Grid, gas → Gas, steam → District_Heating, …).
 * Missing values stay null. Header row is required.
 */
export function parseActualsCsv(text: string): CsvParseResult {
  const warnings: string[] = []
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) {
    return { actuals: [], warnings: ['Empty CSV'] }
  }

  const header = parseCsvLine(lines[0])
  const headerNorm = header.map(normalizeHeader)
  const yearIdx = headerNorm.indexOf('year')
  const monthIdx = headerNorm.indexOf('month')
  if (yearIdx < 0 || monthIdx < 0) {
    return { actuals: [], warnings: ['CSV header must include "Year" and "Month" columns'] }
  }

  // Detect layout: long format has Carrier + Value cols; wide has 1+ carrier cols.
  const carrierColIdx = headerNorm.findIndex(h => h === 'carrier')
  const valueColIdx = headerNorm.findIndex(h => h === 'value' || h === 'kwh' || h === 'reading')
  const isLong = carrierColIdx >= 0 && valueColIdx >= 0

  // Wide-layout carrier columns
  const wideCarriers: Array<{ idx: number; carrier: Carrier }> = []
  if (!isLong) {
    for (let i = 0; i < header.length; i++) {
      if (i === yearIdx || i === monthIdx) continue
      const c = carrierFromHeader(header[i])
      if (c) wideCarriers.push({ idx: i, carrier: c })
      else warnings.push(`Ignored unknown column "${header[i]}"`)
    }
    if (wideCarriers.length === 0) {
      return { actuals: [], warnings: [...warnings, 'No recognised carrier columns found'] }
    }
  }

  // Build a Map<year, Map<carrier, Array<number|null>>>
  const byYear = new Map<number, Partial<Record<Carrier, Array<number | null>>>>()
  const ensureYear = (year: number) => {
    let y = byYear.get(year)
    if (!y) { y = {}; byYear.set(year, y) }
    return y
  }
  const ensureCarrier = (year: number, c: Carrier) => {
    const y = ensureYear(year)
    if (!y[c]) y[c] = Array(12).fill(null)
    return y[c]!
  }

  for (let r = 1; r < lines.length; r++) {
    const cells = parseCsvLine(lines[r])
    if (cells.length === 0 || cells.every(c => c === '')) continue
    const year = parseInt(cells[yearIdx], 10)
    if (!Number.isFinite(year)) {
      warnings.push(`Row ${r + 1}: invalid year "${cells[yearIdx]}"`)
      continue
    }
    const monthRaw = (cells[monthIdx] ?? '').trim()
    const monthIdxNum = MONTH_NAMES[monthRaw.toLowerCase()]
    if (typeof monthIdxNum !== 'number') {
      warnings.push(`Row ${r + 1}: invalid month "${monthRaw}"`)
      continue
    }

    if (isLong) {
      const carrier = carrierFromHeader(cells[carrierColIdx] ?? '')
      if (!carrier) {
        warnings.push(`Row ${r + 1}: unknown carrier "${cells[carrierColIdx]}"`)
        continue
      }
      const v = Number(cells[valueColIdx])
      if (!Number.isFinite(v)) continue
      ensureCarrier(year, carrier)[monthIdxNum] = v
    } else {
      for (const { idx, carrier } of wideCarriers) {
        const raw = (cells[idx] ?? '').trim()
        if (raw === '') continue
        const v = Number(raw)
        if (!Number.isFinite(v)) {
          warnings.push(`Row ${r + 1}, "${header[idx]}": ignored non-numeric "${raw}"`)
          continue
        }
        ensureCarrier(year, carrier)[monthIdxNum] = v
      }
    }
  }

  const actuals: YearActual[] = []
  for (const [year, monthly] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
    actuals.push({ year, monthly })
  }
  return { actuals, warnings }
}

/** Merge incoming actuals into an existing list, replacing same-year entries. */
export function mergeActuals(existing: YearActual[] | undefined, incoming: YearActual[]): YearActual[] {
  const out = new Map<number, YearActual>()
  for (const a of existing ?? []) out.set(a.year, a)
  for (const a of incoming) out.set(a.year, a)
  return [...out.values()].sort((a, b) => a.year - b.year)
}

/** Sample CSV string the user can grab as a template. */
export const ACTUALS_CSV_TEMPLATE = `Year,Month,Elec_Grid,District_Heating,Gas,Renew_Consumed
2024,Jan,70000,120000,,
2024,Feb,65000,100000,,
2024,Mar,72000,80000,,
2024,Apr,68000,50000,,
2024,May,75000,30000,,
2024,Jun,80000,20000,,
2024,Jul,82000,15000,,
2024,Aug,81000,15000,,
2024,Sep,75000,30000,,
2024,Oct,70000,60000,,
2024,Nov,65000,90000,,
2024,Dec,70000,110000,,
`

