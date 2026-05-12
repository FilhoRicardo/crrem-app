---
doc_type: asset
asset_schema: "1.0"
id: lichtenberg-tower
name: Lichtenberg Tower
country: Germany
postal_code: "10367"
property_type: Office
gia_m2: 18000
reporting_year: 2024
energy:
  Elec_Grid: 1620000        # 90 kWh/m²/yr — typical Berlin office grid load
  District_Heating: 1980000 # 110 kWh/m²/yr — district heating dominant
  Renew_Consumed: 90000     # rooftop PV consumed on-site
  Renew_Exported: 30000     # surplus export
utility_prices:
  Elec_Grid: 0.34            # German commercial electricity, 2024
  District_Heating: 0.11
  currency: EUR
  escalation_pct_per_year: 3.0
renewable_degradation_pct_per_year: 0.5
climate_scenario: rcp85       # high-emissions scenario — most aggressive HDD/CDD shifts
tags: [office, berlin, eu, full-feature-demo, rcp85]
actuals:
  - year: 2023
    monthly:
      Elec_Grid: [140000, 130000, 138000, 135000, 142000, 145000, 148000, 145000, 138000, 135000, 132000, 137000]
      District_Heating: [340000, 295000, 235000, 165000, 95000, 55000, 38000, 38000, 85000, 175000, 270000, 320000]
      Renew_Consumed: [3000, 5000, 7000, 9000, 11000, 13000, 13000, 12000, 10000, 7000, 4000, 2000]
      Renew_Exported: [1000, 2000, 3000, 4000, 4000, 5000, 5000, 4000, 3000, 1000, 0, 0]
    notes: Pre-deep-retrofit baseline year
  - year: 2024
    monthly:
      Elec_Grid: [135000, 128000, 135000, 130000, 138000, 142000, 145000, 142000, 135000, 132000, 130000, 130000]
      District_Heating: [330000, 285000, 225000, 155000, 88000, 50000, 35000, 35000, 80000, 165000, 260000, 272000]
      Renew_Consumed: [4000, 6000, 8000, 10000, 12000, 14000, 14000, 13000, 11000, 8000, 5000, 3000]
      Renew_Exported: [1000, 2000, 3000, 4000, 5000, 5000, 5000, 4000, 3000, 2000, 0, 0]
    notes: Reporting year — sums to 1.62M Elec, 1.98M DH, 90k Renew_Consumed, 30k Renew_Exported
  - year: 2025
    annual:
      Elec_Grid: 1580000
      District_Heating: 1850000
      Renew_Consumed: 95000
      Renew_Exported: 32000
    notes: 2025 utility report — annual aggregates only
---

# Lichtenberg Tower

A flagship Berlin office building used as the **full-feature showcase** in this vault. Designed to exercise every CRREM-app feature in one place:

- **EU country with bundled HDD/CDD data** — Germany is one of the 30 European countries where the engine can apply climate adjustment
- **`climate_scenario: rcp85`** — uses the high-emissions IPCC RCP 8.5 scenario; the engine will scale projected District_Heating demand DOWN faster than RCP 4.5 (Berlin warming most aggressively under business-as-usual emissions)
- **`renewable_degradation_pct_per_year: 0.5`** — opt-in PV ageing applied to projected years only
- **Postal code `10367`** — Berlin Lichtenberg, falls back to country-level Germany pathway since Germany doesn't have sub-national CRREM regions
- **Multi-year actuals** — 2023 + 2024 monthly grids + 2025 annual aggregate. The engine uses actuals where present and projects baseline + retrofits where not
- **EUR currency with 3% escalation** — future-year savings escalate compoundingly when computing payback / NPV / IRR
- **All four carriers** — Elec_Grid, District_Heating, Renew_Consumed, Renew_Exported (the export-credit cap kicks in)

Pair this asset with the **`lichtenberg-deep-decarb`** scenario to see embodied carbon, retrofit lifetimes, MACC, and sensitivity sliders in action.
