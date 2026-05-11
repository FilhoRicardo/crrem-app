import type { Asset, Carrier, EnergyMap } from '../engine/types'

const CANONICAL_CARRIERS: Carrier[] = [
  'Elec_Grid', 'District_Heating', 'District_Cooling', 'Gas', 'Oil', 'Biomass',
  'Other_Fuels', 'Renew_Consumed', 'Renew_Exported',
]

function normalizeHeader(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_-]+/g, '')
}

const FIELD_ALIASES: Record<string, string> = {
  // Standard fields
  name: 'name', assetname: 'name', building: 'name', buildingname: 'name',
  id: 'id', assetid: 'id', slug: 'id',
  country: 'country',
  postalcode: 'postal_code', postcode: 'postal_code', zip: 'postal_code', zipcode: 'postal_code',
  region: 'region', crremregion: 'region',
  propertytype: 'property_type', type: 'property_type', usetype: 'property_type',
  gia: 'gia_m2', giam2: 'gia_m2', area: 'gia_m2', floorarea: 'gia_m2',
  reportingyear: 'reporting_year', year: 'reporting_year',
  tags: 'tags',
  notes: 'notes', body: 'notes',
}

function carrierFromHeader(header: string): Carrier | null {
  const h = normalizeHeader(header)
  for (const c of CANONICAL_CARRIERS) {
    if (normalizeHeader(c) === h) return c
  }
  if (h === 'electricity' || h === 'elec' || h === 'electric' || h === 'grid') return 'Elec_Grid'
  if (h === 'gasnatural' || h === 'naturalgas') return 'Gas'
  if (h === 'dh' || h === 'heat' || h === 'districtheating' || h === 'steam') return 'District_Heating'
  if (h === 'dc' || h === 'cooling' || h === 'districtcooling') return 'District_Cooling'
  if (h === 'pv' || h === 'solar' || h === 'renewables') return 'Renew_Consumed'
  if (h === 'export' || h === 'exported' || h === 'renewableexport') return 'Renew_Exported'
  return null
}

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

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'asset'
}

export interface AssetCsvParseResult {
  assets: Asset[]
  warnings: string[]
}

/**
 * Parse a CSV of one row per asset into a list of Asset.
 *
 * Required columns: Name, Country, Property Type, GIA (m²), Reporting Year.
 * Optional: ID, Postal Code, Region, Tags (comma-separated), and one column
 * per CRREM carrier with kWh/yr (Elec_Grid, Gas, District_Heating, …).
 *
 * Aliases: many common header spellings work — "Building" → name, "ZIP" →
 * postal_code, "Floor Area" → gia_m2, "Electricity" → Elec_Grid, etc.
 */
export function parseAssetsCsv(text: string, existingIds: string[] = []): AssetCsvParseResult {
  const warnings: string[] = []
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) {
    return { assets: [], warnings: ['CSV must have a header row + at least one data row'] }
  }

  const header = parseCsvLine(lines[0])
  const cols: Array<{ idx: number; field?: string; carrier?: Carrier; raw: string }> = []
  for (let i = 0; i < header.length; i++) {
    const h = header[i]
    const norm = normalizeHeader(h)
    const field = FIELD_ALIASES[norm]
    const carrier = field ? null : carrierFromHeader(h)
    if (field) cols.push({ idx: i, field, raw: h })
    else if (carrier) cols.push({ idx: i, carrier, raw: h })
    else if (h.length > 0) warnings.push(`Ignored unknown column "${h}"`)
  }

  // Sanity: required fields must be present
  const fields = new Set(cols.map(c => c.field).filter(Boolean))
  for (const required of ['name', 'country', 'property_type', 'gia_m2', 'reporting_year']) {
    if (!fields.has(required)) {
      return { assets: [], warnings: [...warnings, `Missing required column: "${required}"`] }
    }
  }

  const seenIds = new Set(existingIds)
  const assets: Asset[] = []

  for (let r = 1; r < lines.length; r++) {
    const cells = parseCsvLine(lines[r])
    if (cells.every(c => c === '')) continue

    const draft: Partial<Asset> = { energy: {} }
    let bodyText: string | undefined
    let tagsRaw: string | undefined

    for (const c of cols) {
      const v = cells[c.idx]?.trim() ?? ''
      if (v === '') continue
      if (c.carrier) {
        const n = Number(v)
        if (!Number.isFinite(n)) {
          warnings.push(`Row ${r + 1}: ignored non-numeric value "${v}" for ${c.carrier}`)
          continue
        }
        if (n > 0) (draft.energy as EnergyMap)[c.carrier] = n
        continue
      }
      switch (c.field) {
        case 'name':           draft.name = v; break
        case 'id':             draft.id = slugify(v); break
        case 'country':        draft.country = v; break
        case 'postal_code':    draft.postal_code = v; break
        case 'region':         draft.region = v; break
        case 'property_type':  draft.property_type = v; break
        case 'gia_m2': {
          const n = Number(v.replace(/,/g, ''))
          if (Number.isFinite(n) && n > 0) draft.gia_m2 = n
          break
        }
        case 'reporting_year': {
          const n = parseInt(v, 10)
          if (Number.isFinite(n)) draft.reporting_year = n
          break
        }
        case 'tags': tagsRaw = v; break
        case 'notes': bodyText = v; break
      }
    }

    // Validate required fields per row
    if (!draft.name || !draft.country || !draft.property_type) {
      warnings.push(`Row ${r + 1}: skipped (missing required field)`)
      continue
    }
    if (!draft.gia_m2 || draft.gia_m2 <= 0) {
      warnings.push(`Row ${r + 1}: skipped (invalid GIA)`)
      continue
    }
    if (!draft.reporting_year) {
      warnings.push(`Row ${r + 1}: skipped (missing reporting year)`)
      continue
    }

    // Resolve a unique ID
    let id = draft.id || slugify(draft.name)
    let n = 2
    const base = id
    while (seenIds.has(id)) id = `${base}-${n++}`
    seenIds.add(id)

    if (tagsRaw) {
      draft.tags = tagsRaw.split(/[;,|]/).map(t => t.trim()).filter(Boolean)
    }
    if (bodyText) {
      draft.body = `\n# ${draft.name}\n\n${bodyText}\n`
    }

    assets.push({
      id,
      name: draft.name,
      country: draft.country,
      property_type: draft.property_type,
      gia_m2: draft.gia_m2,
      reporting_year: draft.reporting_year,
      energy: draft.energy ?? {},
      postal_code: draft.postal_code,
      region: draft.region,
      tags: draft.tags,
      body: draft.body,
    })
  }

  return { assets, warnings }
}

export const ASSETS_CSV_TEMPLATE = `Name,Country,Postal Code,Property Type,GIA m²,Reporting Year,Elec_Grid,Gas,District_Heating,Tags,Notes
Midtown Tower,USA,10005,Office,7500,2024,850000,,680000,"sample,office",Sample office in NYC
Pacific Plaza Mall,Hong Kong,,Shopping Center,22000,2024,2800000,320000,,sample,Hong Kong retail
Northgate Quarter,United Kingdom,EC1A,Mixed Use,12000,2024,1100000,480000,,sample,London mixed-use
Eastfield Logistics Park,Australia,2170,Distribution Warehouse Warm,15000,2024,1400000,,,sample,Sydney warehouse
`
