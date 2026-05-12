import type { Asset, Carrier, Retrofit, EnergyMap } from './types'
import { applyRetrofitsForYear } from './calculate'
import { computeNPV, computeIRR, computePaybackYears, computeDiscountedPaybackYears, buildCashflows } from './finance'

/**
 * Apply a compound annual escalator to a price. Returns the price `yearsAhead`
 * years after the baseline. Defaults to 0% (no escalation).
 *
 * Pulled out so the same escalation rule applies everywhere (cost analysis,
 * NPV calcs we might add later, scenario comparisons).
 */
export function escalatePrice(price: number, yearsAhead: number, escalationPctPerYear: number | undefined): number {
  if (!escalationPctPerYear || escalationPctPerYear === 0 || yearsAhead === 0) return price
  return price * Math.pow(1 + escalationPctPerYear / 100, yearsAhead)
}

/**
 * Compute the per-year energy *delta* a retrofit causes vs the prior state.
 *
 * For ROI / payback, we compare:
 *   - "with this retrofit applied" (this retrofit + every retrofit before it
 *      in the same scenario, in chronological order)
 *   - "without this retrofit" (only the retrofits that came *strictly before*
 *      it in the same scenario, in chronological order)
 *
 * The delta per carrier is `before - after` (positive = saved kWh, negative = added kWh).
 * Multiplied by `utility_prices[carrier]` and summed → annual opex savings.
 */
export interface RetrofitCostAnalysis {
  retrofit: Retrofit
  /** kWh delta per carrier — positive = saved. */
  energyDelta: Partial<Record<Carrier, number>>
  /** Annual opex savings in the asset's currency. Null when we can't compute it. */
  annualSavings: number | null
  capex: number
  /** Years to payback (capex / annualSavings). Null when savings ≤ 0 or capex 0 or missing prices. */
  paybackYears: number | null
  currency: string | null
  missingPrices: Carrier[]
  /** Embodied carbon kgCO₂e — one-time hit at install year. */
  embodiedCarbonKg: number
}

function carriersInDelta(delta: Partial<Record<Carrier, number>>): Carrier[] {
  return (Object.keys(delta) as Carrier[]).filter(c => Math.abs(delta[c] ?? 0) > 1e-6)
}

export function analyseRetrofitCost(
  asset: Pick<Asset, 'energy' | 'utility_prices' | 'reporting_year'>,
  retrofit: Retrofit,
  prior: Retrofit[],
): RetrofitCostAnalysis {
  // "Before" energy = base + every prior retrofit applied in its activation year.
  // "After" energy = before + this retrofit applied.
  // We use retrofit.year as the snapshot year so both sides see the same active set.
  const year = retrofit.year
  const before: EnergyMap = applyRetrofitsForYear(asset.energy, prior, year)
  const after: EnergyMap = applyRetrofitsForYear(asset.energy, [...prior, retrofit], year)

  const carriers = new Set<Carrier>([
    ...(Object.keys(before) as Carrier[]),
    ...(Object.keys(after) as Carrier[]),
  ])
  const energyDelta: Partial<Record<Carrier, number>> = {}
  for (const c of carriers) {
    const d = (before[c] ?? 0) - (after[c] ?? 0)
    if (Math.abs(d) > 1e-6) energyDelta[c] = d
  }

  const prices = asset.utility_prices
  const currency = prices?.currency ?? null
  // Escalate today's prices to the retrofit's first active year. A 2030 retrofit
  // bought into a 2024-priced fuel landscape needs to use 2030 prices to be honest.
  const escPct = prices?.escalation_pct_per_year
  const yearsAhead = Math.max(0, year - (asset.reporting_year ?? year))

  let annualSavings: number | null = 0
  const missingPrices: Carrier[] = []
  for (const c of carriersInDelta(energyDelta)) {
    const todayPrice = prices?.[c as keyof typeof prices] as number | undefined
    if (typeof todayPrice !== 'number') {
      missingPrices.push(c)
      annualSavings = null
      continue
    }
    const futurePrice = escalatePrice(todayPrice, yearsAhead, escPct)
    if (annualSavings !== null) annualSavings += (energyDelta[c] ?? 0) * futurePrice
  }

  const capex = retrofit.cost?.capex_total ?? 0
  let paybackYears: number | null = null
  if (annualSavings !== null && annualSavings > 0 && capex > 0) {
    paybackYears = capex / annualSavings
  }

  return {
    retrofit,
    energyDelta,
    annualSavings,
    capex,
    paybackYears,
    currency,
    missingPrices,
    embodiedCarbonKg: retrofit.cost?.embodied_carbon_kg ?? 0,
  }
}

export interface ScenarioCostSummary {
  perRetrofit: RetrofitCostAnalysis[]
  totalCapex: number
  totalAnnualSavings: number | null
  averagePaybackYears: number | null
  /** Discounted payback (years), using the supplied discount rate. */
  discountedPaybackYears: number | null
  currency: string | null
  hasMissingPrices: boolean
  /** NPV of the combined cashflow at the supplied discount rate. Null if savings null. */
  npv: number | null
  /** IRR (%/yr) of the combined cashflow. Null if no sign change in cashflows. */
  irr: number | null
  /** Discount rate (%/yr) used for NPV. */
  discountRatePct: number
  /** Horizon (years) over which NPV/IRR were computed. */
  horizonYears: number
  /** Total embodied carbon (kgCO₂e) across all retrofits + replacements. */
  totalEmbodiedCarbonKg: number
  /** Replacement capex over the horizon (lifetime_years cycles), in currency. */
  replacementCapex: number
  /** Replacement-driven embodied carbon (kgCO₂e), already included in totalEmbodiedCarbonKg. */
  replacementEmbodiedCarbonKg: number
}

export interface FinanceParams {
  /** Cost of capital, %/yr. Used to discount future savings. */
  discountRatePct: number
  /** Years of savings to project. Defaults to 25 (CRREM trajectory length). */
  horizonYears?: number
}

export function analyseScenarioCost(
  asset: Pick<Asset, 'energy' | 'utility_prices' | 'reporting_year'>,
  retrofits: Retrofit[],
  finance: FinanceParams = { discountRatePct: 0, horizonYears: 25 },
): ScenarioCostSummary {
  // Apply in chronological order so each retrofit's "prior" set is correct.
  const ordered = [...retrofits].sort((a, b) => a.year - b.year)
  const perRetrofit: RetrofitCostAnalysis[] = []
  for (let i = 0; i < ordered.length; i++) {
    perRetrofit.push(analyseRetrofitCost(asset, ordered[i], ordered.slice(0, i)))
  }
  const totalCapex = perRetrofit.reduce((s, r) => s + r.capex, 0)

  let totalAnnualSavings: number | null = 0
  let hasMissingPrices = false
  for (const r of perRetrofit) {
    if (r.annualSavings === null) { totalAnnualSavings = null; hasMissingPrices = true; break }
    totalAnnualSavings += r.annualSavings
  }
  if (perRetrofit.some(r => r.missingPrices.length > 0)) hasMissingPrices = true

  const averagePaybackYears =
    totalAnnualSavings !== null && totalAnnualSavings > 0 && totalCapex > 0
      ? totalCapex / totalAnnualSavings
      : null

  const currency = asset.utility_prices?.currency ?? perRetrofit[0]?.currency ?? null

  // Combined cashflow for the whole scenario, anchored at year 0 = first retrofit.
  // Capex hits in the year of each retrofit; savings flow each year afterward.
  const horizonYears = finance.horizonYears ?? 25
  const discountRatePct = finance.discountRatePct
  const escPct = asset.utility_prices?.escalation_pct_per_year ?? 0

  // ─── Replacement-aware capex + embodied carbon stream ─────────────────────
  // For each retrofit with a lifetime_years, replicate the capex + embodied
  // hit at every multiple of lifetime within the horizon. The first install
  // is at retrofit.year; replacements fire at year + lifetime, year + 2*lifetime, …
  //
  // This drives the cashflow stream below (including discounted payback +
  // NPV / IRR) and the totalReplacementCapex / totalEmbodiedCarbonKg outputs.
  const startYear = ordered[0]?.year ?? 0
  const totalYears = horizonYears + 1
  const replacementCapexByYear = new Array<number>(totalYears).fill(0)
  const replacementEmbodiedByYear = new Array<number>(totalYears).fill(0)
  let replacementCapex = 0
  let replacementEmbodied = 0
  for (const r of perRetrofit) {
    const lifetime = r.retrofit.lifetime_years
    if (!lifetime || lifetime <= 0) continue
    let nextYear = r.retrofit.year + lifetime
    while (nextYear <= startYear + horizonYears) {
      const ti = nextYear - startYear
      if (ti >= 0 && ti < totalYears) {
        replacementCapexByYear[ti] += r.capex
        replacementEmbodiedByYear[ti] += r.embodiedCarbonKg
        replacementCapex += r.capex
        replacementEmbodied += r.embodiedCarbonKg
      }
      nextYear += lifetime
    }
  }

  let npv: number | null = null
  let irr: number | null = null
  let discountedPaybackYears: number | null = null
  if (totalAnnualSavings !== null && perRetrofit.length > 0) {
    const cashflows = new Array<number>(totalYears).fill(0)
    for (const r of perRetrofit) {
      const ti = r.retrofit.year - startYear
      if (ti >= 0 && ti < totalYears) cashflows[ti] -= r.capex
      // Savings start the year after install.
      if (r.annualSavings && r.annualSavings !== 0) {
        for (let t = ti + 1; t < totalYears; t++) {
          const yearsSinceInstall = t - ti - 1
          cashflows[t] += r.annualSavings * Math.pow(1 + escPct / 100, yearsSinceInstall)
        }
      }
    }
    // Replacement capex events
    for (let t = 0; t < totalYears; t++) {
      if (replacementCapexByYear[t] > 0) cashflows[t] -= replacementCapexByYear[t]
    }
    npv = computeNPV(cashflows, discountRatePct)
    irr = computeIRR(cashflows)
    if (totalAnnualSavings > 0 && (totalCapex + replacementCapex) > 0) {
      const annualStream: number[] = []
      for (let t = 1; t < totalYears; t++) annualStream.push(cashflows[t])
      discountedPaybackYears = computeDiscountedPaybackYears(totalCapex + replacementCapex, annualStream, discountRatePct)
    }
  }

  const totalEmbodiedCarbonKg = perRetrofit.reduce((s, r) => s + r.embodiedCarbonKg, 0) + replacementEmbodied

  return {
    perRetrofit, totalCapex, totalAnnualSavings, averagePaybackYears, discountedPaybackYears, currency,
    hasMissingPrices, npv, irr, discountRatePct, horizonYears, totalEmbodiedCarbonKg,
    replacementCapex, replacementEmbodiedCarbonKg: replacementEmbodied,
  }
}

// Re-export for the test file
export { computeNPV, computeIRR, computePaybackYears, computeDiscountedPaybackYears, buildCashflows }
