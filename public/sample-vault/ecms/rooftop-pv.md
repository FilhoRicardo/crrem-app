---
doc_type: ecm
ecm_schema: "1.0"
id: rooftop-pv
name: Rooftop PV Array
category: Renewables
version: "1.0"
license: CC-BY-4.0
summary: On-site solar PV mounted on the building roof. Output is consumed first; surplus exported.
applicability: Buildings with unobstructed roof area and grid export capability. Best on warehouse / retail / industrial.
impacts:
  - carrier: Renew_Consumed
    operation: add
    mode: absolute
    value_low: 30
    value_typical: 60
    value_high: 100
    note: kWh/m² of GIA — varies with roof area and irradiation.
  - carrier: Renew_Exported
    operation: add
    mode: absolute
    value_low: 5
    value_typical: 15
    value_high: 30
    note: Surplus exported to grid.
cost:
  capex_per_kwp_low: 1000
  capex_per_kwp_typical: 1400
  capex_per_kwp_high: 1900
  embodied_carbon_kg_per_m2: 4.0   # ~300 kgCO₂e per kWp installed, distributed over ~75 m²
  currency: USD
payback_years_range: [8, 15]
notes: Inverter replacement at 10–15yr should be reserved as opex. Pair with `renewable_degradation_pct_per_year: 0.5` on the asset for realistic ageing.
---

# Rooftop PV Array

On-site solar generation. Lowers EUI of the building (Renew_Consumed counts toward EUI but has zero EF) and yields a small grid export credit, capped at the building's grid CO₂.
