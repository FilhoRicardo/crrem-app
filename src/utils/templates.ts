/**
 * Markdown templates for vault entities. Users download these as a starting
 * point for handcrafting their own files in any text editor (Obsidian-friendly).
 *
 * Each template includes inline comments explaining required vs optional fields,
 * locked schemas (asset_schema "1.0", ecm_schema "1.0", etc.), and the CRREM
 * carrier vocabulary.
 */

export const ASSET_TEMPLATE = `---
doc_type: asset
asset_schema: "1.0"

# Required
id: my-building              # unique slug, e.g. midtown-tower
name: My Building            # display name
country: USA                 # CRREM country (e.g. USA, United Kingdom, Hong Kong, Australia, Germany, ...)
property_type: Office        # CRREM property type (Office | Shopping Center | Retail High Street |
                             # Hotel | Residential | Mixed Use | Distribution Warehouse Warm | ...)
gia_m2: 5000                 # Gross Internal Area, m². Whole-building, excluding indoor parking.
reporting_year: 2024         # Year the energy data refers to

energy:                      # kWh/yr per CRREM carrier. Omit any carrier with 0 demand.
  Elec_Grid: 500000          # Grid-supplied electricity
  # District_Heating: 0
  # District_Cooling: 0
  # Gas: 0
  # Oil: 0
  # Biomass: 0
  # Other_Fuels: 0
  # Renew_Consumed: 0        # On-site renewables consumed on-site (counts toward EUI; EF = 0)
  # Renew_Exported: 0        # On-site renewables exported to grid (export credit, capped)

# Optional
postal_code: "10005"         # USA / Canada / Australia → resolves sub-national CRREM region
region: USA-NY               # Override CRREM region directly (skips postal-code lookup)

mixed_use_split:             # Required only when property_type is "Mixed Use"
  - propertyType: Office
    fraction: 0.65
  - propertyType: Retail High Street
    fraction: 0.35

utility_prices:              # Used to compute opex savings / payback for retrofits
  Elec_Grid: 0.18
  Gas: 0.06
  currency: USD

tags: [office, sample]

# Optional — measured monthly meter readings.
# Per CRREM, when actuals exist for a year they replace the projected baseline
# for that year. Months can be null when not yet read.
actuals:
  - year: 2024
    monthly:
      # 12 values, Jan through Dec
      Elec_Grid:        [70000, 65000, 72000, 68000, 75000, 80000, 82000, 81000, 75000, 70000, 65000, 70000]
      District_Heating: [120000, 100000, 80000, 50000, 30000, 20000, 15000, 15000, 30000, 60000, 90000, 110000]
    notes: First full year of metering
  - year: 2025
    annual:                 # Annual fallback when monthly isn't available
      Elec_Grid: 870000
      District_Heating: 690000
---

# My Building

Free-form notes about this asset go here. Visible in Obsidian, ignored by the calc engine.
`

export const SCENARIO_TEMPLATE = `---
doc_type: scenario
scenario_schema: "1.0"

id: my-scenario              # unique within the vault
name: LED + Heat Pump        # display name
asset_id: my-building        # MUST match an asset id in assets/

# Optional — provenance only, not used in calculations.
parent_scenario_id: my-scenario-do-nothing

retrofits:
  - id: r-led-2026
    year: 2026               # Year the retrofit is active from
    name: LED Lighting Retrofit
    ecm_id: led-lighting-upgrade   # Optional — reference to an ECM in ecms/
    impacts:
      - carrier: Elec_Grid
        operation: reduce            # reduce | add | remove
        mode: percent                # percent | absolute  (ignored when operation is 'remove')
        value: 18                    # 18 means -18%; or kWh/yr if mode is 'absolute'
    cost:
      capex_total: 450000
      currency: USD

  - id: r-heatpump-2028
    year: 2028
    name: Replace gas boilers with heat pumps
    impacts:
      - carrier: Gas
        operation: remove
        mode: absolute
        value: 0
      - carrier: Elec_Grid
        operation: add
        mode: absolute
        value: 200000
    cost:
      capex_total: 1200000
      currency: USD
---

# LED + Heat Pump scenario

Notes about why this combination of retrofits.
`

export const ECM_TEMPLATE = `---
doc_type: ecm
ecm_schema: "1.0"

id: my-ecm
name: My Energy Conservation Measure
category: HVAC               # Lighting | HVAC | Controls | Envelope | Renewables | Metering | Other
version: "1.0"
license: CC-BY-4.0           # Default — community-shareable
summary: One-line description of what this ECM does.
applicability: Where this ECM makes sense (property types, climate, building age, etc.)

impacts:
  - carrier: Elec_Grid       # CRREM carrier
    operation: reduce        # reduce | add | remove
    mode: percent            # percent | absolute  (ignored for 'remove')
    value_low: 8             # Optional — low end of typical impact range
    value_typical: 15        # Required — used by default when applied to a scenario
    value_high: 25           # Optional — high end of typical impact range
    note: Optional explanation of the impact assumption.

cost:
  capex_per_m2_low: 10
  capex_per_m2_typical: 15
  capex_per_m2_high: 25
  currency: USD
  # Use capex_per_kwp_* instead for renewables-style sizing.

payback_years_range: [3, 7]
notes: |
  Free-form prose about the ECM. Implementation tips, vendor links, etc.
---

# My ECM

Detailed write-up. Visible in Obsidian, ignored by the calc engine.
`

export const PORTFOLIO_TEMPLATE = `---
doc_type: portfolio
portfolio_schema: "1.0"

id: my-portfolio
name: My Portfolio
asset_ids:
  - my-building              # IDs of assets in assets/
  # - other-building
weighting: gia               # Only "gia" supported in v1

# Optional — pin a specific scenario per asset for portfolio rollup.
# Otherwise the first scenario for each asset is used.
scenario_overrides:
  my-building: my-scenario
---

# My Portfolio

Notes about this portfolio.
`

export const TEMPLATES = {
  asset: { filename: 'asset-template.md', content: ASSET_TEMPLATE, label: 'Asset' },
  scenario: { filename: 'scenario-template.md', content: SCENARIO_TEMPLATE, label: 'Scenario' },
  ecm: { filename: 'ecm-template.md', content: ECM_TEMPLATE, label: 'ECM' },
  portfolio: { filename: 'portfolio-template.md', content: PORTFOLIO_TEMPLATE, label: 'Portfolio' },
} as const

export type TemplateKey = keyof typeof TEMPLATES
