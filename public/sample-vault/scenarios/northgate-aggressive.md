---
doc_type: scenario
scenario_schema: "1.0"
id: northgate-aggressive
name: Aggressive decarb (PV expansion + ASHP + envelope)
asset_id: northgate-quarter
parent_scenario_id: northgate-do-nothing
retrofits:
  - id: r-pv-expansion-2026
    year: 2026
    name: PV array expansion
    ecm_id: rooftop-pv
    impacts:
      - carrier: Renew_Consumed
        operation: add
        mode: absolute
        value: 200000             # add 200 MWh on top of existing 120
      - carrier: Renew_Exported
        operation: add
        mode: absolute
        value: 80000
    cost:
      capex_total: 224000         # 160 kWp × £1400/kWp
      currency: GBP
      embodied_carbon_kg: 48000
    lifetime_years: 25
  - id: r-window-2027
    year: 2027
    name: Window glazing upgrade
    ecm_id: window-glazing-upgrade
    impacts:
      - carrier: Gas
        operation: reduce
        mode: percent
        value: 22
      - carrier: Elec_Grid
        operation: reduce
        mode: percent
        value: 6                  # cooling load drop
    cost:
      capex_total: 480000         # 12000 × £40/m²
      currency: GBP
      embodied_carbon_kg: 144000  # 12 kgCO₂e/m² — glass + aluminium
      # No lifetime_years — windows last 30+ yr
  - id: r-ashp-2029
    year: 2029
    name: Air-source heat pump (replace gas boilers)
    ecm_id: air-source-heat-pump
    impacts:
      - carrier: Gas
        operation: remove
        mode: absolute
        value: 0
      - carrier: Elec_Grid
        operation: add
        mode: absolute
        value: 95000
    cost:
      capex_total: 1560000        # 12000 × £130/m²
      currency: GBP
      embodied_carbon_kg: 108000
    lifetime_years: 15
---

# Aggressive decarbonisation

Stack of three CRREM-aligned interventions for a London mixed-use building. Look at the MACC chart to see which dominates: PV is usually cheapest (sub-£0/tCO₂ once UK grid EF rises), windows are mid-cost (envelope is expensive embodied), ASHP is highest absolute capex but largest CO₂ saved.

The **climate adjustment (RCP 4.5)** on the asset means projected gas demand drops year-on-year as Greater London warms — making the heat pump payback *slightly* less attractive than a flat-demand scenario. The **renewable degradation (-0.5%/yr)** chips PV output back over time. Both effects show in the chart.
