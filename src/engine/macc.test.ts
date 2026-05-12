import { describe, test, expect } from 'vitest'
import { buildMACC } from './macc'
import { analyseScenarioCost } from './cost'
import type { Asset, Retrofit, EFProvider } from './types'

const baseAsset: Asset = {
  id: 'a',
  name: 'A',
  country: 'USA',
  property_type: 'Office',
  gia_m2: 5000,
  reporting_year: 2024,
  energy: { Elec_Grid: 1_000_000, Gas: 500_000 },
  utility_prices: { Elec_Grid: 0.20, Gas: 0.06, currency: 'USD' },
}

const flatEF: EFProvider = (carrier) =>
  carrier === 'Elec_Grid' ? 0.30
    : carrier === 'Gas' ? 0.18316
    : 0

const led: Retrofit = {
  id: 'r-led', year: 2025, name: 'LED',
  impacts: [{ carrier: 'Elec_Grid', operation: 'reduce', mode: 'percent', value: 18 }],
  cost: { capex_total: 100_000, currency: 'USD' },
  lifetime_years: 10,
}

const heatPump: Retrofit = {
  id: 'r-hp', year: 2027, name: 'Heat pump',
  impacts: [
    { carrier: 'Gas', operation: 'remove', mode: 'absolute', value: 0 },
    { carrier: 'Elec_Grid', operation: 'add', mode: 'absolute', value: 200_000 },
  ],
  cost: { capex_total: 1_200_000, currency: 'USD' },
  lifetime_years: 15,
}

describe('buildMACC', () => {
  test('produces one bar per retrofit', () => {
    const cost = analyseScenarioCost(baseAsset, [led, heatPump])
    const macc = buildMACC({
      asset: baseAsset,
      retrofits: [led, heatPump],
      perRetrofitCost: cost.perRetrofit,
      getEF: flatEF,
      region: 'USA',
      discountRatePct: 6,
    })
    expect(macc.bars).toHaveLength(2)
  })

  test('sorts bars by costPerTCO2 ascending', () => {
    const cost = analyseScenarioCost(baseAsset, [led, heatPump])
    const macc = buildMACC({
      asset: baseAsset,
      retrofits: [led, heatPump],
      perRetrofitCost: cost.perRetrofit,
      getEF: flatEF,
      region: 'USA',
      discountRatePct: 6,
    })
    const sorted = [...macc.bars].sort((a, b) => (a.costPerTCO2 ?? Infinity) - (b.costPerTCO2 ?? Infinity))
    expect(macc.bars).toEqual(sorted)
  })

  test('LED with 10yr lifetime + 6% discount → CRF ≈ 0.1359, annualised capex ≈ 13,587', () => {
    const cost = analyseScenarioCost(baseAsset, [led])
    const macc = buildMACC({
      asset: baseAsset,
      retrofits: [led],
      perRetrofitCost: cost.perRetrofit,
      getEF: flatEF,
      region: 'USA',
      discountRatePct: 6,
    })
    expect(macc.bars[0].annualisedCapex).toBeCloseTo(13_587, -1)
  })

  test('LED CO2 abatement = 1M kWh × 0.18 reduction × 0.30 EF / 1000 = 54 tCO₂/yr', () => {
    const cost = analyseScenarioCost(baseAsset, [led])
    const macc = buildMACC({
      asset: baseAsset, retrofits: [led], perRetrofitCost: cost.perRetrofit,
      getEF: flatEF, region: 'USA', discountRatePct: 6,
    })
    expect(macc.bars[0].annualAbatementTCO2).toBeCloseTo(54, 1)
  })

  test('totalAbatementTCO2 sums positive bars', () => {
    const cost = analyseScenarioCost(baseAsset, [led, heatPump])
    const macc = buildMACC({
      asset: baseAsset, retrofits: [led, heatPump], perRetrofitCost: cost.perRetrofit,
      getEF: flatEF, region: 'USA', discountRatePct: 6,
    })
    expect(macc.totalAbatementTCO2).toBeGreaterThan(0)
  })

  test('zero-discount CRF = 1/lifetime → annualised capex = capex / lifetime', () => {
    const cost = analyseScenarioCost(baseAsset, [led])
    const macc = buildMACC({
      asset: baseAsset, retrofits: [led], perRetrofitCost: cost.perRetrofit,
      getEF: flatEF, region: 'USA', discountRatePct: 0,
    })
    expect(macc.bars[0].annualisedCapex).toBeCloseTo(100_000 / 10, 5)
  })

  test('retrofit without lifetime_years → uses defaultLifetimeYears (15)', () => {
    const noLife: Retrofit = { ...led, lifetime_years: undefined }
    const cost = analyseScenarioCost(baseAsset, [noLife])
    const macc = buildMACC({
      asset: baseAsset, retrofits: [noLife], perRetrofitCost: cost.perRetrofit,
      getEF: flatEF, region: 'USA', discountRatePct: 0,
    })
    expect(macc.bars[0].lifetimeYears).toBe(15)
  })

  test('costPerTCO2 = null when annualSavings is null (missing prices)', () => {
    const noPriceAsset: Asset = { ...baseAsset, utility_prices: undefined }
    const cost = analyseScenarioCost(noPriceAsset, [led])
    const macc = buildMACC({
      asset: noPriceAsset, retrofits: [led], perRetrofitCost: cost.perRetrofit,
      getEF: flatEF, region: 'USA', discountRatePct: 6,
    })
    expect(macc.bars[0].costPerTCO2).toBeNull()
  })

  test('handles zero-abatement retrofit (no carbon impact) without divide-by-zero', () => {
    const noOp: Retrofit = {
      id: 'r-noop', year: 2025, name: 'No-op',
      impacts: [],
      cost: { capex_total: 50_000, currency: 'USD' },
      lifetime_years: 10,
    }
    const cost = analyseScenarioCost(baseAsset, [noOp])
    const macc = buildMACC({
      asset: baseAsset, retrofits: [noOp], perRetrofitCost: cost.perRetrofit,
      getEF: flatEF, region: 'USA', discountRatePct: 6,
    })
    expect(macc.bars[0].annualAbatementTCO2).toBe(0)
    expect(macc.bars[0].costPerTCO2).toBeNull()  // can't divide by zero
  })

  test('empty retrofit list → empty MACC', () => {
    const macc = buildMACC({
      asset: baseAsset, retrofits: [], perRetrofitCost: [],
      getEF: flatEF, region: 'USA', discountRatePct: 6,
    })
    expect(macc.bars).toHaveLength(0)
    expect(macc.totalAbatementTCO2).toBe(0)
  })
})
