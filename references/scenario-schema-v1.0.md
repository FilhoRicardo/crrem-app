---
doc_type: schema-spec
schema: scenario
schema_version: "1.0"
dateCreated: 2026-05-06
status: locked
---

# Scenario File Format — Schema v1.0

Scenarios are stored as **`.md` files** with YAML frontmatter. One scenario = one file. Lives in `vault/scenarios/<id>.md`.

A scenario stores **inputs only**: which retrofits, applied which year, with which impact values. Trajectory outputs (carbon intensity, EUI, misalignment year, etc.) are **computed on demand** from inputs + asset + CRREM reference data — never stored as canonical state.

## Required Frontmatter Fields

| Field | Type | Notes |
|-------|------|-------|
| `doc_type` | string | Always `scenario`. |
| `scenario_schema` | string | Schema version. Currently `"1.0"`. |
| `id` | string | Stable kebab-case identifier. Convention: `<asset-id>--<scenario-name>`. |
| `name` | string | Display name. |
| `asset_id` | string | The asset this scenario applies to. Must exist in `vault/assets/`. |
| `retrofits` | list | List of retrofit objects. May be empty (that's the "do nothing" scenario). |
| `dateCreated` | date | ISO date. |
| `dateModified` | date | ISO date. |

## Optional Frontmatter Fields

| Field | Type | Notes |
|-------|------|-------|
| `parent_scenario_id` | string | If branched from another scenario. **Provenance only — not a live link.** |
| `description` | string | Free-form short description. |
| `tags` | list | Free-form for Obsidian. |

## Field Definitions

### `retrofits`

List of retrofit objects, each describing one intervention applied at a given year.

```yaml
retrofits:
  - id: r-001                            # unique within scenario
    year: 2027                           # ∈ [reporting_year, 2050]
    ecm_id: fcu-fan-vsds-dcv             # template used (or null/omit for custom)
    name: "FCU VSDs + DCV"               # display name (may differ from ECM name)
    impacts:                             # MATERIALIZED — copied from ECM at apply time
      - carrier: Elec_Grid
        operation: reduce
        mode: percent
        value: 5
      - carrier: Gas
        operation: reduce
        mode: percent
        value: 10
    cost:
      capex_total: 180000                # absolute cost
      capex_per_m2: 24                   # OR per m² (one is derived from the other)
      currency: USD
```

**`impacts` is materialized, not referenced.** Even though `ecm_id` points to a template, the actual values are copied into the scenario when applied. Editing the ECM later does not silently change historical scenarios.

**Same applies for branching.** When a scenario branches from a parent, the parent's retrofits are copied into the child's `retrofits` list. The child is fully independent thereafter.

### Retrofit `impacts` schema

Same shape as ECM `impacts`, but with a single `value` (not low/typical/high) since the user has chosen a specific number when applying.

```yaml
impacts:
  - carrier: <CRREM carrier name>
    operation: reduce | remove | add
    mode: percent | absolute        # omit when operation == remove
    value: <number>                 # required unless operation == remove
```

### Retrofit `cost`

```yaml
cost:
  capex_total: <number>             # in `currency`
  capex_per_m2: <number>            # convenience; derived from total ÷ asset GIA
  capex_per_kwp: <number>           # for renewables (use instead of per_m2)
  currency: <ISO 4217 code>
```

App enforces consistency: if both `capex_total` and `capex_per_m2` present, they must agree (within 0.5%) given the asset's GIA.

## Auto-Generated Results Block

The app may write a fenced HTML-comment block into the prose body to show computed outputs in a human-readable form:

```markdown
<!-- AUTO-GENERATED RESULTS — DO NOT EDIT BY HAND -->
## Results (recomputed 2026-05-06 13:42 UTC)
- Misalignment year: **2038** (was 2024 in do-nothing)
- Total capex: **$240,000**
- Cumulative opex savings to 2050: **$890,000**
- Payback: **9.2 years**
<!-- /AUTO-GENERATED -->
```

The app **only** overwrites content between these fences. All other prose is preserved.

## Example

```markdown
---
doc_type: scenario
scenario_schema: "1.0"
id: midtown-tower--plan-a
name: "Midtown Tower — Plan A"
asset_id: midtown-tower
parent_scenario_id: midtown-tower--do-nothing
description: "Conservative phased retrofit targeting alignment past 2040."
dateCreated: 2026-05-06
dateModified: 2026-05-06
tags: [scenario, midtown-tower]

retrofits:
  - id: r-001
    year: 2027
    ecm_id: fcu-fan-vsds-dcv
    name: "FCU VSDs + DCV"
    impacts:
      - carrier: Elec_Grid
        operation: reduce
        mode: percent
        value: 5
      - carrier: Gas
        operation: reduce
        mode: percent
        value: 10
    cost:
      capex_total: 180000
      capex_per_m2: 24
      currency: USD

  - id: r-002
    year: 2032
    ecm_id: rooftop-pv
    name: "Rooftop PV (60 kWp)"
    impacts:
      - carrier: Renew_Consumed
        operation: add
        mode: absolute
        value: 50000
      - carrier: Renew_Exported
        operation: add
        mode: absolute
        value: 18000
    cost:
      capex_total: 60000
      capex_per_kwp: 1000
      currency: USD
---

# Scenario: Midtown Tower — Plan A

Branched from [[midtown-tower--do-nothing]] on 2026-05-06.

## Retrofits Timeline
- **2027** — [[ecm-fcu-fan-vsds-dcv]]
- **2032** — [[ecm-rooftop-pv]] (60 kWp)

## Notes
Targets misalignment year > 2040. PV install planned alongside roof
membrane replacement scheduled for 2032 — capex shown is incremental
(panels + inverters only).

<!-- AUTO-GENERATED RESULTS — DO NOT EDIT BY HAND -->
## Results
(none yet — open scenario in app to compute)
<!-- /AUTO-GENERATED -->
```

## Validation Rules

- `id` must match `[a-z0-9][a-z0-9-]*` and equal the filename (without `.md`).
- `asset_id` must reference an existing asset file in the vault.
- `parent_scenario_id`, if present, must reference an existing scenario (warn if missing — provenance only, not fatal).
- Each retrofit's `year` must be in `[asset.reporting_year, 2050]`.
- Each retrofit's `id` must be unique within the scenario.
- Impact `carrier` must match CRREM canon.
- Impact `mode` must match what `operation` expects.
- `cost.currency` must be a valid ISO 4217 code.

## Compatibility Notes

- **Obsidian**: `retrofits` is a nested list — Source mode editing only.
- **App**: reads frontmatter for inputs; writes auto-generated results block on compute.
- Wikilinks (parent scenario, ECMs) in prose are recommended for graph view.

## On-Disk Behavior

- Scenarios are written atomically: app writes to `<id>.md.tmp`, fsyncs, then renames.
- The auto-generated Results block is overwritten on every compute; surrounding prose is preserved.
- If the file is edited externally between read and write, the app re-reads and merges (fail-safe: never lose user's prose).
