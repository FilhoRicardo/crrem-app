---
doc_type: ecm
ecm_schema: "1.0"
id: chiller-upgrade
name: High-Efficiency Chiller Upgrade
category: HVAC
version: "1.0"
license: CC-BY-4.0
summary: Replace existing centrifugal / scroll chillers with VSD-driven magnetic-bearing chillers. Big efficiency gains.
applicability: Cooling-dominated buildings (shopping centres, data centres, hospitals) in warm climates.
impacts:
  - carrier: District_Cooling
    operation: reduce
    mode: percent
    value_low: 18
    value_typical: 25
    value_high: 35
  - carrier: Elec_Grid
    operation: add
    mode: absolute
    value_typical: 2
    note: Slight pump-power increase from VSD secondary loops.
cost:
  capex_per_m2_low: 35
  capex_per_m2_typical: 50
  capex_per_m2_high: 80
  embodied_carbon_kg_per_m2: 4.0
  currency: USD
payback_years_range: [8, 15]
notes: Best in cooling-led climates (HK, Singapore, Sydney). Lifetime ~20yr. Often paired with a BMS upgrade so the chiller plant is run to its efficiency curve.
---

# High-Efficiency Chiller Upgrade

The big cooling lever for retail / hospitality / healthcare in warm climates. Magnetic-bearing chillers + VSD condenser pumps deliver 25–35% reductions on cooling load.
