---
doc_type: scenario
scenario_schema: "1.0"
id: midtown-deep-retrofit
name: Deep retrofit (LED + HP + envelope + PV)
asset_id: midtown-tower
parent_scenario_id: midtown-led-and-heatpump
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
  - id: r-bms-2026
    year: 2026
    name: BMS optimisation + DCV controls
    ecm_id: bms-optimisation
    impacts:
      - carrier: Elec_Grid
        operation: reduce
        mode: percent
        value: 8
    cost:
      capex_total: 60000           # ~$8/m²
      currency: USD
      embodied_carbon_kg: 1500     # negligible — software + a few sensors
    lifetime_years: 12
  - id: r-envelope-2027
    year: 2027
    name: Envelope insulation + air sealing
    ecm_id: envelope-insulation
    impacts:
      - carrier: District_Heating
        operation: reduce
        mode: percent
        value: 35
    cost:
      capex_total: 525000          # 7500 × $70/m²
      currency: USD
      embodied_carbon_kg: 187500   # 25 kgCO₂e/m² — insulation manufacturing dominant
      # No lifetime_years — envelope considered permanent within trajectory horizon
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
        value: 130000               # smaller add than LED+HP scenario because envelope cut load 35% first
    cost:
      capex_total: 975000
      currency: USD
      embodied_carbon_kg: 67500
    lifetime_years: 15
  - id: r-pv-2030
    year: 2030
    name: Rooftop PV array
    ecm_id: rooftop-pv
    impacts:
      - carrier: Renew_Consumed
        operation: add
        mode: absolute
        value: 180000           # ~24 kWh/m² generated and consumed on-site
      - carrier: Renew_Exported
        operation: add
        mode: absolute
        value: 45000
    cost:
      capex_total: 280000        # 200kWp × $1400/kWp
      currency: USD
      embodied_carbon_kg: 60000
    lifetime_years: 25           # PV panels last 25yr+; not replaced within horizon
---

# Deep retrofit

The maximalist plan — every CRREM-relevant lever pulled in sequence:

1. **2026** — LED lighting + BMS controls (parallel installation, lifetimes 10 + 12 yr)
2. **2027** — Envelope insulation (no replacement within 25yr horizon)
3. **2028** — Heat pump (sized smaller because envelope cut load first; lifetime 15 yr)
4. **2030** — Rooftop PV (lifetime 25 yr; not replaced)

Open the **⇄ Compare scenarios** view next to `midtown-led-and-heatpump` to see the marginal value of the additional measures. The MACC will show envelope insulation usually has the highest cost/tCO₂ (it's expensive embodied + low CO₂ saved per dollar) — this is realistic and a key insight for retrofit prioritisation.
