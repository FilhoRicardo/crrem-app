---
doc_type: ecm
ecm_schema: "1.0"
id: air-source-heat-pump
name: Air-Source Heat Pump (Electrification)
category: HVAC
version: "1.0"
license: CC-BY-4.0
summary: Replace gas, oil, or district-heating boilers with high-COP air-source electric heat pumps.
applicability: Most building types in moderate climates. Requires electrical service upgrade in many cases.
impacts:
  - carrier: Gas
    operation: remove
    mode: absolute
    value_typical: 0
    note: All gas demand removed.
  - carrier: District_Heating
    operation: remove
    mode: absolute
    value_typical: 0
    note: District heating contract terminated.
  - carrier: Elec_Grid
    operation: add
    mode: absolute
    value_low: 25
    value_typical: 35
    value_high: 50
    note: kWh/m² added to grid electricity (assuming COP ~3).
cost:
  capex_per_m2_low: 80
  capex_per_m2_typical: 130
  capex_per_m2_high: 220
  embodied_carbon_kg_per_m2: 9.0    # refrigerants + steel + concrete pads
  currency: USD
payback_years_range: [10, 25]
notes: |
  The single biggest decarbonisation lever for fossil-heated buildings.
  Pair with envelope upgrades to size correctly. Heat pump lifetime ~15yr —
  set `lifetime_years: 15` on the retrofit for replacement modelling.
---

# Air-Source Heat Pump

The big-ticket decarbonisation move for any fossil-heated building. Removes the on-site combustion footprint and shifts demand to the (decarbonising) grid. Apply via ECM library for auto-filled capex + embodied carbon.
