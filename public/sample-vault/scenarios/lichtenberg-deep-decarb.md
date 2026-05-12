---
doc_type: scenario
scenario_schema: "1.0"
id: lichtenberg-deep-decarb
name: Deep decarbonisation (full stack)
asset_id: lichtenberg-tower
parent_scenario_id: lichtenberg-do-nothing
retrofits:
  - id: r-led-2026
    year: 2026
    name: LED retrofit + DALI controls
    ecm_id: led-lighting-upgrade
    impacts:
      - carrier: Elec_Grid
        operation: reduce
        mode: percent
        value: 22                  # higher than typical — DALI dimming included
    cost:
      capex_total: 288000          # 18000 × €16/m²
      currency: EUR
      embodied_carbon_kg: 18000    # 1 kgCO₂e/m²
    lifetime_years: 10
  - id: r-bms-2026
    year: 2026
    name: BMS optimisation + DCV
    ecm_id: demand-controlled-ventilation
    impacts:
      - carrier: Elec_Grid
        operation: reduce
        mode: percent
        value: 6
      - carrier: District_Heating
        operation: reduce
        mode: percent
        value: 8                   # smarter heating schedule
    cost:
      capex_total: 144000          # €8/m²
      currency: EUR
      embodied_carbon_kg: 3600
    lifetime_years: 12
  - id: r-envelope-2027
    year: 2027
    name: External wall insulation + new windows
    ecm_id: envelope-insulation
    impacts:
      - carrier: District_Heating
        operation: reduce
        mode: percent
        value: 40                   # major heating-load reduction
    cost:
      capex_total: 1620000         # 18000 × €90/m² — Berlin EnEV-grade refurb
      currency: EUR
      embodied_carbon_kg: 540000   # 30 kgCO₂e/m² — significant material footprint
      # No lifetime_years — envelope considered permanent
  - id: r-gshp-2029
    year: 2029
    name: Ground-source heat pump (replace district heating contract)
    ecm_id: ground-source-heat-pump
    impacts:
      - carrier: District_Heating
        operation: remove
        mode: absolute
        value: 0
      - carrier: Elec_Grid
        operation: add
        mode: absolute
        value: 320000              # higher than ASHP because GSHP COP is better → less elec
    cost:
      capex_total: 3240000         # 18000 × €180/m² — boreholes + plant
      currency: EUR
      embodied_carbon_kg: 360000   # 20 kgCO₂e/m² — boreholes, copper, refrigerants
    lifetime_years: 25             # GSHP boreholes last 50+ yr; plant ~25
  - id: r-pv-expansion-2030
    year: 2030
    name: PV expansion + battery
    ecm_id: rooftop-pv
    impacts:
      - carrier: Renew_Consumed
        operation: add
        mode: absolute
        value: 270000              # add 270 MWh
      - carrier: Renew_Exported
        operation: add
        mode: absolute
        value: 90000
    cost:
      capex_total: 504000          # 360 kWp × €1400/kWp
      currency: EUR
      embodied_carbon_kg: 108000
    lifetime_years: 25
  - id: r-metering-2026
    year: 2026
    name: Smart sub-metering
    ecm_id: smart-metering
    impacts:
      - carrier: Elec_Grid
        operation: reduce
        mode: percent
        value: 3                   # behavioural-only savings from sub-metering
    cost:
      capex_total: 36000           # €2/m²
      currency: EUR
      embodied_carbon_kg: 1080
    lifetime_years: 15
---

# Deep decarbonisation — Lichtenberg Tower

The full-stack EnEV-grade refurbishment Berlin office stock will need to do this decade. Six retrofits across four years:

| Year | Intervention | Lifetime | Embodied (kgCO₂e) |
|---|---|---|---|
| 2026 | LED + DALI | 10 yr (replaces 2036, 2046) | 18,000 |
| 2026 | Smart metering | 15 yr | 1,080 |
| 2026 | BMS + DCV | 12 yr | 3,600 |
| 2027 | Envelope (walls + windows) | permanent | 540,000 |
| 2029 | Ground-source heat pump | 25 yr | 360,000 |
| 2030 | PV expansion (360 kWp) | 25 yr | 108,000 |

This is the showpiece scenario for the **MACC chart**: bars sorted left-to-right will go from "pays for itself" (LED, BMS, smart metering) through "amber zone" (PV, GSHP) to "high-cost" (envelope insulation). The **sensitivity sliders** make it easy to ask: what if energy prices double? what if envelope capex overruns by 40%?

Open the **⇄ Compare scenarios** modal against `lichtenberg-do-nothing` for the headline delta — multi-million-€ NPV swing under any reasonable assumption set, multi-decade misalignment-year improvement.
