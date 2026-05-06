---
doc_type: schema-spec
schema: asset
schema_version: "1.0"
dateCreated: 2026-05-06
status: locked
---

# Asset File Format — Schema v1.0

Assets are stored as **`.md` files** with YAML frontmatter. One asset = one file. Lives in `vault/assets/<id>.md`.

## Required Frontmatter Fields

| Field | Type | Notes |
|-------|------|-------|
| `doc_type` | string | Always `asset`. |
| `asset_schema` | string | Schema version. Currently `"1.0"`. |
| `id` | string | Stable kebab-case identifier. Unique within vault. Filename should match (`<id>.md`). |
| `name` | string | Display name. |
| `country` | string | Must match CRREM canon exactly (e.g. `USA`, `United Kingdom`, `Hong Kong`). |
| `property_type` | string | Must match CRREM canon (e.g. `Office`, `Shopping Centre`, `Mixed Use`). |
| `gia_m2` | number | Gross Internal Area in m². > 0. |
| `reporting_year` | integer | 2020–2050. Year the energy data represents. |
| `energy` | object | Map of carrier → kWh/yr. `Elec_Grid` is required. |
| `dateCreated` | date | ISO date. |
| `dateModified` | date | ISO date. |

## Conditionally Required

| Field | Condition |
|-------|-----------|
| `postal_code` | Required when `country` ∈ {USA, Canada, Australia}. Used for sub-national pathway resolution. |
| `mixed_use_split` | Required when `property_type == "Mixed Use"`. See below. |

## Optional Frontmatter Fields

| Field | Type | Notes |
|-------|------|-------|
| `asset_id_external` | string | Customer's internal ID (e.g. `A-001`). |
| `gav` | number | Gross Asset Value, currency-agnostic. For sorting/filtering. |
| `utility_prices` | object | See below. Required for opex/payback calculations. |
| `tags` | list | Free-form for Obsidian. |

## Field Definitions

### `energy`

Map of carrier name → annual consumption in kWh/yr. All values ≥ 0.

```yaml
energy:
  Elec_Grid: 850000          # required, > 0 in practice
  Gas: 0
  Oil: 0
  District_Heating: 680000
  District_Cooling: 0
  Biomass: 0
  Other_Fuels: 0
  Renew_Consumed: 0          # on-site renewables consumed (counted in EUI, EF=0)
  Renew_Exported: 0          # on-site renewables exported (grid credit only)
```

Carrier names must match CRREM canon exactly. Unknown carriers cause validation failure.

### `mixed_use_split`

Only present when `property_type == "Mixed Use"`. Floor-area percentages must sum to 100.

```yaml
mixed_use_split:
  Office: 65
  "Retail High Street": 35
```

### `utility_prices`

Map of carrier → unit price. Used to compute opex savings from retrofits.

```yaml
utility_prices:
  Elec_Grid: 0.28           # per kWh, in `currency`
  District_Heating: 0.12
  Gas: 0.06
  currency: USD             # ISO 4217
```

Currencies are per-asset (not per-portfolio), to support multi-region portfolios.

## Example

```markdown
---
doc_type: asset
asset_schema: "1.0"
id: midtown-tower
name: "Midtown Tower"
asset_id_external: "A-001"
gav: 285000000

country: USA
postal_code: "10005"

property_type: Office
gia_m2: 7500
reporting_year: 2024

energy:
  Elec_Grid: 850000
  District_Heating: 680000
  Gas: 0
  Oil: 0
  District_Cooling: 0
  Biomass: 0
  Other_Fuels: 0
  Renew_Consumed: 0
  Renew_Exported: 0

utility_prices:
  Elec_Grid: 0.28
  District_Heating: 0.12
  currency: USD

dateCreated: 2026-05-06
dateModified: 2026-05-06
tags: [asset, office, ny]
---

# Midtown Tower

42-storey Class A office in Manhattan financial district.

## Notes
- Steam district heating from Con Edison.
- BMS upgraded 2022; submetering in place.
- Tenants: 3 anchor (mixed sectors), ~85% leased.

## Scenarios
- [[midtown-tower--do-nothing]]
- [[midtown-tower--plan-a]]
```

## Validation Rules

- `id` must match `[a-z0-9][a-z0-9-]*` and equal the filename (without `.md`).
- `gia_m2 > 0`; `reporting_year ∈ [2020, 2050]`.
- All `energy` values ≥ 0; `Elec_Grid` typically > 0 (warn, don't reject, if 0).
- `country` must exist in `references/emission-factors-v2.05.xlsx` country list.
- `property_type` must exist in `references/pathways-v2.05.xlsx` property type list (or be `Mixed Use`).
- `postal_code` must resolve via `references/postal-code-lookup-v2.05.xlsx` when required.
- `mixed_use_split` percentages must sum to 100 ± 0.01.
- Constituent property types in `mixed_use_split` must exist in pathways.

## Compatibility Notes

- **Obsidian**: simple fields show in Properties panel; `energy`, `mixed_use_split`, `utility_prices` show in Source mode.
- **App**: reads frontmatter only. Prose body is shown in a side panel.
- Wikilinks to scenarios in prose are recommended for Obsidian graph view.
