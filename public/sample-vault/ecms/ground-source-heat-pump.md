---
doc_type: ecm
ecm_schema: "1.0"
id: ground-source-heat-pump
name: Ground-Source Heat Pump (Electrification)
category: HVAC
version: "1.0"
license: CC-BY-4.0
summary: Replace boilers / district heating with ground-loop heat pumps. Higher COP than ASHP, higher capex.
applicability: Buildings with adequate ground footprint or borehole drilling access. Best for cold-climate offices, healthcare, university campuses.
impacts:
  - carrier: Gas
    operation: remove
    mode: absolute
    value_typical: 0
  - carrier: District_Heating
    operation: remove
    mode: absolute
    value_typical: 0
  - carrier: Elec_Grid
    operation: add
    mode: absolute
    value_low: 18
    value_typical: 25
    value_high: 35
    note: Lower than ASHP because GSHP COP is 3.5–4.5 vs ASHP's 2.5–3.5.
cost:
  capex_per_m2_low: 120
  capex_per_m2_typical: 180
  capex_per_m2_high: 280
  embodied_carbon_kg_per_m2: 20.0   # boreholes + copper + refrigerants
  currency: USD
payback_years_range: [15, 30]
notes: |
  Boreholes last 50+ yr, plant ~25yr. Use `lifetime_years: 25` on the retrofit.
  Best paired with a long-horizon CRREM analysis where the deep CO₂
  reductions justify the capex.
---

# Ground-Source Heat Pump

The premium electrification option. Higher COP, higher capex, higher embodied carbon (boreholes + refrigerant). Standard for new-build sustainable office stock in Northern Europe and North America.
