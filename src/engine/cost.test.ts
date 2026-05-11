import { describe, test, expect } from 'vitest'
import { escalatePrice, analyseRetrofitCost, analyseScenarioCost } from './cost'
import { computeNPV, computeIRR, computePaybackYears } from './finance'
import type { Asset, Retrofit } from './types'

const baseAsset: Pick<Asset, 'energy' | 'utility_prices' | 'reporting_year'> = {
  reporting_year: 2024,
  energy: { Elec_Grid: 1_000_000, Gas: 500_000 },
  utility_prices: { Elec_Grid: 0.20, Gas: 0.06, currency: 'USD' },
}

function ledRetrofit(year = 2026): Retrofit {
  return {
    id: 'r-led', year, name: 'LED',
    impacts: [{ carrier: 'Elec_Grid', operation: 'reduce', mode: 'percent', value: 18 }],
    cost: { capex_total: 450_000, currency: 'USD' },
  }
}

function heatPumpRetrofit(year = 2028): Retrofit {
  return {
    id: 'r-hp', year, name: 'Heat pump',
    impacts: [
      { carrier: 'Gas', operation: 'remove', mode: 'absolute', value: 0 },
      { carrier: 'Elec_Grid', operation: 'add', mode: 'absolute', value: 200_000 },
    ],
    cost: { capex_total: 1_200_000, currency: 'USD' },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// escalatePrice
// ─────────────────────────────────────────────────────────────────────────────

describe('escalatePrice', () => {
  test('returns input price when escalation is undefined / 0', () => {
    expect(escalatePrice(0.20, 5, undefined)).toBe(0.20)
    expect(escalatePrice(0.20, 5, 0)).toBe(0.20)
  })

  test('returns input price when yearsAhead is 0', () => {
    expect(escalatePrice(0.20, 0, 3)).toBe(0.20)
  })

  test('compounds annually (3% × 10 yrs ≈ 1.343× original)', () => {
    expect(escalatePrice(1, 10, 3)).toBeCloseTo(1.3439, 4)
  })

  test('handles negative escalation (real-terms decline)', () => {
    expect(escalatePrice(1, 5, -2)).toBeCloseTo(0.9039, 4)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// analyseRetrofitCost — single retrofit
// ─────────────────────────────────────────────────────────────────────────────

describe('analyseRetrofitCost', () => {
  test('LED: reduces Elec_Grid 18%, savings = 1M × 0.18 × $0.20 = $36k/yr', () => {
    const r = analyseRetrofitCost(baseAsset, ledRetrofit(2024), [])
    expect(r.energyDelta.Elec_Grid).toBeCloseTo(180_000, 0)
    expect(r.annualSavings).toBeCloseTo(36_000, 0)
    expect(r.capex).toBe(450_000)
    expect(r.paybackYears).toBeCloseTo(450_000 / 36_000, 2)  // 12.5 yr
    expect(r.currency).toBe('USD')
  })

  test('escalation pushes savings up for future-year retrofits', () => {
    const asset = {
      ...baseAsset,
      utility_prices: { ...baseAsset.utility_prices!, escalation_pct_per_year: 3 },
    }
    const flat = analyseRetrofitCost(baseAsset, ledRetrofit(2024), []).annualSavings!
    const escalated2030 = analyseRetrofitCost(asset, ledRetrofit(2030), []).annualSavings!
    // 2030 is 6 yrs ahead of reporting_year 2024 → 1.03^6 = 1.194
    expect(escalated2030 / flat).toBeCloseTo(Math.pow(1.03, 6), 3)
  })

  test('heat pump: gas removed + electricity added — net savings vary with prices', () => {
    const r = analyseRetrofitCost(baseAsset, heatPumpRetrofit(2024), [])
    // Gas saved: 500k × $0.06 = $30k; Elec added: 200k × $0.20 = $40k. Net = -$10k.
    expect(r.energyDelta.Gas).toBe(500_000)
    expect(r.energyDelta.Elec_Grid).toBe(-200_000)
    expect(r.annualSavings).toBeCloseTo(-10_000, 0)
    expect(r.paybackYears).toBeNull()  // negative annual savings
  })

  test('returns null annualSavings when a delta carrier has no price', () => {
    const noPrice = {
      reporting_year: 2024,
      energy: { Elec_Grid: 1_000_000, District_Heating: 500_000 },
      utility_prices: { Elec_Grid: 0.20, currency: 'USD' },  // no DH price
    } as const
    const dhRetrofit: Retrofit = {
      id: 'r-dh', year: 2024, name: 'DH retrofit',
      impacts: [{ carrier: 'District_Heating', operation: 'reduce', mode: 'percent', value: 20 }],
      cost: { capex_total: 100_000 },
    }
    const r = analyseRetrofitCost(noPrice, dhRetrofit, [])
    expect(r.annualSavings).toBeNull()
    expect(r.missingPrices).toContain('District_Heating')
    expect(r.paybackYears).toBeNull()
  })

  test('returns null payback when capex is 0', () => {
    const free: Retrofit = { ...ledRetrofit(2024), cost: { capex_total: 0 } }
    const r = analyseRetrofitCost(baseAsset, free, [])
    expect(r.annualSavings).toBeGreaterThan(0)
    expect(r.paybackYears).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// analyseScenarioCost — multi-retrofit chronological dependency
// ─────────────────────────────────────────────────────────────────────────────

describe('analyseScenarioCost', () => {
  test('two-retrofit scenario: each retrofit measured against prior state', () => {
    const summary = analyseScenarioCost(baseAsset, [ledRetrofit(2026), heatPumpRetrofit(2028)])
    expect(summary.perRetrofit).toHaveLength(2)
    // First retrofit (LED) sees the original state
    expect(summary.perRetrofit[0].energyDelta.Elec_Grid).toBeCloseTo(180_000, 0)
    // Second retrofit (HP) sees the LED-reduced state for the gas removal but adds new electricity
    expect(summary.perRetrofit[1].energyDelta.Gas).toBe(500_000)
    expect(summary.perRetrofit[1].energyDelta.Elec_Grid).toBe(-200_000)
    expect(summary.totalCapex).toBe(450_000 + 1_200_000)
  })

  test('chronological order is enforced regardless of input order', () => {
    const a = analyseScenarioCost(baseAsset, [heatPumpRetrofit(2028), ledRetrofit(2026)])
    const b = analyseScenarioCost(baseAsset, [ledRetrofit(2026), heatPumpRetrofit(2028)])
    expect(a.perRetrofit[0].retrofit.id).toBe('r-led')
    expect(a.perRetrofit[1].retrofit.id).toBe('r-hp')
    expect(a.perRetrofit[0].annualSavings).toBe(b.perRetrofit[0].annualSavings)
  })

  test('hasMissingPrices flag flips when any retrofit has unpriced carrier', () => {
    const noPrice = {
      reporting_year: 2024,
      energy: { Elec_Grid: 1_000_000, Oil: 100_000 },
      utility_prices: { Elec_Grid: 0.20, currency: 'USD' },
    } as const
    const oilOff: Retrofit = {
      id: 'r-oil', year: 2026, name: 'Oil off',
      impacts: [{ carrier: 'Oil', operation: 'remove', mode: 'absolute', value: 0 }],
      cost: { capex_total: 50_000 },
    }
    const summary = analyseScenarioCost(noPrice, [ledRetrofit(2024), oilOff])
    expect(summary.hasMissingPrices).toBe(true)
    expect(summary.totalAnnualSavings).toBeNull()  // can't sum if any leg is null
  })

  test('average payback = totalCapex / totalAnnualSavings', () => {
    const summary = analyseScenarioCost(baseAsset, [ledRetrofit(2026)])
    expect(summary.averagePaybackYears).toBeCloseTo(450_000 / 36_000, 2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Finance helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('computeNPV', () => {
  test('NPV at 0% discount equals sum of cashflows', () => {
    expect(computeNPV([100, 100, 100], 0)).toBeCloseTo(300, 5)
  })

  test('NPV of $100 over 3 years at 10% discount (annuity-immediate convention)', () => {
    // Index 0 = t=0 (no discount). Σ 100 / 1.1^t for t=0,1,2
    const expected = 100 + 100 / 1.1 + 100 / 1.21
    expect(computeNPV([100, 100, 100], 10)).toBeCloseTo(expected, 4)
  })

  test('handles upfront capex (negative cashflow at t=0)', () => {
    // Capex of 250 today, 100/yr for 3 yrs at 10% → NPV ≈ -250 + 248.7 = -1.3
    expect(computeNPV([-250, 100, 100, 100], 10)).toBeCloseTo(-1.31, 1)
  })
})

describe('computeIRR', () => {
  test('IRR of a positive uniform stream is undefined (no sign change)', () => {
    expect(computeIRR([100, 100, 100])).toBeNull()
  })

  test('IRR of -100 → 50/yr × 3 yrs is ~23.4%', () => {
    const irr = computeIRR([-100, 50, 50, 50])
    expect(irr).not.toBeNull()
    expect(irr!).toBeCloseTo(23.38, 1)
  })

  test('IRR of -1000 → 200/yr × 10 yrs is ~15.1%', () => {
    const cashflows = [-1000, ...Array(10).fill(200)]
    const irr = computeIRR(cashflows)
    expect(irr!).toBeCloseTo(15.10, 1)
  })
})

describe('computePaybackYears', () => {
  test('uniform $100/yr against $300 capex pays back at year 3', () => {
    expect(computePaybackYears(300, [100, 100, 100, 100])).toBeCloseTo(3, 5)
  })

  test('mixed cashflows with mid-year payback (interpolated)', () => {
    // 250 capex, 100 + 100 in years 1+2 (covers 200), 50 in year 3 covers remaining 50
    // → 2 + 50/50 fraction = 3 yrs
    expect(computePaybackYears(250, [100, 100, 100])).toBeCloseTo(2.5, 5)
  })

  test('returns null when capex is never recovered', () => {
    expect(computePaybackYears(1000, [50, 50, 50])).toBeNull()
  })
})
