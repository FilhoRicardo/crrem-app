---
doc_type: ecm
ecm_schema: "1.0"
id: led-lighting-upgrade
name: LED Lighting Upgrade
category: Lighting
version: "1.0"
license: CC-BY-4.0
summary: Full-building LED retrofit. Replace fluorescent and halogen with LED throughout, with optional DALI dimming.
applicability: All property types with significant artificial-lighting load (Office, Retail, Healthcare, Hotel).
impacts:
  - carrier: Elec_Grid
    operation: reduce
    mode: percent
    value_low: 12
    value_typical: 18
    value_high: 25
    note: 18% typical for office occupancy. With DALI + presence detection, value_high (25%) achievable.
cost:
  capex_per_m2_low: 12
  capex_per_m2_typical: 16
  capex_per_m2_high: 22
  embodied_carbon_kg_per_m2: 1.0
  currency: USD
payback_years_range: [3, 7]
notes: Savings highly dependent on hours of use. Consider DALI/dimming integration for office contexts. Apply via the ECM Library to auto-fill capex + embodied based on asset GIA.
---

# LED Lighting Upgrade

Full-building LED retrofit — typically 15–20% reduction on grid electricity for office occupancy. With dimming integration (DALI / presence detection), high end of 25% is achievable.

When applied via **Apply to year…** in the ECM Library, capex and embodied carbon auto-fill from `capex_per_m2_typical × asset.gia_m2` and `embodied_carbon_kg_per_m2 × asset.gia_m2`.
