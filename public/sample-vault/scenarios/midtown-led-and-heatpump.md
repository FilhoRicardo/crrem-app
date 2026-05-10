---
doc_type: scenario
scenario_schema: "1.0"
id: midtown-led-and-heatpump
name: LED + Heat Pump
asset_id: midtown-tower
parent_scenario_id: midtown-do-nothing
retrofits:
  - id: r-led-2026
    year: 2026
    name: LED lighting retrofit
    ecm_id: led-lighting-upgrade
    impacts:
      - carrier: Elec_Grid
        operation: reduce
        mode: percent
        value: 18
    cost:
      capex_total: 450000
      currency: USD
  - id: r-heatpump-2028
    year: 2028
    name: Replace steam with VRF heat pumps
    ecm_id: air-source-heat-pump
    impacts:
      - carrier: District_Heating
        operation: remove
        mode: absolute
        value: 0
      - carrier: Elec_Grid
        operation: add
        mode: absolute
        value: 200000
    cost:
      capex_total: 1200000
      currency: USD
---

# LED + Heat Pump Retrofit

Lights out on legacy lighting in 2026, then full electrification in 2028 — replacing district steam with VRF heat pumps. Pushes the misalignment year out significantly.
