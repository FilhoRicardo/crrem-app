---
doc_type: ecm
ecm_schema: "1.0"
id: envelope-insulation
name: Envelope Insulation + Air Sealing
category: Envelope
version: "1.0"
license: CC-BY-4.0
summary: External or internal wall insulation + air-sealing measures. The non-glass part of envelope upgrade.
applicability: Pre-1990 building stock with U-values >1.5 W/m²K. EnEV-grade refurbishment in Germany / Passivhaus standard.
impacts:
  - carrier: District_Heating
    operation: reduce
    mode: percent
    value_low: 25
    value_typical: 35
    value_high: 50
  - carrier: Gas
    operation: reduce
    mode: percent
    value_low: 25
    value_typical: 35
    value_high: 50
cost:
  capex_per_m2_low: 50
  capex_per_m2_typical: 70
  capex_per_m2_high: 110
  embodied_carbon_kg_per_m2: 25.0   # insulation manufacturing dominant
  currency: USD
payback_years_range: [15, 40]
notes: |
  High-embodied retrofit — be careful: payback of operational savings can take decades to outweigh embodied carbon.
  Don't set `lifetime_years` (envelope considered permanent within CRREM trajectory horizon).
  Best done in conjunction with heat pump (smaller HP can be specified after envelope load reduction).
---

# Envelope Insulation + Air Sealing

The "must do first" measure if you're then specifying a heat pump — load reduction lets you size the HP smaller. Embodied carbon footprint is significant and should be carefully weighed against the long-tail operational savings.
