# CRREM Admin App

Retrofit-planning tool for CRREM (Carbon Risk Real Estate Monitor) assessments.

Load a building asset → see its carbon intensity trajectory vs the CRREM decarbonisation pathway (2024–2050) → click any year on the timeline to add, edit or remove retrofits → the app recomputes the trajectory and revised misalignment year in real time. Save multiple scenarios, compare them side-by-side, track capex and payback.

Everything is stored as Obsidian-compatible `.md` files with YAML frontmatter. No backend. No database. The user points the app at a local folder — the folder *is* the database.

## Stack

| Layer | Choice |
|-------|--------|
| UI | React 18 + TypeScript |
| Build | Vite |
| Styling | Tailwind CSS |
| State | Zustand |
| Charts | Plotly.js |
| YAML | js-yaml |
| Excel parsing | SheetJS Community |
| Tests | Vitest |
| Hosting | Vercel (free tier, no backend) |
| Local data | File System Access API (Chrome/Edge) |
| PWA | vite-plugin-pwa |

## Getting started

```bash
git clone https://github.com/FilhoRicardo/crrem-app.git
cd crrem-app
npm install
npm run dev        # dev server at localhost:5173
npx vitest run     # run calc engine tests (must pass before any UI work)
```

## Project layout

```
src/
  engine/                # Pure-TS CRREM calc engine (no React deps)
    types.ts             # Domain types: Carrier, EnergyMap, Retrofit, Asset, Scenario, ECM, Portfolio …
    calculate.ts         # calculateYearMetrics, projectTrajectory, findMisalignmentYear …
    calculate.test.ts    # 20 Vitest tests — validates against 4 fixture assets + portfolio
    providers.ts         # EF + pathway providers (back-derived from fixture trajectories)
  vault/
    loader.ts            # FSA + js-yaml loader, validation, write/delete API, sample-vault fetch
    fsa.d.ts             # File System Access API ambient declarations
  components/
    App shell + Header + VaultPicker + ErrorBoundary + LoadErrorBanner
    AssetList + AssetDetail + StrandingChart + Timeline + RetrofitDrawer
    ScenarioPanel + ECMLibrary + PortfolioView
  store.ts               # Zustand app state (vault, assets, scenarios, ECMs, selection, save actions)
  App.tsx                # Top-level shell with vault gate + view router
  main.tsx               # React entry

public/
  sample-vault/          # Bundled demo vault — accessible via "Try with sample" without FSA
    assets/midtown-tower.md
    scenarios/midtown-do-nothing.md, midtown-led-and-heatpump.md
    ecms/led-lighting-upgrade.md, rooftop-pv.md, air-source-heat-pump.md
    portfolios/sample-portfolio.md

references/              # CRREM source data (xlsx + json + md schemas, NOT shipped)
  worked-examples-fixtures-v1.0.json   ← validation oracle for the calc engine + providers
  pathways-v2.05.xlsx
  emission-factors-v2.05.xlsx
  blueprint.md
  ecm-schema-v1.0.md
  asset-schema-v1.0.md, scenario-schema-v1.0.md, portfolio-schema-v1.0.md
```

## Vault structure

The user picks a folder on disk; the app expects this layout:

```
my-portfolio-vault/
├── assets/<id>.md      # one .md per building, YAML frontmatter + free-form notes
├── scenarios/<id>.md   # one .md per scenario; references asset_id
├── ecms/<id>.md        # ECM library (importable / exportable)
├── portfolios/<id>.md  # GIA-weighted rollups
└── trash/              # auto-created when scenarios are deleted (soft-delete)
```

A working example lives in `public/sample-vault/`. Open it directly with "Try sample" or copy the folder anywhere on disk and pick it via "Open vault folder".

## Browser support

The "Open vault folder" flow uses the **File System Access API**, which today is Chrome and Edge desktop only. Firefox and Safari users can still try the read-only sample vault.

## Deploying to Vercel

```bash
npm i -g vercel       # one-off, if you don't have it
vercel                # link the repo + deploy a preview
vercel --prod         # ship to production
```

Or push the repo to GitHub and import it from the Vercel dashboard — `vercel.json` already declares the framework, build command, output directory and SPA rewrite rules.

The build is fully static (no backend, no env vars required). Free-tier hosting is sufficient.

## Key documents

- **`CLAUDE.md`** — coding guidelines + CRREM calculation rules
- **`MEMORY.md`** — full session state, locked decisions, pending tasks
- **`AGENT-HANDOFF.md`** — step-by-step playbook for the next dev/agent session
