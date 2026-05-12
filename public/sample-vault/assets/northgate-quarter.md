---
doc_type: asset
asset_schema: "1.0"
id: northgate-quarter
name: Northgate Quarter
country: United Kingdom
postal_code: "EC1A"
property_type: Mixed Use
gia_m2: 12000
reporting_year: 2024
mixed_use_split:
  - propertyType: Office
    fraction: 0.65
  - propertyType: Retail High Street
    fraction: 0.35
energy:
  Elec_Grid: 1100000
  Gas: 480000
  Renew_Consumed: 120000
  Renew_Exported: 60000
utility_prices:
  Elec_Grid: 0.32
  Gas: 0.07
  currency: GBP
  escalation_pct_per_year: 2.0
renewable_degradation_pct_per_year: 0.5
climate_scenario: rcp45
tags: [crrem-fixture, A-003, mixed-use, london, eu]
actuals:
  - year: 2024
    monthly:
      Elec_Grid: [95000, 88000, 92000, 88000, 92000, 95000, 100000, 98000, 90000, 88000, 87000, 87000]
      Gas: [80000, 70000, 55000, 35000, 20000, 12000, 10000, 10000, 18000, 38000, 60000, 72000]
      Renew_Consumed: [4000, 6000, 9000, 12000, 14000, 16000, 16000, 15000, 13000, 8000, 4000, 3000]
      Renew_Exported: [2000, 3000, 5000, 7000, 8000, 9000, 9000, 8000, 6000, 2000, 1000, 0]
    notes: Reporting year — sums to 1.1M Elec, 480k Gas, 120k Renew_Consumed, 60k Renew_Exported (matches A-003 fixture)
  - year: 2025
    annual:
      Elec_Grid: 1080000
      Gas: 460000
      Renew_Consumed: 125000
      Renew_Exported: 62000
    notes: 2025 only available as annual aggregate from utility report
---

# Northgate Quarter

CRREM worked example **A-003** — London mixed-use building blending 65% Office and 35% Retail High Street pathways. CI 2024 = 20.20 kgCO₂e/m², misalignment year 2036.

Showcases the most CRREM-feature-rich combination in the vault:

- **Mixed-use blend** — engine multiplies Office and Retail High Street pathway curves by their GIA fractions and sums them year-by-year
- **On-site PV** — 120 MWh consumed on-site (counts toward EUI but EF=0) plus 60 MWh exported with grid-credit cap
- **Renewable degradation** — `renewable_degradation_pct_per_year: 0.5` applies a 0.995^t factor to PV output in projected years (actuals stay measured truth)
- **Climate adjustment** — `climate_scenario: rcp45` scales projected gas demand down via the RCP 4.5 HDD growth path (warmer London → less heating)
- **Mix of monthly + annual actuals** — 2024 has full monthly granularity, 2025 falls back to annual aggregates from the utility report
