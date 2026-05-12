---
doc_type: portfolio
portfolio_schema: "1.0"
id: apac-portfolio
name: APAC (Hong Kong + Sydney)
asset_ids:
  - pacific-plaza-mall
  - eastfield-logistics-park
weighting: gia
scenario_overrides:
  pacific-plaza-mall: pacific-plaza-electrify
  eastfield-logistics-park: eastfield-pv-expansion
---

# APAC Portfolio

Asia-Pacific sub-portfolio. Hong Kong shopping centre (HKD currency, no climate adjustment data — non-EU) plus Sydney warehouse (AUD currency, AUS6 sub-national pathway via postal-code lookup, PV degradation enabled).

Useful for testing GIA-weighted CI rollup across mismatched currencies and very different property types (retail vs warehouse).
