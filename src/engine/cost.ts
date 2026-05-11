import type { Asset, Carrier, Retrofit, EnergyMap } from './types'
import { applyRetrofitsForYear } from './calculate'

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
}

function carriersInDelta(delta: Partial<Record<Carrier, number>>): Carrier[] {
  return (Object.keys(delta) as Carrier[]).filter(c => Math.abs(delta[c] ?? 0) > 1e-6)
}

export function analyseRetrofitCost(
  asset: Pick<Asset, 'energy' | 'utility_prices'>,
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

  let annualSavings: number | null = 0
  const missingPrices: Carrier[] = []
  for (const c of carriersInDelta(energyDelta)) {
    const price = prices?.[c as keyof typeof prices] as number | undefined
    if (typeof price !== 'number') {
      // We have a delta but no price — can't compute opex contribution.
      missingPrices.push(c)
      annualSavings = null
      continue
    }
    if (annualSavings !== null) annualSavings += (energyDelta[c] ?? 0) * price
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
  }
}

export interface ScenarioCostSummary {
  perRetrofit: RetrofitCostAnalysis[]
  totalCapex: number
  totalAnnualSavings: number | null
  averagePaybackYears: number | null
  currency: string | null
  hasMissingPrices: boolean
}

export function analyseScenarioCost(
  asset: Pick<Asset, 'energy' | 'utility_prices'>,
  retrofits: Retrofit[],
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

  return { perRetrofit, totalCapex, totalAnnualSavings, averagePaybackYears, currency, hasMissingPrices }
}
