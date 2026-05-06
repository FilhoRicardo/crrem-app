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
  engine/          # Pure-TS CRREM calc engine (no React deps)
    types.ts       # Domain types: Carrier, EnergyMap, Retrofit, YearMetrics …
    calculate.ts   # calculateYearMetrics, projectTrajectory, findMisalignmentYear …
    calculate.test.ts  # 18 Vitest tests — validates against 4 fixture assets + portfolio
  vault/           # (next) File System Access API loader + js-yaml parser
  store.ts         # (next) Zustand app state
  App.tsx          # Shell placeholder

references/        # CRREM source data (xlsx + json + md schemas)
  worked-examples-fixtures-v1.0.json   ← validation oracle for the calc engine
  pathways-v2.05.xlsx
  emission-factors-v2.05.xlsx
  blueprint.md     ← full CRREM methodology spec
  ecm-schema-v1.0.md
  asset-schema-v1.0.md
  scenario-schema-v1.0.md
  portfolio-schema-v1.0.md
```

## Key documents

- **`CLAUDE.md`** — coding guidelines + CRREM calculation rules (read before touching any code)
- **`MEMORY.md`** — full session state, locked decisions, pending tasks
- **`AGENT-HANDOFF.md`** — step-by-step playbook for the next dev/agent session
