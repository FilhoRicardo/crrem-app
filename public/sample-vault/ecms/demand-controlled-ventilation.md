---
doc_type: ecm
ecm_schema: "1.0"
id: demand-controlled-ventilation
name: Demand-Controlled Ventilation + VSD Fans
category: Controls
version: "1.0"
license: CC-BY-4.0
summary: CO₂-sensor-driven ventilation control + variable-speed drives on AHU fans. Big fan-energy savings.
applicability: Office, education, healthcare. Any building where occupancy varies through the day.
impacts:
  - carrier: Elec_Grid
    operation: reduce
    mode: percent
    value_low: 4
    value_typical: 6
    value_high: 10
  - carrier: District_Heating
    operation: reduce
    mode: percent
    value_low: 5
    value_typical: 8
    value_high: 12
cost:
  capex_per_m2_low: 8
  capex_per_m2_typical: 14
  capex_per_m2_high: 20
  embodied_carbon_kg_per_m2: 0.5
  currency: USD
payback_years_range: [3, 7]
notes: Specifically targets fan + reheat energy. Often combined with BMS optimisation. Lifetime ~12yr.
---

# Demand-Controlled Ventilation + VSD Fans

CO₂-sensor-driven outside-air control + variable-speed drives on AHUs. Reduces fan energy and avoids over-ventilating (which then needs reheating). Strong ROI in offices with intermittent occupancy.
