---
doc_type: schema-spec
schema: portfolio
schema_version: "1.0"
dateCreated: 2026-05-06
status: locked
---

# Portfolio File Format — Schema v1.0

Portfolios are stored as **`.md` files** with YAML frontmatter. One portfolio = one file. Lives in `vault/portfolios/<id>.md`.

A portfolio is just a named collection of assets with a weighting rule. **One asset can belong to multiple portfolios** by appearing in multiple files — no coupling.

## Required Frontmatter Fields

| Field | Type | Notes |
|-------|------|-------|
| `doc_type` | string | Always `portfolio`. |
| `portfolio_schema` | string | Schema version. Currently `"1.0"`. |
| `id` | string | Stable kebab-case identifier. Unique within vault. |
| `name` | string | Display name. |
| `asset_ids` | list | List of asset IDs to include. Must exist in `vault/assets/`. |
| `weighting` | string | Aggregation method. Currently only `gia` (GIA-weighted). Reserved for future: `gav`, `equal`. |
| `dateCreated` | date | ISO date. |
| `dateModified` | date | ISO date. |

## Optional Frontmatter Fields

| Field | Type | Notes |
|-------|------|-------|
| `description` | string | Free-form short description. |
| `scenario_overrides` | object | Per-asset scenario selection. See below. |
| `tags` | list | Free-form for Obsidian. |

## Field Definitions

### `weighting`

Currently only `gia` is supported (GIA-weighted aggregation, per CRREM blueprint). The field exists so future versions can add other weighting modes without a schema bump.

```yaml
weighting: gia
```

### `scenario_overrides`

By default, portfolio rollup uses each asset's "do-nothing" scenario. To compare retrofit plans at portfolio level, override per asset:

```yaml
scenario_overrides:
  midtown-tower: midtown-tower--plan-a
  pacific-plaza-mall: pacific-plaza-mall--electrification
  # northgate-quarter not listed → uses do-nothing
```

Assets without an override use the default (do-nothing). This lets users build portfolio-level "what if Plan A across the whole book?" views.

## Example

```markdown
---
doc_type: portfolio
portfolio_schema: "1.0"
id: q1-2026-eu-portfolio
name: "Q1 2026 EU Portfolio"
description: "Core European holdings for Q1 2026 stranding analysis."
asset_ids:
  - midtown-tower
  - pacific-plaza-mall
  - northgate-quarter
  - eastfield-logistics-park
weighting: gia
scenario_overrides:
  midtown-tower: midtown-tower--plan-a
  pacific-plaza-mall: pacific-plaza-mall--do-nothing
dateCreated: 2026-05-06
dateModified: 2026-05-06
tags: [portfolio, q1-2026]
---

# Q1 2026 EU Portfolio

Core European holdings for the Q1 2026 stranding analysis cycle.

## Constituents
- [[midtown-tower]] (using [[midtown-tower--plan-a]])
- [[pacific-plaza-mall]] (do-nothing baseline)
- [[northgate-quarter]] (do-nothing baseline)
- [[eastfield-logistics-park]] (do-nothing baseline)

## Notes
Weighted by GIA per CRREM blueprint convention.
```

## Computed Outputs (not stored)

Same as scenarios, portfolio outputs are computed on demand from constituent assets + their selected scenarios. The app may write an auto-generated Results block:

```markdown
<!-- AUTO-GENERATED RESULTS — DO NOT EDIT BY HAND -->
## Portfolio Results (recomputed 2026-05-06 13:45 UTC)
- Total GIA: 56,500 m²
- Portfolio EUI (2024): 177.52 kWh/m²/yr
- Portfolio Carbon Intensity (2024): 66.08 kgCO₂e/m²/yr
- Portfolio CO₂ misalignment year: 2034
- Portfolio EUI misalignment year: 2028
<!-- /AUTO-GENERATED -->
```

## Validation Rules

- `id` must match `[a-z0-9][a-z0-9-]*` and equal the filename (without `.md`).
- All `asset_ids` must reference existing asset files (warn-and-skip on missing).
- `weighting` must be a known value (currently only `gia`).
- All keys in `scenario_overrides` must appear in `asset_ids`.
- All values in `scenario_overrides` must reference existing scenario files for the corresponding asset.
- Empty `asset_ids` is a warning (portfolio with no constituents).

## Compatibility Notes

- **Obsidian**: `asset_ids` (list of strings) renders cleanly in Properties panel. `scenario_overrides` (object) is Source-mode only.
- **App**: reads frontmatter; computes rollup on demand.
- Wikilinks to constituent assets in prose are recommended for graph view.
