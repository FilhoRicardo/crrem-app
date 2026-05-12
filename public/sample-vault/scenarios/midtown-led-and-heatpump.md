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
      capex_total: 120000        # 7500 m² × $16/m² (typical)
      currency: USD
      embodied_carbon_kg: 7500   # ~1 kgCO₂e per m² for LED retrofit (manufacturing + install)
    lifetime_years: 10           # LEDs typically replaced at 10yr; replacement at 2036, 2046
  - id: r-heatpump-2028
    year: 2028
    name: VRF heat pump electrification
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
      capex_total: 975000        # 7500 m² × $130/m² (typical heat pump retrofit)
      currency: USD
      embodied_carbon_kg: 67500  # 9 kgCO₂e/m² — refrigerants + steel + concrete pads
    lifetime_years: 15           # Heat pumps replaced ~15yr; replacement at 2043
---

# LED + Heat Pump Retrofit

Two-step decarbonisation:

1. **2026 — LED lighting retrofit** (lifetime 10 yr, replaced 2036 + 2046)
2. **2028 — VRF heat pump electrification** (lifetime 15 yr, replaced 2043)

Both retrofits carry embodied carbon and lifetime-driven replacement capex — see the Cost & Financial Return card for the multi-cycle picture, and the MACC chart for the cost-per-tCO₂ ranking.
