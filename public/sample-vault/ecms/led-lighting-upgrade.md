---
doc_type: ecm
ecm_schema: "1.0"
id: led-lighting-upgrade
name: LED Lighting Upgrade
category: Lighting
version: "1.0"
license: CC-BY-4.0
summary: Full-building LED retrofit. Replace fluorescent and halogen with LED throughout.
applicability: All property types with significant artificial-lighting load.
impacts:
  - carrier: Elec_Grid
    operation: reduce
    mode: percent
    value_low: 12
    value_typical: 18
    value_high: 25
    note: Depends on existing lamp stock and operating hours.
cost:
  capex_per_m2_low: 12
  capex_per_m2_typical: 16
  capex_per_m2_high: 22
  currency: USD
payback_years_range: [3, 7]
notes: Savings highly dependent on hours of use. Consider DALI/dimming integration for office contexts.
---

# LED Lighting Upgrade

Full-building LED retrofit. Typically reduces grid electricity by 15–20% depending on existing lamp stock and operational hours.
