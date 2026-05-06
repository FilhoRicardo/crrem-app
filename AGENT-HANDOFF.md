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

### Verification for Step 2

Create a sample vault at `public/sample-vault/` (see Step 3 — do this first, then use it to verify the loader manually in the dev server).

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

### Verification for Step 3

Load the sample vault in the running dev server (`npm run dev`). Confirm the loader reads all 3 files without errors. Check browser console.

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

export const useStore = create<AppState>((set) => ({
  vaultDir: null,
  assets: [],
  scenarios: [],
  ecms: [],
  portfolios: [],
  selectedAssetId: null,
  activeScenarioIds: [],

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

**Verify:** Click "Open Vault", point at `public/sample-vault/`, asset list appears in sidebar.

### 5b. StrandingChart (most important component)

File: `src/components/StrandingChart.tsx`

Inputs (props):
- `asset: Asset`
- `scenarios: Scenario[]` (all scenarios for this asset — draw one line per scenario)
- `getEF: EFProvider` — for now, hard-code 2024 EF values from the fixture (real xlsx loading comes later)
- `getPathway: PathwayProvider` — same, hard-code fixture pathway values for now

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

**Verify:** Click 2026 dot on "LED + Heat Pump" scenario → drawer shows the LED retrofit. Edit the value → chart re-renders with new trajectory.

### 5d. Scenario panel

File: `src/components/ScenarioPanel.tsx`

- Lists all scenarios for the selected asset
- Checkbox to toggle each on/off in the chart (calls `toggleScenario`)
- "New scenario" button: name + "branch from" dropdown → creates new .md in vault
- "Delete" button (soft delete — moves to trash subfolder, never permanent delete)

**Verify:** Create a new scenario, it appears in the chart overlay.

### 5e. ECM library

File: `src/components/ECMLibrary.tsx`

- Filterable list of ECMs from vault (category, property type)
- Click ECM → preview impacts
- "Apply to year" button → pre-fills retrofit form in Timeline drawer with ECM's `value_typical`
- Import button: pick a .md or .zip of .md files → parse + add to vault ecms/ folder
- Export button: select ECMs → download as .zip

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

**Verify:** Re-run the 4 fixture assets through the full stack (xlsx EFs → calc engine → chart). All 4 misalignment years must still match exactly.

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
