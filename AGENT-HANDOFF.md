# Agent Handoff — CRREM Admin App

**Read this before writing a single line of code.** This is the authoritative step-by-step playbook for continuing this project. Also read `CLAUDE.md` (coding rules) and `MEMORY.md` (full locked decisions and context).

---

## Where we are

The project has:
- ✅ Full Vite + React 18 + TypeScript + Tailwind + PWA scaffold
- ✅ CRREM calc engine: `src/engine/types.ts`, `src/engine/calculate.ts`
- ✅ 18 Vitest tests: `src/engine/calculate.test.ts` — covering all 4 fixture assets + portfolio
- ✅ All CRREM reference files in `references/`
- ✅ All `.md` schemas locked: asset, scenario, portfolio, ECM

**Nothing has been verified yet** — Node.js was unavailable on the authoring machine. The first thing to do is run the tests.

---

## Engineering review findings (applied 2026-05-06)

These gaps were found during `/plan-eng-review` and are patched into the steps below. Read before starting.

| # | Severity | Finding | Where fixed |
|---|----------|---------|-------------|
| 1 | **BLOCKING** | Hardcoded EF/pathway values unspecified in Step 5b | Added `stubProviders.ts` spec below |
| 2 | **BLOCKING** | No ECM .md file in sample vault — Step 5e verify fails | Added to Step 3 |
| 3 | **BLOCKING** | `jszip` not in deps — ECM .zip import can't work | Noted in Step 5e |
| 4 | **MAJOR** | Firefox and iOS Safari have zero `showDirectoryPicker` support | Browser guard added to Step 5a |
| 5 | **MAJOR** | `parent_scenario_id` branching logic undefined — silently wrong | Clarified in Step 5d |
| 6 | **MAJOR** | No frontmatter validation — silent failures on bad vault files | Noted in Step 2 |
| 7 | **MINOR** | `writeScenario` needs debounce — fires on keystroke, not on close | Clarified in Step 5c |
| 8 | **MINOR** | `vaultDir` in Zustand is non-serialisable | Comment added to store code |
| 9 | **MINOR** | `"xlsx": "^0.18.5"` should be exact-pinned | Noted in Step 6 |

---

## Step 1 — Verify the calc engine (gate: must pass before any other work)

```bash
npm install
npx vitest run
```

**Expected:** 18 tests pass, 0 failures.

If any test fails:
1. Read the failure message carefully
2. Trace it to the specific formula in `src/engine/calculate.ts`
3. Cross-check against `references/worked-examples-fixtures-v1.0.json` (the validation oracle)
4. Fix the formula — do not adjust the test to match wrong output
5. Re-run until green

**Do not proceed to Step 2 until all 18 tests pass.**

---

## Step 2 — Build the vault loader

Create `src/vault/loader.ts`. This module handles all File System Access API interactions and YAML parsing. No React, no Zustand — pure functions only.

### What it needs to do

```typescript
// Request user to pick their vault folder
export async function requestVaultDirectory(): Promise<FileSystemDirectoryHandle>

// Parse raw .md file content → { frontmatter: object, body: string }
// Use js-yaml. Split on the first two `---` delimiters only.
export function parseFrontmatter(content: string): { data: Record<string, unknown>; body: string }

// Read all .md files in a subfolder, parse frontmatter, return typed array
export async function loadAssets(vaultDir: FileSystemDirectoryHandle): Promise<Asset[]>
export async function loadScenarios(vaultDir: FileSystemDirectoryHandle): Promise<Scenario[]>
export async function loadECMs(vaultDir: FileSystemDirectoryHandle): Promise<ECM[]>
export async function loadPortfolios(vaultDir: FileSystemDirectoryHandle): Promise<Portfolio[]>

// Write a scenario .md back to disk (for saving computed results block)
export async function writeScenario(vaultDir: FileSystemDirectoryHandle, scenario: Scenario): Promise<void>
```

### Domain types to add to `src/engine/types.ts`

Add these (they reference the existing `EnergyMap`, `Retrofit` etc.):

```typescript
export interface Asset {
  id: string
  name: string
  country: string
  property_type: string
  gia_m2: number
  reporting_year: number
  energy: EnergyMap
  postal_code?: string
  mixed_use_split?: MixedUseSplit[]
  utility_prices?: Partial<Record<Carrier, number>>
  tags?: string[]
}

export interface Scenario {
  id: string
  name: string
  asset_id: string
  parent_scenario_id?: string
  retrofits: Retrofit[]
}

export interface ECM {
  id: string
  name: string
  category: string
  impacts: RetrofitImpact[]  // value_typical used as default
}

export interface Portfolio {
  id: string
  name: string
  asset_ids: string[]
  weighting: 'gia'
  scenario_overrides?: Record<string, string>  // asset_id → scenario_id
}
```

### Frontmatter parser (key detail)

Do NOT use gray-matter (Node.js deps cause Vite issues). Use js-yaml directly:

```typescript
import yaml from 'js-yaml'

export function parseFrontmatter(content: string): { data: Record<string, unknown>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { data: {}, body: content }
  return {
    data: (yaml.load(match[1]) as Record<string, unknown>) ?? {},
    body: match[2],
  }
}
```

### Frontmatter validation (gap #6)

Do not silently cast frontmatter to `Asset`. Validate required fields and surface errors:

```typescript
// After parsing, validate each asset:
const required = ['id', 'name', 'country', 'property_type', 'gia_m2', 'reporting_year']
for (const field of required) {
  if (!data[field]) throw new Error(`Asset in ${filename}: missing required field "${field}"`)
}
if (typeof data.gia_m2 !== 'number' || data.gia_m2 <= 0) {
  throw new Error(`Asset in ${filename}: gia_m2 must be a positive number`)
}
```

Add `loadErrors: string[]` to the Zustand store (see Step 4). Surface errors in the sidebar as a ⚠ banner. Never silently drop a file.

### Verification for Step 2

Create a sample vault at `public/sample-vault/` (see Step 3 — **do Step 3 first**, then use it to verify the loader manually in the dev server).

---

## Step 3 — Create the sample vault

These files ship with the app so new users have something to load immediately. Put them in `public/sample-vault/`.

### `public/sample-vault/assets/midtown-tower.md`

```markdown
---
doc_type: asset
asset_schema: "1.0"
id: midtown-tower
name: Midtown Tower
country: USA
postal_code: "10005"
property_type: Office
gia_m2: 7500
reporting_year: 2024
energy:
  Elec_Grid: 850000
  District_Heating: 680000
tags: [sample]
---

# Midtown Tower

Sample office asset in New York City. Used to demonstrate the CRREM stranding chart.
```

### `public/sample-vault/scenarios/midtown-do-nothing.md`

```markdown
---
doc_type: scenario
scenario_schema: "1.0"
id: midtown-do-nothing
name: Do Nothing
asset_id: midtown-tower
retrofits: []
---

# Do Nothing

Baseline scenario — no interventions. Asset is already stranded in 2024.
```

### `public/sample-vault/scenarios/midtown-led-and-heatpump.md`

```markdown
---
doc_type: scenario
scenario_schema: "1.0"
id: midtown-led-and-heatpump
name: LED + Heat Pump Retrofit
asset_id: midtown-tower
parent_scenario_id: midtown-do-nothing
retrofits:
  - id: r-led-2026
    year: 2026
    name: LED lighting retrofit
    impacts:
      - carrier: Elec_Grid
        operation: reduce
        mode: percent
        value: 18
    cost:
      capex_total: 450000
      currency: USD
  - id: r-heatpump-2028
    year: 2028
    name: Replace steam with VRF heat pumps
    impacts:
      - carrier: District_Heating
        operation: remove
        mode: absolute
        value: 0
      - carrier: Elec_Grid
        operation: add
        mode: absolute
        value: 200000
    cost:
      capex_total: 1200000
      currency: USD
---

# LED + Heat Pump Retrofit

Lights out on legacy lighting in 2026, then full electrification in 2028.
```

### `public/sample-vault/portfolios/sample-portfolio.md`

```markdown
---
doc_type: portfolio
portfolio_schema: "1.0"
id: sample-portfolio
name: Sample Portfolio
asset_ids:
  - midtown-tower
weighting: gia
---

# Sample Portfolio

Single-asset portfolio for demonstration.
```

### `public/sample-vault/ecms/led-lighting-upgrade.md`

Required for Step 5e verification (gap #2):

```markdown
---
doc_type: ecm
ecm_schema: "1.0"
id: led-lighting-upgrade
name: LED Lighting Upgrade
category: Lighting
impacts:
  - carrier: Elec_Grid
    operation: reduce
    mode: percent
    value_low: 12
    value_typical: 18
    value_high: 25
payback_years_range: [4, 7]
notes: Replace fluorescent/halogen with LED throughout. Savings depend on hours of use.
---

# LED Lighting Upgrade

Full-building LED retrofit. Typically reduces grid electricity by 15–20% depending on existing lamp stock and operational hours.
```

### Verification for Step 3

Run `npm run dev`. In Chrome, click "Open Vault" and navigate to `<repo>/public/sample-vault/` on disk (not the served URL — the FSA API reads the local filesystem). Confirm the loader reads **4 files** (1 asset, 2 scenarios, 1 portfolio, 1 ECM) without errors in the browser console.

---

## Step 4 — Zustand store

Create `src/store.ts`:

```typescript
import { create } from 'zustand'
import type { Asset, Scenario, ECM, Portfolio } from './engine/types'

interface AppState {
  vaultDir: FileSystemDirectoryHandle | null
  assets: Asset[]
  scenarios: Scenario[]
  ecms: ECM[]
  portfolios: Portfolio[]
  selectedAssetId: string | null
  activeScenarioIds: string[]   // scenarios shown on the chart (multi-line)

  setVaultDir: (dir: FileSystemDirectoryHandle) => void
  setAssets: (assets: Asset[]) => void
  setScenarios: (scenarios: Scenario[]) => void
  setECMs: (ecms: ECM[]) => void
  setPortfolios: (portfolios: Portfolio[]) => void
  selectAsset: (id: string) => void
  toggleScenario: (id: string) => void
}

// Add loadErrors to AppState interface:
//   loadErrors: string[]
//   setLoadErrors: (errors: string[]) => void

export const useStore = create<AppState>((set) => ({
  vaultDir: null,  // non-serialisable FileSystemDirectoryHandle — do NOT add persist middleware
  assets: [],
  scenarios: [],
  ecms: [],
  portfolios: [],
  selectedAssetId: null,
  activeScenarioIds: [],
  loadErrors: [],

  setVaultDir: (dir) => set({ vaultDir: dir }),
  setAssets: (assets) => set({ assets }),
  setScenarios: (scenarios) => set({ scenarios }),
  setECMs: (ecms) => set({ ecms }),
  setPortfolios: (portfolios) => set({ portfolios }),
  selectAsset: (id) => set({ selectedAssetId: id, activeScenarioIds: [] }),
  toggleScenario: (id) => set((s) => ({
    activeScenarioIds: s.activeScenarioIds.includes(id)
      ? s.activeScenarioIds.filter(x => x !== id)
      : [...s.activeScenarioIds, id],
  })),
}))
```

---

## Step 5 — UI build order

Build and verify each component before moving to the next. Do not build all at once.

### 5a. VaultPicker + shell layout

Replace `src/App.tsx` with:
- Header (already there)
- If no vault loaded: centred "Open Vault" button → calls `requestVaultDirectory()` → loads all entities into store
- If vault loaded: two-column layout — sidebar (asset list) + main area (chart/detail)
- Wrap the vault-loaded layout in a React `<ErrorBoundary>` that shows a friendly error card (not a white screen) if any loader throws.

**Browser guard (gap #4):** `showDirectoryPicker` is **Chrome/Edge desktop only** — Firefox and all iOS browsers will crash. Add this check before rendering the Open Vault button:

```tsx
const fsaSupported = 'showDirectoryPicker' in window
// If !fsaSupported, show:
// "This app requires Chrome or Edge on desktop. Firefox and Safari are not supported."
```

**Verify:** Click "Open Vault", point at `<repo>/public/sample-vault/` on disk, asset list appears in sidebar. Any bad .md files show a ⚠ banner (from `loadErrors`), not a crash.

### 5b-pre. Create `src/engine/stubProviders.ts` (gap #1)

Write this file first. It provides the EFProvider and PathwayProvider for Steps 5b–5f until the real xlsx loaders are built in Step 6. Delete the file after Step 6 is working.

```typescript
// src/engine/stubProviders.ts
// Development-only stub providers. Reproduce fixture CIs within ±0.01 kgCO₂e/m².
// EF values source: calculate.test.ts. Pathway source: worked-examples-fixtures-v1.0.json.
// DELETE this file after Step 6 (real xlsx loaders) is complete.

import type { EFProvider, PathwayProvider } from './types'
import fixtures from '../../references/worked-examples-fixtures-v1.0.json'

// 2024 EF values — static (do not vary by year). Grid EF decline is ignored until Step 6.
// Values chosen to reproduce all 4 fixture asset CIs exactly (see calculate.test.ts).
const STATIC_EF: Partial<Record<string, number>> = {
  Elec_Grid: 0.237,           // USA NY — A-001
  District_Heating: 0.20431,  // CRREM UK baseline
  District_Cooling: 0.38,     // HK — A-002
  Gas: 0.18316,               // universal (A-002, A-003)
  Oil: 0.26515,               // CRREM standard
  Biomass: 0.01550,           // CRREM standard
}

export const stubEF: EFProvider = (carrier, _region, _year) =>
  STATIC_EF[carrier] ?? 0

// Pathway: pull values for Midtown Tower (USA Office) directly from the fixture.
// This covers the sample vault. Other assets need the real xlsx (Step 6).
const A001 = fixtures.assets[0]  // Midtown Tower
type PathwayEntry = { carbon: number; eui: number }
const midtownPathway = new Map<number, PathwayEntry>(
  A001.trajectories.years.map((yr: number, i: number) => [
    yr,
    {
      carbon: A001.trajectories.pathway_curve_kgco2e_m2_yr[i],
      eui: 0,  // EUI pathway not in fixture — add from xlsx at Step 6
    },
  ])
)

export const stubPathway: PathwayProvider = (_region, _propertyType, year) => {
  const p = midtownPathway.get(year)
  return p
    ? { carbon_kgco2e_m2: p.carbon, eui_kwh_m2: p.eui }
    : { carbon_kgco2e_m2: 0, eui_kwh_m2: 0 }
}
```

Pass `stubEF` and `stubPathway` as props throughout Steps 5b–5f. Replace with real providers in Step 6.

### 5b. StrandingChart (most important component)

File: `src/components/StrandingChart.tsx`

Inputs (props):
- `asset: Asset`
- `scenarios: Scenario[]` (all scenarios for this asset — draw one line per scenario)
- `getEF: EFProvider` — pass `stubEF` from `stubProviders.ts` until Step 6
- `getPathway: PathwayProvider` — pass `stubPathway` from `stubProviders.ts` until Step 6

The chart shows:
- X axis: years 2024–2050
- Y axis: kgCO₂e/m²/yr
- One coloured line per scenario (using `projectTrajectory` from calc engine)
- One dashed grey line: CRREM pathway budget
- Vertical marker: misalignment year (first year asset line crosses pathway)
- Hover tooltip: year, CI value, pathway value

Use Plotly.js (`plotly.js-dist-min`). See Plotly React wrapper pattern.

**Verify:** Midtown Tower "Do Nothing" scenario shows CI starting at ~45.39 in 2024. Misalignment marker at 2024 (already stranded). "LED + Heat Pump" line should diverge from 2026 onward and push misalignment later.

### 5c. Timeline + retrofit editor

File: `src/components/Timeline.tsx`

- Row of year dots, 2024–2050
- Dots with retrofits show a filled circle + tooltip listing retrofit names
- Click any dot: open a drawer/modal for that year
  - If retrofits exist: list them with edit/delete buttons
  - "Add retrofit" button: form with carrier, operation, mode, value, name, capex
  - "Pick from ECM library" shortcut (hooks into Step 5e)
- On save: update scenario in store + write back to vault via `writeScenario()`
- **Write semantics (gap #7):** Save fires on drawer `onClose` or explicit "Save" button click — NOT on every `onChange` keystroke. If the drawer closes without an explicit save, prompt "Save changes?" Debouncing file writes to disk is essential.

**Verify:** Click 2026 dot on "LED + Heat Pump" scenario → drawer shows the LED retrofit. Edit the value, click Save → chart re-renders with new trajectory.

### 5d. Scenario panel

File: `src/components/ScenarioPanel.tsx`

- Lists all scenarios for the selected asset
- Checkbox to toggle each on/off in the chart (calls `toggleScenario`)
- "New scenario" button: name + "branch from" dropdown → creates new .md in vault
  - **Branch semantics (gap #5):** "Branch from" **copies** the parent's `retrofits` array verbatim into the new scenario's .md frontmatter. No runtime inheritance — `projectTrajectory` only uses `scenario.retrofits`. The new file starts pre-populated so the user edits from a copy, not from zero.
  - Set `parent_scenario_id` in the new file's frontmatter (for audit trail only — not used in computation).
- "Delete" button (soft delete — moves to trash subfolder, never permanent delete)

**Verify:** Create a new scenario, it appears in the chart overlay.

### 5e. ECM library

File: `src/components/ECMLibrary.tsx`

- Filterable list of ECMs from vault (category, property type)
- Click ECM → preview impacts
- "Apply to year" button → pre-fills retrofit form in Timeline drawer with ECM's `value_typical`
- Import button: pick a `.md` file → parse + add to vault `ecms/` folder
  - **MVP scope (gap #3):** `.zip` import requires `jszip` which is not in `package.json`. Scope MVP import to single `.md` files only. Add `.zip` support as a follow-up by running `npm install jszip @types/jszip` and handling the zip in the import handler.
- Export button: select ECMs → download as `.md` files (zip export also deferred until jszip is added)

**Verify:** Pick the LED ECM, apply to 2026, chart updates.

### 5f. Portfolio view

File: `src/components/PortfolioView.tsx`

- Dropdown to select a portfolio
- GIA-weighted chart showing portfolio CI vs portfolio pathway
- Table: each asset's CI, pathway, misalignment year, GIA weight

**Verify:** Matches MEMORY.md fixture: CI = 66.08, EUI = 177.52, misalignment = 2034.

---

## Step 6 — Real EF and pathway data from xlsx

Until Step 5 is working with hardcoded EFs, keep the hardcoded values. Once the UI is verified, add the real xlsx loaders:

- `src/vault/efLoader.ts` — parses `references/emission-factors-v2.05.xlsx` using SheetJS, returns an `EFProvider`
- `src/vault/pathwayLoader.ts` — parses `references/pathways-v2.05.xlsx`, returns a `PathwayProvider`
- `src/vault/postalCodeLoader.ts` — parses `references/postal-code-lookup-v2.05.xlsx`, maps postal code → CRREM region

**xlsx version note (gap #9):** `package.json` has `"xlsx": "^0.18.5"`. Change this to `"0.18.5"` (exact pin, no `^`). SheetJS 0.18.5 is the last MIT version; the `^` range is harmless today but exact pin is safer.

**Delete `src/engine/stubProviders.ts`** once the real loaders are verified.

**Verify:** Re-run the 4 fixture assets through the full stack (xlsx EFs → calc engine → chart). All 4 misalignment years must still match exactly. Then delete `stubProviders.ts`.

---

## Rules to follow (from CLAUDE.md)

1. **Think before coding.** State assumptions. Ask if unclear.
2. **Simplicity first.** No speculative features. No premature abstraction.
3. **Surgical changes.** Touch only what you must. Don't refactor unrelated code.
4. **Goal-driven.** Every step has a verify check. Don't mark a step done until the verify passes.

For any CRREM calculation question, the canonical source of truth is:
- `references/blueprint.md` — full methodology
- `references/worked-examples-fixtures-v1.0.json` — exact expected outputs
- `references/blueprint-schema.json` — formula graph
