---
doc_type: asset
asset_schema: "1.0"
id: pacific-plaza-mall
name: Pacific Plaza Mall
country: Hong Kong
property_type: Shopping Center
gia_m2: 22000
reporting_year: 2024
energy:
  Elec_Grid: 2800000
  Gas: 320000
  District_Cooling: 2000000
utility_prices:
  Elec_Grid: 0.21
  Gas: 0.08
  District_Cooling: 0.05
  currency: HKD
  escalation_pct_per_year: 3.0
tags: [crrem-fixture, A-002, retail, hong-kong]
actuals:
  - year: 2024
    monthly:
      Elec_Grid: [220000, 200000, 230000, 240000, 260000, 280000, 290000, 285000, 260000, 240000, 220000, 230000]
      District_Cooling: [80000, 70000, 110000, 150000, 220000, 260000, 280000, 280000, 230000, 170000, 100000, 70000]
      Gas: [38000, 32000, 28000, 22000, 18000, 18000, 18000, 18000, 22000, 28000, 36000, 42000]
    notes: Reporting year — annual sums match fixture (2.8M Elec, 320k Gas, 2M DC)
---

# Pacific Plaza Mall

CRREM worked example **A-002** — large shopping centre in Hong Kong with district cooling, gas-fired heating, and significant grid electricity load. Reproduces the published fixture exactly: CI 2024 = 106.62 kgCO₂e/m², misalignment year 2036 under the Hong Kong Shopping Center pathway.

Demonstrates:
- Hong Kong country-level pathway resolution (no postal-code lookup for HK)
- Multi-carrier asset with cooling-dominated summer + heating-dominated winter monthly profile
- HKD currency with 3%/yr escalation
