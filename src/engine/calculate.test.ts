import { describe, test, expect } from 'vitest'
import fixtures from '../../references/worked-examples-fixtures-v1.0.json'
import {
  calculateYearMetrics,
  blendPathway,
  applyRetrofitsForYear,
  findMisalignmentYear,
  portfolioMetrics,
} from './calculate'
import type { EFProvider, PathwayProvider, TrajectoryPoint, EnergyMap } from './types'

// Fixture tolerances
const CI_TOL = fixtures.tolerances.intensity_kgco2e_m2_yr   // 0.5 kgCO₂e/m²/yr
const EUI_TOL = fixtures.tolerances.eui_kwh_m2_yr           // 1.0 kWh/m²/yr

const within = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol

// Fixture asset shortcuts
const A001 = fixtures.assets[0]  // Midtown Tower, NY
const A002 = fixtures.assets[1]  // Pacific Plaza Mall, HK
const A003 = fixtures.assets[2]  // Northgate Quarter, London
const A004 = fixtures.assets[3]  // Eastfield Logistics Park, Sydney

// Helper: static EF provider — ignores region and year (uses 2024 values from fixtures)
function staticEF(map: Partial<Record<string, number>>): EFProvider {
  return (carrier) => (map as Record<string, number>)[carrier] ?? 0
}

// Helper: static pathway provider for known region+type entries
function staticPathway(
  table: Record<string, Record<string, { carbon: number; eui: number }>>,
): PathwayProvider {
  return (region, propertyType) => {
    const entry = table[region]?.[propertyType]
    if (!entry) throw new Error(`No pathway stub for ${region}/${propertyType}`)
    return { carbon_kgco2e_m2: entry.carbon, eui_kwh_m2: entry.eui }
  }
}

// Helper: build TrajectoryPoint[] from fixture trajectory arrays (for misalignment tests)
type FixtureAsset = (typeof fixtures.assets)[number]
function makeTrajectory(asset: FixtureAsset): TrajectoryPoint[] {
  const { years, asset_curve_kgco2e_m2_yr, pathway_curve_kgco2e_m2_yr } = asset.trajectories
  return years.map((year, i) => ({
    year,
    metrics: {
      year,
      energy_kwh: {},
      total_energy_kwh: 0,
      eui_kwh_m2: 0,
      gross_co2_kg: 0,
      export_credit_kg: 0,
      net_co2_kg: 0,
      carbon_intensity_kgco2e_m2: asset_curve_kgco2e_m2_yr[i],
    },
    pathway: { carbon_kgco2e_m2: pathway_curve_kgco2e_m2_yr[i], eui_kwh_m2: 0 },
    misaligned_co2: asset_curve_kgco2e_m2_yr[i] > pathway_curve_kgco2e_m2_yr[i],
    misaligned_eui: false,
  }))
}

// ─── calculateYearMetrics ────────────────────────────────────────────────────

describe('calculateYearMetrics', () => {
  test('A-001 (NY Office): EUI and CI, no renewables', () => {
    const energy: EnergyMap = { Elec_Grid: 850_000, District_Heating: 680_000 }
    const ef = staticEF({ Elec_Grid: 0.237, District_Heating: 0.20431 })
    const m = calculateYearMetrics(energy, 7_500, ef, 'NY', 2024)

    expect(m.total_energy_kwh).toBe(1_530_000)
    expect(within(m.eui_kwh_m2, A001.summary.eui_kwh_m2_yr, EUI_TOL)).toBe(true)
    expect(within(m.carbon_intensity_kgco2e_m2, A001.summary.carbon_intensity_kgco2e_m2_yr, CI_TOL)).toBe(true)
    expect(m.export_credit_kg).toBe(0)
  })

  test('A-002 (HK Shopping Center): EUI and CI, multiple carriers', () => {
    const energy: EnergyMap = { Elec_Grid: 2_800_000, Gas: 320_000, District_Cooling: 2_000_000 }
    const ef = staticEF({ Elec_Grid: 0.54535, Gas: 0.18316, District_Cooling: 0.38 })
    const m = calculateYearMetrics(energy, 22_000, ef, 'HK', 2024)

    expect(m.total_energy_kwh).toBe(5_120_000)
    expect(within(m.eui_kwh_m2, A002.summary.eui_kwh_m2_yr, EUI_TOL)).toBe(true)
    expect(within(m.carbon_intensity_kgco2e_m2, A002.summary.carbon_intensity_kgco2e_m2_yr, CI_TOL)).toBe(true)
    expect(m.export_credit_kg).toBe(0)
  })

  test('A-003 (London Mixed Use): Renew_Consumed counts in EUI, export credit applied', () => {
    const energy: EnergyMap = {
      Elec_Grid: 1_100_000, Gas: 480_000,
      Renew_Consumed: 120_000, Renew_Exported: 60_000,
    }
    const ef = staticEF({ Elec_Grid: 0.1485, Gas: 0.18316 })
    const m = calculateYearMetrics(energy, 12_000, ef, 'UK', 2024)

    // Renew_Consumed counted; Renew_Exported excluded
    expect(m.total_energy_kwh).toBe(1_700_000)
    expect(within(m.eui_kwh_m2, A003.summary.eui_kwh_m2_yr, EUI_TOL)).toBe(true)
    // Export credit = MIN(60000 × 0.1485, 1100000 × 0.1485) = 8910
    expect(m.export_credit_kg).toBeCloseTo(8_910, 0)
    expect(within(m.carbon_intensity_kgco2e_m2, A003.summary.carbon_intensity_kgco2e_m2_yr, CI_TOL)).toBe(true)
  })

  test('A-004 (Sydney Warehouse): export credit uncapped, Renew_Consumed EF=0', () => {
    const energy: EnergyMap = {
      Elec_Grid: 1_400_000, Renew_Consumed: 280_000, Renew_Exported: 180_000,
    }
    const ef = staticEF({ Elec_Grid: 0.66 })
    const m = calculateYearMetrics(energy, 15_000, ef, 'NSW', 2024)

    expect(m.total_energy_kwh).toBe(1_680_000)
    // Export credit = MIN(180000 × 0.66, 1400000 × 0.66) = MIN(118800, 924000) = 118800
    expect(m.export_credit_kg).toBeCloseTo(118_800, 0)
    expect(within(m.eui_kwh_m2, A004.summary.eui_kwh_m2_yr, EUI_TOL)).toBe(true)
    expect(within(m.carbon_intensity_kgco2e_m2, A004.summary.carbon_intensity_kgco2e_m2_yr, CI_TOL)).toBe(true)
  })

  test('export credit is capped at grid CO₂ (cannot offset non-electric fuels)', () => {
    // Large renewable export but tiny grid consumption
    const energy: EnergyMap = { Elec_Grid: 100, Renew_Exported: 50_000 }
    const ef = staticEF({ Elec_Grid: 0.5 })
    const m = calculateYearMetrics(energy, 100, ef, 'TEST', 2024)
    // Credit = MIN(50000 × 0.5, 100 × 0.5) = MIN(25000, 50) = 50
    expect(m.export_credit_kg).toBe(50)
    expect(m.net_co2_kg).toBeGreaterThanOrEqual(0)
  })
})

// ─── blendPathway ────────────────────────────────────────────────────────────

describe('blendPathway', () => {
  test('A-003: 65% Office + 35% Retail High Street (UK, 2024)', () => {
    const getPathway = staticPathway({
      UK: {
        Office: { carbon: 35.689, eui: 175 },
        'Retail High Street': { carbon: 42.365, eui: 215 },
      },
    })
    const split = [
      { propertyType: 'Office', fraction: 0.65 },
      { propertyType: 'Retail High Street', fraction: 0.35 },
    ]
    const p = blendPathway(getPathway, 'UK', split, 2024)
    // 35.689 × 0.65 + 42.365 × 0.35 = 23.198 + 14.828 = 38.026
    expect(within(p.carbon_kgco2e_m2, A003.summary.co2_pathway_2024_kgco2e_m2_yr, CI_TOL)).toBe(true)
  })
})

// ─── applyRetrofitsForYear ───────────────────────────────────────────────────

describe('applyRetrofitsForYear', () => {
  const base: EnergyMap = { Elec_Grid: 1_000, Gas: 500 }

  test('no retrofits: returns base energy unchanged', () => {
    const e = applyRetrofitsForYear(base, [], 2030)
    expect(e.Elec_Grid).toBe(1_000)
    expect(e.Gas).toBe(500)
  })

  test('reduce by percent: compounds across successive retrofits', () => {
    const retrofits = [
      { id: 'r1', year: 2025, name: 'LED', impacts: [{ carrier: 'Elec_Grid' as const, operation: 'reduce' as const, mode: 'percent' as const, value: 30 }] },
      { id: 'r2', year: 2026, name: 'BMS', impacts: [{ carrier: 'Elec_Grid' as const, operation: 'reduce' as const, mode: 'percent' as const, value: 20 }] },
    ]
    const e = applyRetrofitsForYear(base, retrofits, 2030)
    // 1000 × (1 - 0.30) × (1 - 0.20) = 1000 × 0.70 × 0.80 = 560
    expect(e.Elec_Grid).toBeCloseTo(560, 5)
    expect(e.Gas).toBe(500)
  })

  test('reduce by absolute: floors at 0', () => {
    const retrofits = [
      { id: 'r1', year: 2025, name: 'Gas disconnect', impacts: [{ carrier: 'Gas' as const, operation: 'reduce' as const, mode: 'absolute' as const, value: 9_999 }] },
    ]
    const e = applyRetrofitsForYear(base, retrofits, 2030)
    expect(e.Gas).toBe(0)
  })

  test('remove: zeroes carrier, leaves others intact', () => {
    const retrofits = [
      { id: 'r1', year: 2025, name: 'Gas decommission', impacts: [{ carrier: 'Gas' as const, operation: 'remove' as const, mode: 'absolute' as const, value: 0 }] },
    ]
    const e = applyRetrofitsForYear(base, retrofits, 2030)
    expect(e.Gas).toBe(0)
    expect(e.Elec_Grid).toBe(1_000)
  })

  test('add absolute: adds kWh/yr to carrier', () => {
    const retrofits = [
      { id: 'r1', year: 2025, name: 'Rooftop PV', impacts: [{ carrier: 'Renew_Consumed' as const, operation: 'add' as const, mode: 'absolute' as const, value: 200 }] },
    ]
    const e = applyRetrofitsForYear(base, retrofits, 2030)
    expect(e.Renew_Consumed).toBe(200)
  })

  test('future retrofit not applied before its year, applied in its year', () => {
    const retrofits = [
      { id: 'r1', year: 2030, name: 'Heat pump', impacts: [{ carrier: 'Elec_Grid' as const, operation: 'reduce' as const, mode: 'percent' as const, value: 50 }] },
    ]
    expect(applyRetrofitsForYear(base, retrofits, 2029).Elec_Grid).toBe(1_000)
    expect(applyRetrofitsForYear(base, retrofits, 2030).Elec_Grid).toBe(500)
  })
})

// ─── findMisalignmentYear ────────────────────────────────────────────────────

describe('findMisalignmentYear', () => {
  test('A-001: already misaligned in 2024 (reporting year)', () => {
    expect(findMisalignmentYear(makeTrajectory(A001)).co2).toBe(2024)
  })

  test('A-002: first CO₂ misalignment at 2036', () => {
    expect(findMisalignmentYear(makeTrajectory(A002)).co2).toBe(2036)
  })

  test('A-003: first CO₂ misalignment at 2036', () => {
    expect(findMisalignmentYear(makeTrajectory(A003)).co2).toBe(2036)
  })

  test('A-004: first CO₂ misalignment at 2028', () => {
    expect(findMisalignmentYear(makeTrajectory(A004)).co2).toBe(2028)
  })

  test('never misaligned: returns null', () => {
    const always_below: TrajectoryPoint[] = [2024, 2050].map(year => ({
      year,
      metrics: { year, energy_kwh: {}, total_energy_kwh: 0, eui_kwh_m2: 50, gross_co2_kg: 0, export_credit_kg: 0, net_co2_kg: 0, carbon_intensity_kgco2e_m2: 5 },
      pathway: { carbon_kgco2e_m2: 100, eui_kwh_m2: 100 },
      misaligned_co2: false,
      misaligned_eui: false,
    }))
    const { co2, eui } = findMisalignmentYear(always_below)
    expect(co2).toBeNull()
    expect(eui).toBeNull()
  })
})

// ─── portfolioMetrics ────────────────────────────────────────────────────────

describe('portfolioMetrics', () => {
  test('four-asset GIA-weighted rollup matches fixture', () => {
    const m001 = calculateYearMetrics(
      { Elec_Grid: 850_000, District_Heating: 680_000 }, 7_500,
      staticEF({ Elec_Grid: 0.237, District_Heating: 0.20431 }), 'NY', 2024,
    )
    const m002 = calculateYearMetrics(
      { Elec_Grid: 2_800_000, Gas: 320_000, District_Cooling: 2_000_000 }, 22_000,
      staticEF({ Elec_Grid: 0.54535, Gas: 0.18316, District_Cooling: 0.38 }), 'HK', 2024,
    )
    const m003 = calculateYearMetrics(
      { Elec_Grid: 1_100_000, Gas: 480_000, Renew_Consumed: 120_000, Renew_Exported: 60_000 }, 12_000,
      staticEF({ Elec_Grid: 0.1485, Gas: 0.18316 }), 'UK', 2024,
    )
    const m004 = calculateYearMetrics(
      { Elec_Grid: 1_400_000, Renew_Consumed: 280_000, Renew_Exported: 180_000 }, 15_000,
      staticEF({ Elec_Grid: 0.66 }), 'NSW', 2024,
    )

    const p = portfolioMetrics([
      { gia: 7_500,  metrics: m001, pathway: { carbon_kgco2e_m2: A001.summary.co2_pathway_2024_kgco2e_m2_yr, eui_kwh_m2: A001.summary.eui_pathway_2024_kwh_m2_yr } },
      { gia: 22_000, metrics: m002, pathway: { carbon_kgco2e_m2: A002.summary.co2_pathway_2024_kgco2e_m2_yr, eui_kwh_m2: A002.summary.eui_pathway_2024_kwh_m2_yr } },
      { gia: 12_000, metrics: m003, pathway: { carbon_kgco2e_m2: A003.summary.co2_pathway_2024_kgco2e_m2_yr, eui_kwh_m2: A003.summary.eui_pathway_2024_kwh_m2_yr } },
      { gia: 15_000, metrics: m004, pathway: { carbon_kgco2e_m2: A004.summary.co2_pathway_2024_kgco2e_m2_yr, eui_kwh_m2: A004.summary.eui_pathway_2024_kwh_m2_yr } },
    ])

    const ps = fixtures.portfolio.summary
    expect(within(p.eui_kwh_m2,                  ps.eui_kwh_m2_yr,                  EUI_TOL)).toBe(true)
    expect(within(p.carbon_intensity_kgco2e_m2,  ps.carbon_intensity_kgco2e_m2_yr,  CI_TOL)).toBe(true)
    expect(within(p.pathway.carbon_kgco2e_m2,    ps.co2_pathway_2024_kgco2e_m2_yr,  CI_TOL)).toBe(true)
    expect(within(p.pathway.eui_kwh_m2,          ps.eui_pathway_2024_kwh_m2_yr,     EUI_TOL)).toBe(true)
  })
})
