---
doc_type: asset
asset_schema: "1.0"
id: midtown-tower
name: Midtown Tower
country: USA
postal_code: "10005"
property_type: Office
gia_m2: 7500
reporting_year: 2024
energy:
  Elec_Grid: 850000
  District_Heating: 680000
utility_prices:
  Elec_Grid: 0.18
  District_Heating: 0.06
  currency: USD
  escalation_pct_per_year: 2.5
tags: [crrem-fixture, A-001, office, manhattan]
actuals:
  - year: 2023
    monthly:
      Elec_Grid: [72000, 67000, 71000, 68000, 74000, 79000, 81000, 80000, 74000, 70000, 66000, 71000]
      District_Heating: [115000, 95000, 75000, 48000, 28000, 18000, 14000, 14000, 28000, 58000, 88000, 108000]
    notes: First year of metering — pre-LED retrofit baseline
  - year: 2024
    monthly:
      Elec_Grid: [70000, 65000, 72000, 68000, 75000, 80000, 82000, 81000, 75000, 70000, 65000, 70000]
      District_Heating: [120000, 100000, 80000, 50000, 30000, 20000, 15000, 15000, 30000, 60000, 90000, 110000]
    notes: Reporting year — matches CRREM A-001 fixture (annual sums = 850k Elec, 680k DH)
  - year: 2025
    monthly:
      # Partial year — only Q1 readings recorded so far
      Elec_Grid: [68000, 64000, 70000, null, null, null, null, null, null, null, null, null]
      District_Heating: [118000, 98000, 78000, null, null, null, null, null, null, null, null, null]
    notes: Q1 2025 readings — partial year, will fill as meters report
---

# Midtown Tower

CRREM worked example **A-001** — sample office asset in lower Manhattan. Reproduces the published fixture exactly: CI 2024 = 45.39 kgCO₂e/m², stranded from 2024 onward under the NYSTc_Mixed mild_4A pathway.

This asset is the most thoroughly instrumented in the sample vault — it has:

- 2 full years of monthly meter readings (2023 + 2024) plus partial Q1 2025
- Utility prices in USD with 2.5% annual escalation
- Postal code resolution to the NYSTc CRREM region
- Three scenarios (do nothing / LED only / LED + heat pump / deep retrofit) showing branching, lifetimes, embodied carbon, and ECM auto-fill
