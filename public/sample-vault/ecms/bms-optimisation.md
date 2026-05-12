---
doc_type: ecm
ecm_schema: "1.0"
id: bms-optimisation
name: BMS Optimisation + Setpoint Tuning
category: Controls
version: "1.0"
license: CC-BY-4.0
summary: Re-commission building management system. Tighten setpoints, schedule HVAC properly, fix faulty sensors.
applicability: Any building with a BMS that hasn't been re-commissioned in 5+ years.
impacts:
  - carrier: Elec_Grid
    operation: reduce
    mode: percent
    value_low: 5
    value_typical: 8
    value_high: 12
  - carrier: Gas
    operation: reduce
    mode: percent
    value_low: 4
    value_typical: 6
    value_high: 10
cost:
  capex_per_m2_low: 4
  capex_per_m2_typical: 8
  capex_per_m2_high: 15
  embodied_carbon_kg_per_m2: 0.2   # negligible — software work + a few sensors
  currency: USD
payback_years_range: [1, 3]
notes: Cheapest dollar-per-tonne CO₂ on most assets. Almost always the first move on a MACC chart. Lifetime ~12yr (BMS firmware + sensor replacement cycle).
---

# BMS Optimisation

The cheapest abatement option in most buildings. Re-commission the BMS, fix faulty sensors, tighten setpoints, schedule HVAC properly. Negligible embodied carbon, fast payback. Always near the bottom of a MACC ranking.
