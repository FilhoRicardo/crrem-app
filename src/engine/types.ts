/** All recognised CRREM energy carriers. */
export type Carrier =
  | 'Elec_Grid'
  | 'District_Heating'
  | 'District_Cooling'
  | 'Gas'
  | 'Oil'
  | 'Biomass'
  | 'Other_Fuels'
  | 'Renew_Consumed'
  | 'Renew_Exported'

/** kWh/yr per carrier. Omitted carriers are treated as 0. */
export type EnergyMap = Partial<Record<Carrier, number>>

export interface RetrofitImpact {
  carrier: Carrier
  operation: 'reduce' | 'remove' | 'add'
  /** 'percent': value is 0–100. 'absolute': value is kWh/yr. Ignored for 'remove'. */
  mode: 'percent' | 'absolute'
  value: number
  note?: string
}

export interface RetrofitCost {
  capex_total?: number
  capex_per_m2?: number
  capex_per_kwp?: number
  currency?: string
}

export interface Retrofit {
  id: string
  /** First year this retrofit is active (inclusive). */
  year: number
  name: string
  ecm_id?: string
  impacts: RetrofitImpact[]
  cost?: RetrofitCost
}

/** Per-year calculation output. */
export interface YearMetrics {
  year: number
  energy_kwh: EnergyMap
  total_energy_kwh: number
  eui_kwh_m2: number
  gross_co2_kg: number
  export_credit_kg: number
  net_co2_kg: number
  carbon_intensity_kgco2e_m2: number
}

export interface PathwayPoint {
  carbon_kgco2e_m2: number
  eui_kwh_m2: number
}

export interface TrajectoryPoint {
  year: number
  metrics: YearMetrics
  pathway: PathwayPoint
  misaligned_co2: boolean
  misaligned_eui: boolean
}

export interface MixedUseSplit {
  propertyType: string
  /** Share of GIA, 0–1. All fractions must sum to 1. */
  fraction: number
}

/** Returns kgCO₂e/kWh for a carrier in a region for a given year. */
export type EFProvider = (carrier: Carrier, region: string, year: number) => number

/** Returns the CRREM CO₂ and EUI pathway budgets for region × property type × year. */
export type PathwayProvider = (region: string, propertyType: string, year: number) => PathwayPoint

export interface ProjectTrajectoryInput {
  baseEnergy: EnergyMap
  gia: number
  getEF: EFProvider
  getPathway: PathwayProvider
  region: string
  /** Single item for single-use; multiple items for mixed-use. Fractions must sum to 1. */
  split: MixedUseSplit[]
  retrofits: Retrofit[]
  startYear: number
  endYear: number
}

// ────────────────────────────────────────────────────────────────────────────
// Vault domain types (loaded from .md frontmatter)
// ────────────────────────────────────────────────────────────────────────────

export interface UtilityPrices {
  Elec_Grid?: number
  Gas?: number
  Oil?: number
  District_Heating?: number
  District_Cooling?: number
  Biomass?: number
  Other_Fuels?: number
  currency?: string
}

export interface Asset {
  id: string
  name: string
  country: string
  property_type: string
  gia_m2: number
  reporting_year: number
  energy: EnergyMap
  postal_code?: string
  region?: string
  mixed_use_split?: MixedUseSplit[]
  utility_prices?: UtilityPrices
  tags?: string[]
  body?: string
}

export interface Scenario {
  id: string
  name: string
  asset_id: string
  parent_scenario_id?: string
  retrofits: Retrofit[]
  body?: string
}

export interface ECMImpact extends Omit<RetrofitImpact, 'value'> {
  value_low?: number
  value_typical: number
  value_high?: number
}

export interface ECM {
  id: string
  name: string
  category: string
  version?: string
  license?: string
  summary?: string
  applicability?: string
  impacts: ECMImpact[]
  cost?: RetrofitCost & {
    capex_per_m2_low?: number
    capex_per_m2_typical?: number
    capex_per_m2_high?: number
    capex_per_kwp_low?: number
    capex_per_kwp_typical?: number
    capex_per_kwp_high?: number
  }
  payback_years_range?: [number, number]
  notes?: string
  body?: string
}

export interface Portfolio {
  id: string
  name: string
  asset_ids: string[]
  weighting: 'gia'
  scenario_overrides?: Record<string, string>
  body?: string
}
