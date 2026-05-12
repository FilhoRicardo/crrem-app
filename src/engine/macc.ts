/**
 * Marginal Abatement Cost Curve (MACC) for a scenario.
 *
 * Each retrofit becomes one bar:
 *   - Width  = annual CO₂ abated (tCO₂/yr) — how much carbon this retrofit removes
 *   - Height = cost per tonne of CO₂ abated (currency / tCO₂)
 *
 * Sorted by cost/tCO₂ ascending — leftmost bars are the cheapest abatement.
 * Negative cost/tCO₂ means the retrofit pays for itself (saves more money than
 * the equivalent annualised capex), shown below the x-axis.
 *
 * Cost-per-tonne formula (annualised, capital recovery convention):
 *   annualised_capex = capex × CRF(discount_rate, lifetime)
 *   net_annual_cost  = annualised_capex − annual_savings
 *   cost_per_tCO2    = net_annual_cost / (annual_CO2_saved_tonnes)
 *
 * Capital Recovery Factor:
 *   CRF(r, n) = r / (1 − (1+r)^-n)         when r > 0
 *             = 1/n                         when r = 0
 */

import type { Asset, EFProvider, Retrofit, Carrier } from './types'
import { applyRetrofitsForYear } from './calculate'
import type { RetrofitCostAnalysis } from './cost'

export interface MACCBar {
  retrofit: Retrofit
  /** Annual CO₂ avoided, tonnes/yr (positive = abatement) */
  annualAbatementTCO2: number
  /** Lifetime in years used for the annualisation (defaults to 15 if unspecified) */
  lifetimeYears: number
  /** Annualised capex in the asset's currency. */
  annualisedCapex: number
  /** Net annual cost: annualisedCapex − annualSavings (negative = profitable). */
  netAnnualCost: number | null
  /** Cost per tonne CO₂ abated (currency / tCO₂). Negative = pays for itself. */
  costPerTCO2: number | null
  /** Currency code for display, when available. */
  currency: string | null
}

export interface MACCResult {
  /** Bars in MACC order — ascending by costPerTCO2 (cheapest abatement first). */
  bars: MACCBar[]
  /** Sum of annualAbatementTCO2 across all bars. */
  totalAbatementTCO2: number
  /** Discount rate (%/yr) used to compute annualised capex. */
  discountRatePct: number
  /** Default lifetime applied to retrofits without lifetime_years set. */
  defaultLifetimeYears: number
}

const CARRIERS_WITH_EF: Carrier[] = [
  'Elec_Grid', 'District_Heating', 'District_Cooling', 'Gas', 'Oil', 'Biomass',
]

function capitalRecoveryFactor(discountRatePct: number, years: number): number {
  if (years <= 0) return 1  // edge case
  const r = discountRatePct / 100
  if (r === 0) return 1 / years
  return r / (1 - Math.pow(1 + r, -years))
}

/**
 * Compute the per-year CO₂ abatement (tonnes) that this retrofit causes,
 * evaluated at its install year using the engine's emission-factor lookup.
 *
 * Mirrors `analyseRetrofitCost`'s before/after construction so the energy
 * delta is identical — but here we multiply by EF to get carbon delta.
 */
function annualAbatementTonnes(
  asset: Pick<Asset, 'energy'>,
  retrofit: Retrofit,
  prior: Retrofit[],
  getEF: EFProvider,
  region: string,
): number {
  const year = retrofit.year
  const before = applyRetrofitsForYear(asset.energy, prior, year)
  const after = applyRetrofitsForYear(asset.energy, [...prior, retrofit], year)
  // Use a no-export-credit comparison since both sides have the same Renew_Exported.
  // Compute Σ (before[c] − after[c]) × EF(c) for emitting carriers only.
  let deltaKg = 0
  for (const c of CARRIERS_WITH_EF) {
    const delta = (before[c] ?? 0) - (after[c] ?? 0)
    if (delta === 0) continue
    deltaKg += delta * getEF(c, region, year)
  }
  return deltaKg / 1000
}

export interface MACCInput {
  asset: Asset
  retrofits: Retrofit[]
  /** Falls back to per-retrofit cost analysis we already computed. */
  perRetrofitCost: RetrofitCostAnalysis[]
  getEF: EFProvider
  region: string
  discountRatePct: number
  /** Used for retrofits without lifetime_years (defaults to 15). */
  defaultLifetimeYears?: number
}

export function buildMACC(input: MACCInput): MACCResult {
  const {
    asset, retrofits, perRetrofitCost, getEF, region,
    discountRatePct, defaultLifetimeYears = 15,
  } = input

  const ordered = [...retrofits].sort((a, b) => a.year - b.year)
  const bars: MACCBar[] = []

  for (let i = 0; i < ordered.length; i++) {
    const r = ordered[i]
    const cost = perRetrofitCost.find(c => c.retrofit.id === r.id)
    if (!cost) continue
    const lifetime = r.lifetime_years ?? defaultLifetimeYears
    const crf = capitalRecoveryFactor(discountRatePct, lifetime)
    const annualisedCapex = cost.capex * crf
    const annualAbatementTCO2 = annualAbatementTonnes(asset, r, ordered.slice(0, i), getEF, region)

    let netAnnualCost: number | null = null
    let costPerTCO2: number | null = null
    if (cost.annualSavings !== null) {
      netAnnualCost = annualisedCapex - cost.annualSavings
      // If abatement is essentially zero, cost/tCO2 is undefined (division-by-zero)
      if (Math.abs(annualAbatementTCO2) > 1e-6) {
        costPerTCO2 = netAnnualCost / annualAbatementTCO2
      }
    }

    bars.push({
      retrofit: r,
      annualAbatementTCO2,
      lifetimeYears: lifetime,
      annualisedCapex,
      netAnnualCost,
      costPerTCO2,
      currency: cost.currency,
    })
  }

  // Sort ascending by costPerTCO2; null values sink to the bottom.
  bars.sort((a, b) => {
    if (a.costPerTCO2 === null && b.costPerTCO2 === null) return 0
    if (a.costPerTCO2 === null) return 1
    if (b.costPerTCO2 === null) return -1
    return a.costPerTCO2 - b.costPerTCO2
  })

  const totalAbatementTCO2 = bars.reduce((s, b) => s + Math.max(0, b.annualAbatementTCO2), 0)

  return { bars, totalAbatementTCO2, discountRatePct, defaultLifetimeYears }
}
