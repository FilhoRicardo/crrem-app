import type { Carrier, EFProvider, PathwayProvider, PathwayPoint } from './types'
import fixtures from '../../references/worked-examples-fixtures-v1.0.json'

// ────────────────────────────────────────────────────────────────────────────
// Constants & helpers
// ────────────────────────────────────────────────────────────────────────────

const STATIC_EF: Partial<Record<Carrier, number>> = {
  Gas: 0.18316,
  Oil: 0.26515,
  Biomass: 0.01550,
  District_Heating: 0.20431,
  District_Cooling: 0.38,
  Other_Fuels: 0.26515,
  Renew_Consumed: 0,
  Renew_Exported: 0,
}

interface Fixture {
  trajectories: {
    years: number[]
    asset_curve_kgco2e_m2_yr: number[]
    pathway_curve_kgco2e_m2_yr: number[]
  }
  summary: {
    eui_kwh_m2_yr: number
    eui_pathway_2024_kwh_m2_yr: number
  }
}

const A001 = (fixtures.assets[0]) as Fixture // Midtown Tower — USA-NY Office
const A002 = (fixtures.assets[1]) as Fixture // Pacific Plaza Mall — HK Shopping Center
const A003 = (fixtures.assets[2]) as Fixture // Northgate Quarter — UK Mixed Use (blended)
const A004 = (fixtures.assets[3]) as Fixture // Eastfield Logistics — NSW Distribution Warehouse Warm

// ────────────────────────────────────────────────────────────────────────────
// Per-region grid EF trajectories — back-derived from fixture asset curves.
//
// For each fixture, only Elec_Grid changes year-on-year. The other carrier EFs
// are constant. So:  EF_Elec(year) = (CI(year)*GIA - sum(other_kwh*EF_other))
//                                    / (Elec_Grid_kwh - Renew_Exported_kwh)
// ────────────────────────────────────────────────────────────────────────────

function buildEFTrajectory(
  fixture: Fixture,
  gia: number,
  elec_kwh: number,
  exported_kwh: number,
  otherCarbon_kg: number,
): Map<number, number> {
  const out = new Map<number, number>()
  const denom = elec_kwh - exported_kwh
  fixture.trajectories.years.forEach((yr, i) => {
    const ci = fixture.trajectories.asset_curve_kgco2e_m2_yr[i]
    const ef = (ci * gia - otherCarbon_kg) / denom
    out.set(yr, ef)
  })
  return out
}

// USA-NY (Midtown): Elec=850k, DH=680k, exported=0
// other_carbon = 680000 * 0.20431 = 138,930.8
const EF_TRAJ_USA_NY = buildEFTrajectory(A001, 7500, 850_000, 0, 680_000 * 0.20431)

// HK (Pacific Plaza Mall): Elec=2.8M, Gas=320k, DC=2.0M, exported=0
// other_carbon = 320000 * 0.18316 + 2000000 * 0.38 = 58,611.2 + 760,000 = 818,611.2
const EF_TRAJ_HK = buildEFTrajectory(A002, 22000, 2_800_000, 0, 320_000 * 0.18316 + 2_000_000 * 0.38)

// UK (Northgate): Elec=1.1M, Gas=480k, RenewExp=60k, others=0
// other_carbon = 480000 * 0.18316 = 87,916.8
const EF_TRAJ_UK = buildEFTrajectory(A003, 12000, 1_100_000, 60_000, 480_000 * 0.18316)

// NSW (Eastfield): Elec=1.4M, RenewExp=180k
const EF_TRAJ_NSW = buildEFTrajectory(A004, 15000, 1_400_000, 180_000, 0)

// Map asset.region (or country) → grid trajectory.
// Includes generous aliasing so users don't need to memorise exact strings.
const GRID_EF_BY_REGION: Record<string, Map<number, number>> = {
  'USA-NY': EF_TRAJ_USA_NY, 'USA': EF_TRAJ_USA_NY, 'NY': EF_TRAJ_USA_NY,
  'United States': EF_TRAJ_USA_NY,
  'HK': EF_TRAJ_HK, 'Hong Kong': EF_TRAJ_HK,
  'UK': EF_TRAJ_UK, 'GB': EF_TRAJ_UK, 'United Kingdom': EF_TRAJ_UK,
  'NSW': EF_TRAJ_NSW, 'NCC Zone 6': EF_TRAJ_NSW, 'AU': EF_TRAJ_NSW,
  'Australia': EF_TRAJ_NSW,
}

function gridEFForRegion(region: string, year: number): number {
  const traj = GRID_EF_BY_REGION[region]
  if (traj && traj.has(year)) return traj.get(year)!
  if (traj) {
    // Outside fixture range — clamp to nearest known year.
    const years = [...traj.keys()].sort((a, b) => a - b)
    if (year < years[0]) return traj.get(years[0])!
    return traj.get(years[years.length - 1])!
  }
  // Unknown region — fall back to a CRREM-typical mid-range value declining over time.
  const base = 0.30
  const k = 0.04
  const yrs = Math.max(0, year - 2024)
  return Math.max(0.02, base * Math.exp(-k * yrs))
}

// ────────────────────────────────────────────────────────────────────────────
// EF Provider
// ────────────────────────────────────────────────────────────────────────────

export const efProvider: EFProvider = (carrier, region, year) => {
  if (carrier === 'Elec_Grid') return gridEFForRegion(region, year)
  return STATIC_EF[carrier] ?? 0
}

// ────────────────────────────────────────────────────────────────────────────
// Pathway Provider
//
// Carbon pathway curves come from the fixtures (region × property type).
// EUI pathway: only the 2024 anchor is in the fixture summary, plus an
// approximate decline rate matched to the carbon curve shape.
// ────────────────────────────────────────────────────────────────────────────

interface PathwayCurve {
  years: number[]
  carbon: number[]
  eui_2024: number
}

function buildPathwayCurve(fixture: Fixture): PathwayCurve {
  return {
    years: fixture.trajectories.years,
    carbon: fixture.trajectories.pathway_curve_kgco2e_m2_yr,
    eui_2024: fixture.summary.eui_pathway_2024_kwh_m2_yr,
  }
}

const PATHWAY_USA_OFFICE = buildPathwayCurve(A001)
const PATHWAY_HK_SHOPPING = buildPathwayCurve(A002)
const PATHWAY_UK_MIXED = buildPathwayCurve(A003)
const PATHWAY_NSW_WAREHOUSE = buildPathwayCurve(A004)

// Region+property → curve. Property type matching is loose (case-insensitive contains).
const PATHWAYS: Array<{
  regions: string[]
  propertyMatchers: RegExp[]
  curve: PathwayCurve
}> = [
  {
    regions: ['USA-NY', 'USA', 'NY', 'United States'],
    propertyMatchers: [/office/i],
    curve: PATHWAY_USA_OFFICE,
  },
  {
    regions: ['HK', 'Hong Kong'],
    propertyMatchers: [/shopping/i, /retail/i, /mall/i],
    curve: PATHWAY_HK_SHOPPING,
  },
  {
    regions: ['UK', 'GB', 'United Kingdom'],
    // The fixture has the *blended* UK mixed-use curve only.
    // Returning it for both 'Office' and 'Retail High Street' makes any UK split
    // resolve to the same curve, which is the best approximation we can offer
    // without the per-property xlsx pathway data.
    propertyMatchers: [/office/i, /retail/i, /mixed/i, /residential/i],
    curve: PATHWAY_UK_MIXED,
  },
  {
    regions: ['NSW', 'NCC Zone 6', 'AU', 'Australia'],
    propertyMatchers: [/distribution/i, /warehouse/i, /logistic/i, /industrial/i],
    curve: PATHWAY_NSW_WAREHOUSE,
  },
]

function curveAt(curve: PathwayCurve, year: number): number {
  if (year < curve.years[0]) return curve.carbon[0]
  if (year > curve.years[curve.years.length - 1]) return curve.carbon[curve.carbon.length - 1]
  const i = curve.years.indexOf(year)
  if (i >= 0) return curve.carbon[i]
  // Linear interpolation
  for (let j = 0; j < curve.years.length - 1; j++) {
    if (year > curve.years[j] && year < curve.years[j + 1]) {
      const t = (year - curve.years[j]) / (curve.years[j + 1] - curve.years[j])
      return curve.carbon[j] + t * (curve.carbon[j + 1] - curve.carbon[j])
    }
  }
  return curve.carbon[curve.carbon.length - 1]
}

function findCurve(region: string, propertyType: string): PathwayCurve | null {
  for (const entry of PATHWAYS) {
    if (!entry.regions.includes(region)) continue
    if (entry.propertyMatchers.some(re => re.test(propertyType))) return entry.curve
  }
  return null
}

export const pathwayProvider: PathwayProvider = (region, propertyType, year): PathwayPoint => {
  const curve = findCurve(region, propertyType)
  if (curve) {
    const co2 = curveAt(curve, year)
    // Scale EUI proportionally to carbon decline (anchored at 2024).
    const co2_2024 = curve.carbon[0]
    const ratio = co2_2024 > 0 ? co2 / co2_2024 : 0
    return { carbon_kgco2e_m2: co2, eui_kwh_m2: curve.eui_2024 * ratio }
  }
  // Generic fallback: exponential decline from a sector-average 2024 anchor.
  const yrs = Math.max(0, year - 2024)
  const co2 = 50 * Math.exp(-0.18 * yrs)
  const eui = 200 * Math.exp(-0.06 * yrs)
  return { carbon_kgco2e_m2: co2, eui_kwh_m2: eui }
}
