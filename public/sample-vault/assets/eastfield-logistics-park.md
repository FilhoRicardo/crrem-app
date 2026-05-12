---
doc_type: asset
asset_schema: "1.0"
id: eastfield-logistics-park
name: Eastfield Logistics Park
country: Australia
postal_code: "2170"
property_type: Distribution Warehouse Warm
gia_m2: 15000
reporting_year: 2024
energy:
  Elec_Grid: 1400000
  Renew_Consumed: 280000
  Renew_Exported: 180000
utility_prices:
  Elec_Grid: 0.28
  currency: AUD
  escalation_pct_per_year: 2.5
renewable_degradation_pct_per_year: 0.5
tags: [crrem-fixture, A-004, logistics, warehouse, australia]
actuals:
  - year: 2024
    monthly:
      Elec_Grid: [125000, 115000, 118000, 110000, 108000, 105000, 108000, 110000, 115000, 120000, 125000, 141000]
      Renew_Consumed: [28000, 25000, 22000, 20000, 18000, 16000, 17000, 19000, 22000, 25000, 28000, 40000]
      Renew_Exported: [22000, 18000, 15000, 13000, 12000, 10000, 11000, 13000, 15000, 18000, 14000, 19000]
    notes: Reporting year — annual sums match A-004 fixture (1.4M Elec, 280k consumed, 180k exported)
---

# Eastfield Logistics Park

CRREM worked example **A-004** — all-electric distribution warehouse near Sydney with significant rooftop PV (180 MWh exported, capped at grid CO₂ for credit). Reproduces published fixture: CI 2024 = 53.68 kgCO₂e/m², misalignment year 2028 under the AUS6 (NCC Climate Zone 6) pathway.

Demonstrates:
- Australian postal-code (2170) → AUS6 sub-national CRREM pathway resolution
- All-electric building with PV degradation modelling (-0.5%/yr)
- Export-credit capping (Renew_Exported × EF_Elec capped at Elec_Grid × EF_Elec)
