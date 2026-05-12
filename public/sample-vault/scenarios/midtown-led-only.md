---
doc_type: scenario
scenario_schema: "1.0"
id: midtown-led-only
name: LED only
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
      capex_total: 120000
      currency: USD
      embodied_carbon_kg: 7500
    lifetime_years: 10
---

# LED only

Single-retrofit baseline scenario for comparison. Useful as the "minimum action" alternative when comparing against `midtown-led-and-heatpump` and `midtown-deep-retrofit` in the **⇄ Compare scenarios** view.
