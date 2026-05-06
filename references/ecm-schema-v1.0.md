---
doc_type: schema-spec
schema: ecm
schema_version: "1.0"
dateCreated: 2026-05-06
status: locked
---

# ECM File Format — Schema v1.0

ECMs (Energy Conservation Measures) are stored as **`.md` files** with YAML frontmatter. The frontmatter is machine-readable (consumed by the app); the prose body is human-readable (rendered by Obsidian, GitHub, etc.).

One ECM = one `.md` file. The community-shareable unit is a single file or a folder/zip of them.

## Required Frontmatter Fields

| Field | Type | Notes |
|-------|------|-------|
| `ecm_schema` | string | Schema version. Currently `"1.0"`. |
| `id` | string | Stable kebab-case identifier. Must be unique within a library. |
| `name` | string | Human-readable display name. |
| `version` | string | ECM author's own version (e.g. `"1.0"`). Bumped when impact/cost numbers change. |
| `category` | string | High-level grouping (e.g. `HVAC Controls`, `Renewables`, `Envelope`, `Lighting`). |
| `license` | string | Defaults to `CC-BY-4.0` for community sharing. |
| `dateCreated` | date | ISO date. |
| `dateModified` | date | ISO date. |
| `summary` | string | One-line description (full sentence, not truncated). |
| `applicability` | object | See below. |
| `impacts` | list | See below. At least one entry. |
| `cost` | object | See below. |

## Optional Frontmatter Fields

| Field | Type | Notes |
|-------|------|-------|
| `author` | string | Person or org who wrote the ECM. |
| `source_url` | string | Link to the original document, if any. |
| `tags` | list | Free-form tags (used by Obsidian). |
| `type` | string | Free-form (preserves existing Obsidian convention). |
| `interactions` | object | See below. |

## Field Definitions

### `applicability`

```yaml
applicability:
  property_types: [Office, "Mixed Use", Healthcare]   # or [all]
  climates: [all]                                      # or [temperate, tropical, ...]
  notes: "Free text — when this ECM fits / doesn't fit."
```

### `impacts` (the core block)

A list of `{carrier, operation, mode, value_low, value_typical, value_high, note}` entries. Each entry describes how this ECM changes one energy carrier.

```yaml
impacts:
  - carrier: Elec_Grid                     # any CRREM carrier name
    operation: reduce                      # reduce | remove | add
    mode: percent                          # percent | absolute  (omit if operation == remove)
    value_low: 3
    value_typical: 5
    value_high: 8
    note: "Free-text context for the values."
```

**Carriers** (must match CRREM exactly):
`Elec_Grid`, `Gas`, `Oil`, `District_Heating`, `District_Cooling`, `Biomass`, `Other_Fuels`, `Renew_Consumed`, `Renew_Exported`.

**Operations:**
- `reduce` — reduce the carrier's current value by `value_*` (in percent or absolute kWh).
- `remove` — set the carrier to zero. No `mode` or `value_*` needed.
- `add` — add `value_*` to the carrier (in percent or absolute kWh).

**Modes:**
- `percent` — value is a percentage (0–100). Compounds against current state (after prior retrofits in the scenario).
- `absolute` — value is in kWh/yr.

**Multiple impacts per ECM are normal** — e.g. a heat pump retrofit reduces gas to 0 *and* adds electricity.

### `cost`

```yaml
cost:
  capex_per_m2_low: null              # building m² — for envelope/HVAC retrofits
  capex_per_m2_typical: null
  capex_per_m2_high: null
  capex_per_kwp_low: null             # per kWp — for renewables
  capex_per_kwp_typical: null
  capex_per_kwp_high: null
  capex_currency: GBP                 # ISO-4217 currency code
  payback_years_low: 2
  payback_years_typical: 3
  payback_years_high: 5
  notes: "Free-text caveats."
```

Use **either** `capex_per_m2_*` **or** `capex_per_kwp_*`, never both. The unit that's not used stays `null`. App detects which track is populated.

### `interactions`

```yaml
interactions:
  overlaps_with: [fresh-air-optimisation-co2]   # other ECM ids; savings overlap, not additive
  prerequisites: []                              # ECM ids that must be installed first
  excludes: []                                   # ECM ids that conflict with this one
```

Mirror these as `[[wikilinks]]` in the prose body for Obsidian navigation (optional).

## Example 1 — Reduction ECM

```markdown
---
ecm_schema: "1.0"
id: fcu-fan-vsds-dcv
name: "FCU Fan VSDs + DCV (CO₂-based)"
version: "1.0"
category: "HVAC Controls"
author: "Ricardo Filho"
license: "CC-BY-4.0"
dateCreated: 2026-04-09
dateModified: 2026-04-09
tags: [fcu, ventilation, electricity, energy-optimization]
summary: "Replace 3-speed FCU fans with VSDs and CO₂-based DCV via BMS."
type: article
applicability:
  property_types: [Office, "Mixed Use", Healthcare]
  climates: [all]
  notes: "Best where HVAC is >30% of total electricity."
impacts:
  - carrier: Elec_Grid
    operation: reduce
    mode: percent
    value_low: 3
    value_typical: 5
    value_high: 8
    note: "Whole-building electricity."
  - carrier: Gas
    operation: reduce
    mode: percent
    value_low: 5
    value_typical: 10
    value_high: 15
    note: "Only when heating fuel is gas."
cost:
  capex_per_m2_low: null
  capex_per_m2_typical: null
  capex_per_m2_high: null
  capex_currency: GBP
  payback_years_low: 2
  payback_years_typical: 3
  payback_years_high: 5
  notes: "Heavy variance by zone count and existing BMS capability."
interactions:
  overlaps_with: [fresh-air-optimisation-co2]
  prerequisites: []
  excludes: []
---

# ECM: FCU Fan VSDs + DCV (CO₂-based)

## Summary
Replace 3-speed FCU fans with variable speed drives (VSDs) and enable
CO₂-based demand-controlled ventilation (DCV) via BMS to match ventilation
and fan power to actual occupancy while safeguarding minimum IAQ.

[... rest of prose body ...]
```

## Example 2 — Absolute Addition ECM

```markdown
---
ecm_schema: "1.0"
id: rooftop-pv
name: "Rooftop Solar PV"
version: "1.0"
category: "Renewables"
author: "Ricardo Filho"
license: "CC-BY-4.0"
dateCreated: 2026-04-09
dateModified: 2026-04-09
tags: [pv, solar, renewables, electricity-generation]
summary: "Install rooftop photovoltaic panels for on-site electricity generation."
type: article
applicability:
  property_types: [all]
  climates: [all]
  notes: "Yield highly latitude- and shading-dependent. Defaults assume temperate UK at ~1000 kWh/kWp/yr."
impacts:
  - carrier: Renew_Consumed
    operation: add
    mode: absolute
    value_low: 30000
    value_typical: 60000
    value_high: 120000
    note: "Self-consumed PV. Defaults assume ~75 kWp install. Scale linearly with capacity."
  - carrier: Renew_Exported
    operation: add
    mode: absolute
    value_low: 10000
    value_typical: 20000
    value_high: 40000
    note: "Surplus exported to grid. Earns export credit capped at grid EF."
cost:
  capex_per_kwp_low: 800
  capex_per_kwp_typical: 1000
  capex_per_kwp_high: 1400
  capex_currency: GBP
  payback_years_low: 6
  payback_years_typical: 10
  payback_years_high: 15
interactions:
  overlaps_with: []
  prerequisites: []
  excludes: []
---

# ECM: Rooftop Solar PV

## Summary
Install rooftop photovoltaic panels for on-site electricity generation,
self-consumed where possible and exported to grid otherwise.

[... rest of prose body ...]
```

## Import / Export Behaviour

**Import**
- Single `.md`: drag-drop or file-pick → validate frontmatter → if `id` collides, prompt overwrite/skip/rename.
- Bundle (`.zip` or folder): batch-validate per file → summary report (`N imported, M rejected, K skipped`).
- **Validation rejects on**: missing required field, unknown `ecm_schema` major version, unknown carrier name, invalid operation/mode combination, both `capex_per_m2_*` and `capex_per_kwp_*` populated.

**Export**
- Select N ECMs from the library → emit a `.zip` of `.md` files.
- Round-trip lossless: re-importing the zip produces byte-identical files.
- No app-specific state in exported files (no UUIDs, no internal references).

## Compatibility Notes

- **Obsidian**: Simple frontmatter fields appear in the Properties panel. Nested fields (`applicability`, `impacts`, `cost`, `interactions`) appear in Source mode only. Prose body renders normally.
- **GitHub**: Frontmatter renders as a YAML code block. Prose renders as markdown.
- **App**: Reads frontmatter only. Prose body is shown verbatim in a side panel ("Read more").

## Versioning Policy

- Schema major bumps (`1.x` → `2.0`) may break compatibility. The app refuses to load unknown major versions and surfaces a clear error.
- Schema minor bumps (`1.0` → `1.1`) only add optional fields. Older ECMs continue to load.
- ECM `version` is the *author's* version, independent of schema version. Bumped whenever impact/cost numbers change.
