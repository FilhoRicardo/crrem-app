# Project Memory — CRREM Admin App

**Read this first in any new session.** Captures all locked decisions, current state, and what's next so we don't restart from zero.

---

## Data flow (one diagram, please keep in sync)

```
┌──────────────────────────┐         ┌──────────────────────────┐
│   User's vault folder    │         │    references/ (repo)    │
│   ─────────────────────  │         │   ───────────────────── │
│   assets/*.md            │         │   worked-examples-       │
│   scenarios/*.md         │         │     fixtures-v1.0.json   │
│   ecms/*.md              │         │   pathways-v2.05.xlsx    │
│   portfolios/*.md        │         │   emission-factors-…xlsx │
│   trash/*/*.md           │         │   postal-code-lookup-…   │
└────────────┬─────────────┘         └────────────┬─────────────┘
             │ (FSA: read + write)                │ (build-time:
             ▼                                    │  parsed → JSON)
┌──────────────────────────┐                      ▼
│   src/vault/loader.ts    │         ┌──────────────────────────┐
│   ─────────────────────  │         │  src/engine/crrem-data.* │
│   parseFrontmatter       │         │   ─────────────────────  │
│   parse{Asset,Scenario,  │         │   per-region grid EFs    │
│         ECM,Portfolio}   │         │   per region+type        │
│   write{…,Asset,Sc,…}    │         │   pathway curves         │
│   {Entity}ToMarkdown     │         │   postal-code → region   │
│   import{Entity}File     │         └─────────────┬────────────┘
└────────────┬─────────────┘                       │
             │                                     │
             ▼                                     ▼
┌──────────────────────────┐         ┌──────────────────────────┐
│       src/store.ts       │  reads  │  src/engine/providers.ts │
│       (zustand)          │ ◄─────► │  efProvider              │
│       ─────────────────  │         │  pathwayProvider         │
│       assets[]           │         └─────────────┬────────────┘
│       scenarios[]        │                       │
│       ecms[]             │                       ▼
│       portfolios[]       │         ┌──────────────────────────┐
│       view, selection    │         │  src/engine/calculate.ts │
│       save/delete actions│ ◄─────► │  applyRetrofitsForYear   │
└────────────┬─────────────┘         │  calculateYearMetrics    │
             │                       │  blendPathway            │
             │                       │  projectTrajectory       │
             │                       │  actualForYear           │
             │                       │  findMisalignmentYear    │
             │                       │  portfolioMetrics        │
             │                       └─────────────┬────────────┘
             │                                     │
             ▼                                     ▼
┌──────────────────────────────────────────────────────────────────┐
│                    src/components/  (React + Plotly)              │
│  ──────────────────────────────────────────────────────────────  │
│  Header     · 4 tabs (Asset / Properties / Usage / Portfolio)    │
│  AssetList  · sidebar with summariseAsset()                      │
│  AssetDetail · StrandingChart + Timeline + RetrofitDrawer        │
│              + ScenarioPanel                                     │
│  Properties  · table + AssetForm + ActualsEditor                 │
│  UsageView   · per-asset ActualsEditor                           │
│  Portfolio   · pill row + chart + table + PortfolioForm          │
│  ECMLibrary  · slide-over CRUD                                   │
└──────────────────────────────────────────────────────────────────┘
```

Rules of the road:
- The engine never imports from `vault/` or `components/` — it's pure TS, takes EnergyMaps and EF/Pathway providers, returns metrics.
- The loader never imports from `engine/` — it parses files into types and is otherwise dumb.
- Components depend on store + engine + loader; they never poke disk directly.
- Updates flow store → components via Zustand subscriptions; never the other way.

---

## What this app does

A retrofit-planning tool for CRREM assessments. User loads asset(s), the app shows the carbon trajectory vs the CRREM pathway (2024–2050). User clicks any year on a timeline → adds, edits, or removes retrofits → app recomputes the trajectory and revised misalignment year. Scenarios are saved and compared. Cost (capex + opex savings + payback) tracked alongside carbon math.

Goal: turn "you're stranded in 2028" into "here's the retrofit plan that gets you to 2042 for £X capex with Y-year payback."

---

## Locked decisions

### Architecture: vault as database

All **user data** stored as `.md` files with YAML frontmatter. Reference data (CRREM xlsx) stays binary.

```
vault/                          # user-owned, lives wherever they want
├── assets/<id>.md              # one building per file
├── scenarios/<id>.md           # one scenario per file
├── portfolios/<id>.md
└── ecms/<id>.md                # ECM library (community-shareable)

references/                     # CRREM source data (in this repo, not the vault)
├── pathways-v2.05.xlsx
├── emission-factors-v2.05.xlsx
├── postal-code-lookup-v2.05.xlsx
├── hdd-cdd-eu-v2.05.xlsx
├── blueprint.md
├── blueprint-schema.json
├── worked-examples-fixtures-v1.0.json
└── ecm-schema-v1.0.md          # LOCKED schema spec
```

**Why .md everywhere**: visualizable in Obsidian (graph view, properties panel, wikilinks), git-able, portable, no proprietary format. User has same pattern in [TaskDash](https://github.com/FilhoRicardo/taskDash).

**Scenarios store inputs only.** Trajectory outputs are computed on demand from inputs (no caching, no staleness). An auto-generated `## Results` block can be written into the scenario .md between HTML comment fences for human readability.

**Scenario branching = full copy.** When branching from parent scenario, retrofits are materialized into the child file. Editing the parent later does not propagate. `parent_scenario_id` is provenance-only metadata.

**Retrofit impacts are materialized at apply time.** Even when a retrofit references an `ecm_id`, the actual values are copied into the scenario. ECM library edits don't change historical scenarios.

### Tech stack: locked

| Layer | Choice | Notes |
|-------|--------|-------|
| UI | **React 18 + TypeScript** | TS for type safety on carriers/operations/units |
| Build | **Vite** | Same as TaskDash |
| Styling | **Tailwind CSS** | |
| State | **Zustand** | Lighter than Redux |
| Charts | **Plotly.js** | Stranding charts have multi-line + hover + year markers |
| Frontmatter | **gray-matter** | |
| Excel parsing | **SheetJS Community** | Free version sufficient |
| Tests | **Vitest** | Run `worked-examples-fixtures-v1.0.json` against calc engine |
| Hosting | **Vercel** (free tier) | Static React app, no backend |
| Local data | **File System Access API** | Chrome/Edge only — accepted trade-off |
| PWA | **vite-plugin-pwa** | Installable, offline app shell |
| Live sync | **Focus rescan + optional polling + refresh button** | No native FSA watcher exists; this combo covers all workflows |

**Total cost: $0.** No backend, no per-seat licenses, no signing certs needed for a PWA.

**Why this over Tauri**: user already has TaskDash on this stack working, IT-friendliness, no install required, scales infinitely on Vercel free tier.

### Calculation engine principles

- **Pure TypeScript module**, zero React/Tauri/Vercel imports.
- Validates against `references/worked-examples-fixtures-v1.0.json` exactly (4 assets + portfolio rollup).
- Tolerances: ±0.5 kgCO₂e/m²/yr carbon, ±1.0 kWh/m²/yr EUI, **exact** misalignment year.
- Forward projection assumption: energy demand flat unless retrofit changes it; grid EFs decline annually; other EFs static; retrofit impacts apply from `year` onward.
- Mixed-use: blend pathways year-by-year by floor-area %; never a single static row.
- Grid export credit: `MIN(Renew_Exported × EF_Elec, Elec_Grid × EF_Elec)` — never offsets non-electric fuels.
- DH/DC legacy fallback: scale UK baseline (0.20431 kgCO₂e/kWh) against local grid trajectory.

### ECM schema v1.0: LOCKED

Full spec in [`references/ecm-schema-v1.0.md`](references/ecm-schema-v1.0.md). Highlights:

- One `.md` per ECM, YAML frontmatter + prose body untouched.
- Required: `ecm_schema`, `id`, `name`, `version`, `category`, `license` (default `CC-BY-4.0`), `dateCreated`, `dateModified`, `summary`, `applicability`, `impacts`, `cost`.
- `impacts` is a list of `{carrier, operation, mode, value_low/typical/high, note}`:
  - `operation`: `reduce` | `remove` | `add`
  - `mode`: `percent` | `absolute` (omit if `remove`)
- Carriers must match CRREM exactly: `Elec_Grid`, `Gas`, `Oil`, `District_Heating`, `District_Cooling`, `Biomass`, `Other_Fuels`, `Renew_Consumed`, `Renew_Exported`.
- Cost track: `capex_per_m2_*` **or** `capex_per_kwp_*`, never both.
- Import: single `.md` or `.zip` of `.md` files. Collisions on `id` prompt overwrite/skip/rename.
- Export: select N → `.zip` of `.md` files. Round-trip lossless.

### v1 feature scope

All confirmed in scope:
- Click year on timeline → add/edit/remove retrofit
- Multiple retrofits per year (HVAC + envelope + PV in one capex round)
- Remove an energy carrier (e.g. boiler→VRF removes gas, adds elec)
- "Do nothing" scenario auto-generated by default
- Save scenarios; branch from existing or save standalone
- Capex (total + per m² OR per kWp)
- Utility prices on asset → opex savings + payback period
- ECM library with templates (pick → tweak → apply)
- Import/export ECMs (community sharing, CC-BY-4.0 default)
- Sample vault shipped on first launch (1 asset, do-nothing + 1 retrofit, 5 ECMs)

Out of scope for v1 (acknowledged but deferred):
- Energy price escalation / inflation
- Renewable degradation (PV ~0.5%/yr loss)
- Retrofit lifetime / replacement modeling

---

## CLAUDE.md guidelines (already enforced)

[`CLAUDE.md`](CLAUDE.md) at project root has Karpathy's four principles:
1. **Think Before Coding** — surface assumptions, ask if unclear, present alternatives
2. **Simplicity First** — minimum code; nothing speculative
3. **Surgical Changes** — touch only what's needed; match existing style
4. **Goal-Driven Execution** — verify against fixtures before marking calc steps done

Plus CRREM-specific rules and the 4 reference asset validation targets.

---

## Pending / next steps

In rough order:

- [x] **Lock asset.md schema** — saved to `references/asset-schema-v1.0.md`
- [x] **Lock scenario.md schema** — saved to `references/scenario-schema-v1.0.md`
- [x] **Lock portfolio.md schema** — saved to `references/portfolio-schema-v1.0.md`
- [x] **Re-frontmatter user's 3 existing ECMs** to v1.0 schema (and fix the malformed YAML)
- [x] **Scaffold project**: package.json, vite.config.ts, vitest.config.ts, tsconfigs, index.html, App.tsx, main.tsx, tailwind.config.js, postcss.config.js — all written
- [x] **Build calc engine**: `src/engine/types.ts`, `src/engine/calculate.ts`, `src/engine/calculate.test.ts` — all written. Tests cover all 4 assets + portfolio rollup.
- [ ] **FIRST THING ON NEW MACHINE**: `npm install` then `npx vitest run` from project root. All 18 tests should pass — if any fail, fix before proceeding. Node.js LTS required (not available on current machine).
- [ ] **Build vault loader**: FSA API + js-yaml (not gray-matter — browser compat), parse all 4 doc types, validate against schemas
- [ ] **Build UI in this order**:
  1. Asset list view (loaded from vault)
  2. Asset detail with stranding chart (do-nothing only, no retrofits yet)
  3. Timeline component with click-to-add-retrofit
  4. Scenario CRUD (create, save, branch)
  5. Multi-scenario overlay chart
  6. ECM library browser
  7. ECM import/export
  8. Portfolio rollup view
- [ ] **Sample vault** — bundle as `public/sample-vault/` and offer to copy on first launch

---

## Drafts in conversation (not yet saved as files)

These are agreed in concept but not yet written to disk:

**Asset frontmatter sketch** (full draft in conversation history):
- `doc_type: asset`, `asset_schema: "1.0"`, `id`, `name`, `gav`
- Location: `country`, `postal_code`
- Building: `property_type`, `gia_m2`, `reporting_year`
- `energy:` map of carrier → kWh/yr
- `utility_prices:` map of carrier → $/kWh + currency

**Scenario frontmatter sketch**:
- `doc_type: scenario`, `scenario_schema: "1.0"`, `id`, `name`, `asset_id`, `parent_scenario_id`
- `retrofits:` list of `{id, year, ecm_id, name, impacts: [...], cost: {capex_total, capex_per_m2, currency}}`
- Auto-generated `## Results` block fenced with HTML comments

**Portfolio frontmatter sketch**:
- `doc_type: portfolio`, `id`, `name`, `asset_ids: [...]`, `weighting: gia`

---

## User profile (from this session)

- Owns [TaskDash](https://github.com/FilhoRicardo/taskDash) — same React/Vite/Vercel/FSA/Obsidian-vault pattern
- Strong preference: **everything as `.md` for Obsidian compatibility** (Properties panel, graph view, wikilinks)
- Has personal ECM library at `C:\Users\ricardo.filho\Documents\2ndBrain\4 - Main notes\wiki\ecms\` — three samples shared this session, all need frontmatter cleanup to v1.0 schema
- IT-friendliness was a real concern → resolved by going PWA route
- Wants the ECM library to be **community-shareable** (drives the schema versioning + license fields)
- Values portability and "lightness" highly

---

## File inventory (downloaded this session)

`references/` — 10 files:
- `assessment-guide-v1.01.pdf` (1.2 MB)
- `blueprint.md` (12 KB) — full CRREM methodology spec
- `blueprint-schema.json` (16 KB) — JSON Schema with formula graph
- `emission-factors-v2.05.xlsx` (172 KB)
- `hdd-cdd-eu-v2.05.xlsx` (36 MB)
- `pathways-v2.05.xlsx` (4.7 MB)
- `postal-code-lookup-v2.05.xlsx` (3.8 MB)
- `technical-blueprint-v1.0.xlsx` (153 KB)
- `worked-examples-fixtures-v1.0.json` (35 KB) — **the validation oracle**
- `worked-examples-v1.0.xlsx` (179 KB)

Also in `references/`:
- `ecm-schema-v1.0.md` — written this session, locked
