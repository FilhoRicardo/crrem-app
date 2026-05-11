import type { Asset, Scenario } from './types'
import { calculateYearMetrics, blendPathway, projectTrajectory, findMisalignmentYear, actualForYear } from './calculate'
import { efProvider, pathwayProvider } from './providers'
import { splitForAsset, regionForAsset } from '../vault/loader'

export interface AssetSummary {
  ci: number
  pathway: number
  stranded: boolean
  misalignmentYear: number | null
  /** Total capex across all retrofits in the supplied scenario (if any). */
  scenarioCapex: number
}

/**
 * Quick per-asset numbers for sidebars / tables.
 * Uses the asset's reporting year for "now" CI, and projects 2024–2050 for the
 * misalignment year using either the supplied scenario or an empty (do-nothing) one.
 */
export function summariseAsset(asset: Asset, scenario?: Scenario): AssetSummary {
  const region = regionForAsset(asset)
  const split = splitForAsset(asset)
  const now = asset.reporting_year

  // Use measured actual for the reporting year if we have one.
  const energyNow = actualForYear(asset.actuals, now) ?? asset.energy
  const m = calculateYearMetrics(energyNow, asset.gia_m2, efProvider, region, now)
  const pw = blendPathway(pathwayProvider, region, split, now)

  const trajectory = projectTrajectory({
    baseEnergy: asset.energy,
    gia: asset.gia_m2,
    getEF: efProvider,
    getPathway: pathwayProvider,
    region,
    split,
    retrofits: scenario?.retrofits ?? [],
    startYear: 2024,
    endYear: 2050,
    getActual: (year) => actualForYear(asset.actuals, year),
  })
  const misalignmentYear = findMisalignmentYear(trajectory).co2

  const scenarioCapex = (scenario?.retrofits ?? [])
    .reduce((s, r) => s + (r.cost?.capex_total ?? 0), 0)

  return {
    ci: m.carbon_intensity_kgco2e_m2,
    pathway: pw.carbon_kgco2e_m2,
    stranded: m.carbon_intensity_kgco2e_m2 > pw.carbon_kgco2e_m2,
    misalignmentYear,
    scenarioCapex,
  }
}

const FLAG: Record<string, string> = {
  USA: '🇺🇸', 'United States': '🇺🇸',
  'Hong Kong': '🇭🇰', HK: '🇭🇰',
  'United Kingdom': '🇬🇧', UK: '🇬🇧',
  Australia: '🇦🇺', AU: '🇦🇺',
  Germany: '🇩🇪', France: '🇫🇷', Netherlands: '🇳🇱', Spain: '🇪🇸',
  Italy: '🇮🇹', Canada: '🇨🇦', Japan: '🇯🇵', Singapore: '🇸🇬',
}

export const flagForCountry = (country: string): string => FLAG[country] ?? '🏢'
