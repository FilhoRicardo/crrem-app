---
doc_type: scenario
scenario_schema: "1.0"
id: eastfield-pv-expansion
name: PV expansion + battery storage
asset_id: eastfield-logistics-park
parent_scenario_id: eastfield-do-nothing
retrofits:
  - id: r-pv-2026
    year: 2026
    name: Double the rooftop PV array
    ecm_id: rooftop-pv
    impacts:
      - carrier: Renew_Consumed
        operation: add
        mode: absolute
        value: 250000             # add 250 MWh on-site consumption
      - carrier: Renew_Exported
        operation: add
        mode: absolute
        value: 200000             # large export — flat warehouse roof
    cost:
      capex_total: 350000         # 250 kWp × $1400/kWp
      currency: AUD
      embodied_carbon_kg: 75000
    lifetime_years: 25
  - id: r-battery-2027
    year: 2027
    name: Lithium battery storage (1 MWh)
    ecm_id: bms-optimisation       # closest category for now
    impacts:
      - carrier: Renew_Consumed
        operation: add
        mode: absolute
        value: 80000               # battery time-shifts ~80MWh from export to self-consumption
      - carrier: Renew_Exported
        operation: reduce
        mode: absolute
        value: 80000
    cost:
      capex_total: 600000         # 1 MWh battery system
      currency: AUD
      embodied_carbon_kg: 92000   # ~92 kgCO₂e/kWh battery, lifecycle figure
    lifetime_years: 12
---

# PV expansion + battery storage

NSW warehouse with abundant flat roof and diurnal grid pricing. Two interventions:

1. **2026** — Double the rooftop PV array
2. **2027** — Add lithium battery storage to time-shift exports into self-consumption

Note: battery embodied carbon is significant (~92 kgCO₂e per kWh capacity) and lifetime is 12yr (replacement at 2039). The MACC will show whether the battery's grid-arbitrage savings justify both the upfront capex and the embodied carbon. With 0.5%/yr PV degradation also in play, this is a reality-check on aggressive renewables-only strategies.
