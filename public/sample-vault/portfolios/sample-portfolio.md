---
doc_type: portfolio
portfolio_schema: "1.0"
id: sample-portfolio
name: Global Reference Portfolio
asset_ids:
  - midtown-tower
  - pacific-plaza-mall
  - northgate-quarter
  - eastfield-logistics-park
  - lichtenberg-tower
weighting: gia
scenario_overrides:
  midtown-tower: midtown-led-and-heatpump
  pacific-plaza-mall: pacific-plaza-electrify
  northgate-quarter: northgate-aggressive
  eastfield-logistics-park: eastfield-pv-expansion
  lichtenberg-tower: lichtenberg-deep-decarb
---

# Global Reference Portfolio

The full sample vault rolled up — all 5 assets, ~74,500 m² total GIA, GIA-weighted. The four CRREM worked examples (Midtown / Pacific Plaza / Northgate / Eastfield) plus the Berlin full-feature showcase.

`scenario_overrides` pin each asset to its mid-ambition retrofit plan. Switch to **Compare scenarios** on each asset, or use the per-row scenario picker in the Portfolio table to swap any asset to its do-nothing or deep-retrofit alternative.

The portfolio chart shows the GIA-weighted CI vs the GIA-weighted CRREM pathway — every asset's individual climate adjustment, renewable degradation, actuals, and retrofits flow into the rollup automatically.
