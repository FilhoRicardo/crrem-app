import type {
  Carrier, EnergyMap, Retrofit, MixedUseSplit, YearActual,
  YearMetrics, PathwayPoint, TrajectoryPoint,
  EFProvider, PathwayProvider, ProjectTrajectoryInput,
} from './types'

// Carriers that have an EF and contribute to gross CO₂.
// Renew_Consumed always has EF=0; Renew_Exported is not in Total_Energy.
const EMITTING_CARRIERS: Carrier[] = [
  'Elec_Grid', 'District_Heating', 'District_Cooling', 'Gas', 'Oil', 'Biomass',
]

/**
 * Apply all retrofits active in `year` (retrofit.year <= year) to an energy map.
 * Applied in chronological order so effects compound correctly.
 */
export function applyRetrofitsForYear(
  energy: EnergyMap,
  retrofits: Retrofit[],
  year: number,
): EnergyMap {
  const active = retrofits
    .filter(r => r.year <= year)
    .sort((a, b) => a.year - b.year)

  let e: EnergyMap = { ...energy }
  for (const retrofit of active) {
    for (const impact of retrofit.impacts) {
      const cur = e[impact.carrier] ?? 0
      if (impact.operation === 'remove') {
        e[impact.carrier] = 0
      } else if (impact.operation === 'reduce') {
        e[impact.carrier] = impact.mode === 'percent'
          ? cur * (1 - impact.value / 100)
          : Math.max(0, cur - impact.value)
      } else {
        // add
        e[impact.carrier] = impact.mode === 'percent'
          ? cur * (1 + impact.value / 100)
          : cur + impact.value
      }
    }
  }
  return e
}

/**
 * Calculate per-year energy and carbon metrics for an asset.
 *
 * CRREM rules:
 * - Total energy = emitting carriers + Renew_Consumed (excludes Renew_Exported)
 * - EUI = Total_energy / GIA
 * - Renew_Consumed contributes to EUI but has EF = 0
 * - Export credit = MIN(Renew_Exported × EF_Elec, Elec_Grid × EF_Elec)
 * - Net CO₂ = gross CO₂ − export credit
 */
export function calculateYearMetrics(
  energy: EnergyMap,
  gia: number,
  getEF: EFProvider,
  region: string,
  year: number,
): YearMetrics {
  // Step 2: Total energy
  let totalEnergy = 0
  for (const c of EMITTING_CARRIERS) totalEnergy += energy[c] ?? 0
  totalEnergy += energy.Renew_Consumed ?? 0
  const eui = totalEnergy / gia

  // Step 4: Gross CO₂ (Renew_Consumed EF=0, Renew_Exported not included)
  let grossCO2 = 0
  for (const c of EMITTING_CARRIERS) {
    const kwh = energy[c] ?? 0
    if (kwh > 0) grossCO2 += kwh * getEF(c, region, year)
  }

  // Export credit — capped at grid electricity CO₂ (cannot offset non-electric fuels)
  const efElec = getEF('Elec_Grid', region, year)
  const exportCredit = Math.min(
    (energy.Renew_Exported ?? 0) * efElec,
    (energy.Elec_Grid ?? 0) * efElec,
  )

  const netCO2 = grossCO2 - exportCredit

  return {
    year,
    energy_kwh: { ...energy },
    total_energy_kwh: totalEnergy,
    eui_kwh_m2: eui,
    gross_co2_kg: grossCO2,
    export_credit_kg: exportCredit,
    net_co2_kg: netCO2,
    carbon_intensity_kgco2e_m2: netCO2 / gia,
  }
}

/**
 * GIA-weighted blend of multiple CRREM pathways for mixed-use assets.
 * Applied year-by-year — never a single static blended row.
 */
export function blendPathway(
  getPathway: PathwayProvider,
  region: string,
  split: MixedUseSplit[],
  year: number,
): PathwayPoint {
  let carbon = 0
  let eui = 0
  for (const { propertyType, fraction } of split) {
    const p = getPathway(region, propertyType, year)
    carbon += p.carbon_kgco2e_m2 * fraction
    eui += p.eui_kwh_m2 * fraction
  }
  return { carbon_kgco2e_m2: carbon, eui_kwh_m2: eui }
}

/**
 * Project an asset's trajectory from startYear to endYear.
 * Energy demand stays flat year-over-year; grid EFs decline via getEF.
 * Retrofits modify carriers from their activation year onward.
 *
 * If `getActual(year)` returns a non-null EnergyMap, that map replaces the
 * projected baseline+retrofits for that year (per CRREM methodology — actuals
 * always supersede projection where measured data exists).
 */
export function projectTrajectory(input: ProjectTrajectoryInput): TrajectoryPoint[] {
  const { baseEnergy, gia, getEF, getPathway, region, split, retrofits, startYear, endYear, getActual } = input
  const points: TrajectoryPoint[] = []

  for (let year = startYear; year <= endYear; year++) {
    const actual = getActual?.(year) ?? null
    const energy = actual ?? applyRetrofitsForYear(baseEnergy, retrofits, year)
    const metrics = calculateYearMetrics(energy, gia, getEF, region, year)
    const pathway = blendPathway(getPathway, region, split, year)

    points.push({
      year,
      metrics,
      pathway,
      misaligned_co2: metrics.carbon_intensity_kgco2e_m2 > pathway.carbon_kgco2e_m2,
      misaligned_eui: metrics.eui_kwh_m2 > pathway.eui_kwh_m2,
      is_actual: actual !== null,
    })
  }
  return points
}

/** Sum monthly readings (12 values jan-dec, possibly with nulls) to an annual EnergyMap. */
export function annualFromMonthly(monthly: YearActual['monthly']): EnergyMap {
  const out: EnergyMap = {}
  if (!monthly) return out
  for (const carrier of Object.keys(monthly) as Carrier[]) {
    const vals = monthly[carrier]
    if (!Array.isArray(vals)) continue
    let total = 0
    for (const v of vals) total += typeof v === 'number' ? v : 0
    if (total > 0) out[carrier] = total
  }
  return out
}

/**
 * Resolve a measured EnergyMap for `year` from an asset's actuals array.
 * Prefers monthly when present; falls back to the annual aggregate.
 * Returns null when no actuals exist for that year.
 */
export function actualForYear(actuals: YearActual[] | undefined, year: number): EnergyMap | null {
  if (!actuals) return null
  const a = actuals.find(x => x.year === year)
  if (!a) return null
  if (a.monthly) {
    const m = annualFromMonthly(a.monthly)
    if (Object.keys(m).length > 0) return m
  }
  if (a.annual && Object.keys(a.annual).length > 0) return a.annual
  return null
}

/**
 * First year where asset CI > pathway budget.
 * Returns null if the asset stays within budget through the entire trajectory.
 */
export function findMisalignmentYear(trajectory: TrajectoryPoint[]): {
  co2: number | null
  eui: number | null
} {
  return {
    co2: trajectory.find(p => p.misaligned_co2)?.year ?? null,
    eui: trajectory.find(p => p.misaligned_eui)?.year ?? null,
  }
}

/**
 * GIA-weighted portfolio rollup for a single year.
 */
export function portfolioMetrics(
  assets: Array<{ gia: number; metrics: YearMetrics; pathway: PathwayPoint }>,
): { eui_kwh_m2: number; carbon_intensity_kgco2e_m2: number; pathway: PathwayPoint } {
  const totalGia = assets.reduce((s, a) => s + a.gia, 0)
  let eui = 0, ci = 0, pathCO2 = 0, pathEUI = 0
  for (const { gia, metrics, pathway } of assets) {
    const w = gia / totalGia
    eui += metrics.eui_kwh_m2 * w
    ci += metrics.carbon_intensity_kgco2e_m2 * w
    pathCO2 += pathway.carbon_kgco2e_m2 * w
    pathEUI += pathway.eui_kwh_m2 * w
  }
  return {
    eui_kwh_m2: eui,
    carbon_intensity_kgco2e_m2: ci,
    pathway: { carbon_kgco2e_m2: pathCO2, eui_kwh_m2: pathEUI },
  }
}
