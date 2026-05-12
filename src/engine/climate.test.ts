import { describe, test, expect } from 'vitest'
import { applyClimateAdjustment, projectTrajectory } from './calculate'
import { getClimateFactors, hasClimateData, efProvider, pathwayProvider } from './providers'
import type { EnergyMap } from './types'

const staticEF = (): import('./types').EFProvider =>
  (carrier) => carrier === 'Elec_Grid' ? 0.2 : carrier === 'Gas' ? 0.18316 : 0.20431

const flatPathway = (): import('./types').PathwayProvider =>
  () => ({ carbon_kgco2e_m2: 100, eui_kwh_m2: 200 })

// ────────────────────────────────────────────────────────────────────────────
// applyClimateAdjustment
// ────────────────────────────────────────────────────────────────────────────

describe('applyClimateAdjustment', () => {
  const energy: EnergyMap = {
    Elec_Grid: 100_000,
    Gas: 50_000,
    District_Heating: 80_000,
    District_Cooling: 30_000,
    Renew_Consumed: 10_000,
  }

  test('null factors → input passes through unchanged', () => {
    expect(applyClimateAdjustment(energy, null)).toEqual(energy)
  })

  test('1×/1× factors → input passes through unchanged', () => {
    expect(applyClimateAdjustment(energy, { heatingFactor: 1, coolingFactor: 1 })).toEqual(energy)
  })

  test('heating factor scales heating carriers (Gas, District_Heating); leaves Elec + Cooling alone', () => {
    const out = applyClimateAdjustment(energy, { heatingFactor: 0.8, coolingFactor: 1 })
    expect(out.Gas).toBeCloseTo(40_000, 5)
    expect(out.District_Heating).toBeCloseTo(64_000, 5)
    // Cooling untouched
    expect(out.District_Cooling).toBe(30_000)
    // Elec_Grid untouched (mixed-use, can't split without sub-metering)
    expect(out.Elec_Grid).toBe(100_000)
    // Renew untouched
    expect(out.Renew_Consumed).toBe(10_000)
  })

  test('cooling factor scales District_Cooling; leaves heating alone', () => {
    const out = applyClimateAdjustment(energy, { heatingFactor: 1, coolingFactor: 1.5 })
    expect(out.District_Cooling).toBeCloseTo(45_000, 5)
    expect(out.Gas).toBe(50_000)
  })

  test('returns a new map (does not mutate input)', () => {
    const before = { ...energy }
    applyClimateAdjustment(energy, { heatingFactor: 0.5, coolingFactor: 2 })
    expect(energy).toEqual(before)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// getClimateFactors / hasClimateData (real data lookups)
// ────────────────────────────────────────────────────────────────────────────

describe('getClimateFactors', () => {
  test('Germany has bundled climate data', () => {
    expect(hasClimateData('Germany')).toBe(true)
  })

  test('UK alias resolves to bundled UK data', () => {
    expect(hasClimateData('UK')).toBe(true)
    expect(hasClimateData('United Kingdom')).toBe(true)
  })

  test('USA has no European HDD/CDD data', () => {
    expect(hasClimateData('USA')).toBe(false)
  })

  test('factors at the baseline year (2024) are 1×/1×', () => {
    const f = getClimateFactors('Germany', 2024, 'rcp45')
    expect(f).not.toBeNull()
    expect(f!.heatingFactor).toBeCloseTo(1, 5)
    expect(f!.coolingFactor).toBeCloseTo(1, 5)
  })

  test('RCP 4.5 → heating factor < 1 (warmer climate, less heating)', () => {
    const f = getClimateFactors('Germany', 2050, 'rcp45')
    expect(f).not.toBeNull()
    expect(f!.heatingFactor).toBeLessThan(1)
    expect(f!.coolingFactor).toBeGreaterThan(1)
  })

  test('RCP 8.5 amplifies the change vs RCP 4.5 (faster warming)', () => {
    const f45 = getClimateFactors('Germany', 2050, 'rcp45')!
    const f85 = getClimateFactors('Germany', 2050, 'rcp85')!
    expect(f85.heatingFactor).toBeLessThan(f45.heatingFactor)  // even less heating under high-emissions
    expect(f85.coolingFactor).toBeGreaterThan(f45.coolingFactor)  // even more cooling
  })

  test('scenario "none" returns 1×/1× regardless of country / year', () => {
    const f = getClimateFactors('Germany', 2050, 'none')
    expect(f).toEqual({ heatingFactor: 1, coolingFactor: 1 })
  })

  test('returns null for countries without climate data', () => {
    expect(getClimateFactors('USA', 2050, 'rcp45')).toBeNull()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Sub-national region fallback (the AUS6 / NYSTc problem)
// ────────────────────────────────────────────────────────────────────────────

describe('sub-national region fallback', () => {
  test('AUS6 pathway falls back to Australia country-level data', () => {
    const p = pathwayProvider('AUS6', 'Distribution Warehouse Warm', 2024)
    expect(p.carbon_kgco2e_m2).toBeGreaterThan(0)
    expect(p.eui_kwh_m2).toBeGreaterThan(0)
  })

  test('AUS6 grid EF falls back to a real Australian EF (parsed or static)', () => {
    const ef = efProvider('Elec_Grid', 'AUS6', 2024)
    // CRREM v2.05 ships Australia at the sub-region level; our fallback chain
    // resolves AUS6 → Australia (parent) and either picks up a v2.05-derived
    // Australia EF (typically 0.5–0.7 kgCO₂e/kWh) or the static fallback (0.66).
    expect(ef).toBeGreaterThan(0.4)
    expect(ef).toBeLessThan(0.9)
  })

  test('AUS6 grid EF in 2050 is meaningfully lower than 2024 (decarb trajectory)', () => {
    const ef2024 = efProvider('Elec_Grid', 'AUS6', 2024)
    const ef2050 = efProvider('Elec_Grid', 'AUS6', 2050)
    expect(ef2050).toBeLessThan(ef2024)
  })

  test('USA NYSTc-style sub-national codes still resolve via parent USA', () => {
    // The pathway sheet has USA sub-regions directly so this is mostly a no-op,
    // but the fallback should not regress for USA.
    const p = pathwayProvider('NYSTc_Mixed mild_4A', 'Office', 2024)
    expect(p.carbon_kgco2e_m2).toBeCloseTo(35.06, 1)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// projectTrajectory + climate adjustment integration
// ────────────────────────────────────────────────────────────────────────────

describe('projectTrajectory with climate adjustment', () => {
  test('asset with no climate scenario projects flat heating demand', () => {
    const traj = projectTrajectory({
      baseEnergy: { Gas: 100_000, District_Heating: 50_000 },
      gia: 1000,
      getEF: staticEF(),
      getPathway: flatPathway(),
      region: 'Germany',
      split: [{ propertyType: 'Office', fraction: 1 }],
      retrofits: [],
      startYear: 2024,
      endYear: 2050,
    })
    // Without climate adjustment, year 2050 has same energy as year 2024
    expect(traj[traj.length - 1].metrics.energy_kwh.Gas).toBeCloseTo(100_000, 5)
    expect(traj[traj.length - 1].metrics.energy_kwh.District_Heating).toBeCloseTo(50_000, 5)
  })

  test('asset with RCP 4.5 climate scenario reduces heating demand over time', () => {
    const getClimate = (year: number) => getClimateFactors('Germany', year, 'rcp45')
    const traj = projectTrajectory({
      baseEnergy: { Gas: 100_000 },
      gia: 1000,
      getEF: staticEF(),
      getPathway: flatPathway(),
      region: 'Germany',
      split: [{ propertyType: 'Office', fraction: 1 }],
      retrofits: [],
      startYear: 2024,
      endYear: 2050,
      getClimateFactors: getClimate,
    })
    // 2024 is the baseline → no adjustment
    expect(traj[0].metrics.energy_kwh.Gas).toBeCloseTo(100_000, 5)
    // 2050 should have reduced gas demand under RCP 4.5
    expect(traj[traj.length - 1].metrics.energy_kwh.Gas).toBeLessThan(100_000)
  })

  test('actuals are not climate-adjusted (measured truth)', () => {
    const measured: EnergyMap = { Gas: 999_999 }
    const getClimate = (year: number) => getClimateFactors('Germany', year, 'rcp85')
    const traj = projectTrajectory({
      baseEnergy: { Gas: 100_000 },
      gia: 1000,
      getEF: staticEF(),
      getPathway: flatPathway(),
      region: 'Germany',
      split: [{ propertyType: 'Office', fraction: 1 }],
      retrofits: [],
      startYear: 2024,
      endYear: 2030,
      getActual: (year) => year === 2025 ? measured : null,
      getClimateFactors: getClimate,
    })
    const point2025 = traj.find(p => p.year === 2025)!
    expect(point2025.metrics.energy_kwh.Gas).toBe(999_999)  // untouched
    expect(point2025.is_actual).toBe(true)
  })
})
