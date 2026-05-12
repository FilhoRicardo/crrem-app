---
doc_type: ecm
ecm_schema: "1.0"
id: smart-metering
name: Smart Sub-Metering
category: Metering
version: "1.0"
license: CC-BY-4.0
summary: Granular sub-metering of HVAC, lighting, plug loads, and tenant areas. Enables targeted optimisation.
applicability: Any building with a single utility meter and >5,000 m² GIA.
impacts:
  - carrier: Elec_Grid
    operation: reduce
    mode: percent
    value_low: 1
    value_typical: 3
    value_high: 5
    note: Behavioural / targeted-investment savings unlocked by visibility. Modest first-order, large second-order.
cost:
  capex_per_m2_low: 1
  capex_per_m2_typical: 2
  capex_per_m2_high: 4
  embodied_carbon_kg_per_m2: 0.06
  currency: USD
payback_years_range: [3, 8]
notes: Direct savings small, but enables identification of waste hotspots and informed prioritisation of subsequent retrofits. Lifetime ~15yr.
---

# Smart Sub-Metering

The "you can't manage what you can't measure" intervention. Direct first-order savings are modest, but the visibility unlocks all subsequent retrofit work. Plus essential for verifying that other retrofits actually delivered the expected savings.
