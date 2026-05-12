---
doc_type: ecm
ecm_schema: "1.0"
id: window-glazing-upgrade
name: Window Glazing Upgrade (Triple-pane / Low-E)
category: Envelope
version: "1.0"
license: CC-BY-4.0
summary: Replace single/double glazing with triple-pane low-E. Reduces both heating and cooling loads.
applicability: Pre-2000 commercial stock with single or low-spec double glazing.
impacts:
  - carrier: District_Heating
    operation: reduce
    mode: percent
    value_low: 15
    value_typical: 22
    value_high: 30
  - carrier: Gas
    operation: reduce
    mode: percent
    value_low: 15
    value_typical: 22
    value_high: 30
  - carrier: Elec_Grid
    operation: reduce
    mode: percent
    value_low: 4
    value_typical: 6
    value_high: 10
    note: Cooling load drop from low-E coating reducing solar gain.
cost:
  capex_per_m2_low: 30
  capex_per_m2_typical: 40
  capex_per_m2_high: 60
  embodied_carbon_kg_per_m2: 12.0   # glass + aluminium frame
  currency: USD
payback_years_range: [12, 25]
notes: |
  Windows last 30+ yr — no `lifetime_years` needed. Often paired with
  envelope insulation; the two cover the full envelope upgrade.
---

# Window Glazing Upgrade

Triple-pane low-E. Reduces both heating (winter) and cooling (summer) loads. Long payback but very long lifetime — typical retrofit horizon is one-and-done.
