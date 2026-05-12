---
doc_type: portfolio
portfolio_schema: "1.0"
id: americas-portfolio
name: Americas (USA only — single asset)
asset_ids:
  - midtown-tower
weighting: gia
scenario_overrides:
  midtown-tower: midtown-deep-retrofit
---

# Americas Portfolio

Single-asset portfolio for a USA-only sub-aggregation. Pinned to Midtown's `deep-retrofit` scenario (LED + BMS + envelope + heat pump + PV) so the rollup chart shows the full multi-retrofit trajectory rather than the two-step plan.

Use this to demonstrate that the Portfolio view works gracefully even with a single asset — pill row hides the comparison, but the chart, table, and PDF export all behave correctly.
