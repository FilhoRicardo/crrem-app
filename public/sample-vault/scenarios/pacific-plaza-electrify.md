---
doc_type: scenario
scenario_schema: "1.0"
id: pacific-plaza-electrify
name: HVAC electrification + chiller upgrade
asset_id: pacific-plaza-mall
parent_scenario_id: pacific-plaza-do-nothing
retrofits:
  - id: r-chiller-2027
    year: 2027
    name: High-efficiency chiller upgrade
    ecm_id: chiller-upgrade
    impacts:
      - carrier: District_Cooling
        operation: reduce
        mode: percent
        value: 25
      - carrier: Elec_Grid
        operation: add
        mode: absolute
        value: 50000             # auxiliary pumps
    cost:
      capex_total: 1100000        # 22000 m² × $50/m² (typical)
      currency: HKD
      embodied_carbon_kg: 88000   # 4 kgCO₂e/m²
    lifetime_years: 20
  - id: r-electrify-gas-2029
    year: 2029
    name: Gas-to-electric kitchen + DHW
    ecm_id: air-source-heat-pump
    impacts:
      - carrier: Gas
        operation: remove
        mode: absolute
        value: 0
      - carrier: Elec_Grid
        operation: add
        mode: absolute
        value: 110000
    cost:
      capex_total: 2860000        # 22000 × $130/m²
      currency: HKD
      embodied_carbon_kg: 198000
    lifetime_years: 15
---

# HVAC electrification + chiller upgrade

Two-stage electrification plan:

1. **2027** — Upgrade chiller plant for 25% efficiency gain (lifetime 20yr)
2. **2029** — Replace gas appliances with heat pumps (lifetime 15yr → replacement 2044)

Currency: HKD. Watch the MACC — chiller upgrade typically lands cheap (high CO₂ saved per dollar via reduced cooling), gas electrification is usually higher cost/tCO₂ in HK due to relatively high grid EF.
