# TODOs

Living list of deferred work. Anything mentioned in a commit message or
discussion that isn't immediately implemented should land here, not in
human memory.

## Now in flight

(none — see CHANGELOG / git log for what just shipped)

## Shipped

- [x] Real xlsx pathway + EF loader — full CRREM v2.05 coverage (116 region × 1497 region/property combos)
- [x] CSV bulk-import for monthly actuals (one-row-per-month per file)
- [x] CSV bulk-import for assets (one row per asset)
- [x] PDF assessment report export per asset + per portfolio (chart embedded as PNG)
- [x] Cost & payback engine — utility_prices × energy delta → opex savings + payback period
- [x] NPV / IRR / discounted payback — full cost-of-capital aware finance
- [x] Energy-price escalation — utility_prices.escalation_pct_per_year applied compoundingly
- [x] Renewable degradation — opt-in PV loss factor per asset
- [x] HDD/CDD climate adjustment — 30 EU countries, RCP 4.5 / 8.5 scenarios
- [x] Embodied carbon for retrofits — one-time install footprint
- [x] Scenario comparison view — side-by-side delta + retrofit diff
- [x] Vault focus-rescan watcher — auto-reload when window regains focus
- [x] Properties / scenarios / portfolios CRUD with save-back
- [x] Test coverage — 109 vitest passing across engine / cost / climate / store / loader
- [x] TODOS.md + ASCII data-flow diagram in MEMORY.md

## Next round

- [ ] **Retrofit lifetime + replacement modelling** — heat pumps replaced at ~15yr, LEDs ~10yr, etc. Without it, a 2026 heat pump pretends to keep working past 2050 with zero re-capex.
- [ ] **NUTS-3 ZIP-level HDD/CDD** — bundled xlsx has 363k ZIP-level rows; we use the 30 country aggregates only. Coastal vs alpine France diverge a lot.
- [ ] **Sensitivity analysis** — slider for utility-price ±20%, capex ±20%, discount rate ±2pp; recompute NPV/IRR live.
- [ ] **MACC chart** — Marginal Abatement Cost Curve (£/tCO₂ avoided per retrofit, sorted)
- [ ] **Async lazy-load `crrem-data.js`** — first-paint optimization (currently 2.8 MB inlined into bundle)
- [ ] **Retrofit cost auto-fill from ECM** — applying an ECM should propagate `embodied_carbon_kg_per_m2 × asset.gia_m2` and `capex_per_m2_typical × gia_m2` into the new retrofit.

## Known yellow flags

- `RetrofitDrawer.tsx` — `JSON.stringify` dirty-check is O(n) per render. Fine ≤20 retrofits, replace with structural compare beyond that.
- `ECMLibrary.tsx` Apply-to-year flow uses a `window.dispatchEvent(CustomEvent)` bus → AssetDetail listener. Works but couples the two. Refactor candidate if a third subscriber appears.
- ZIP `crrem-data.js` chunk is 2.8 MB — see lazy-load TODO.
- No component-level tests (engine + store + loader covered; React components are type-checked + browser-QA'd only).

## Deferred indefinitely

- [ ] **ECM .zip import/export** — bundle requires `jszip` dep. MVP supports single .md only. Add when a user actually needs it.
- [ ] **Observability** — analytics / error reporting. Not needed for single-user. Will be needed the moment we go multi-tenant.
- [ ] **Multi-tenant cloud vault** — out of scope per CEO review. Vault-on-disk is the design.

## Process notes

- Every commit pushes to `main` and triggers Vercel auto-deploy.
- `gstack` is required for AI-assisted work in this repo (`.claude/hooks/check-gstack.sh` enforces). Install: `git clone --depth 1 https://github.com/garrytan/gstack ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup --team`.
- New deferred items always land here in the same commit as the deferral.
- When in doubt about scope: re-read `MEMORY.md` § "What this app does" — single-user, vault-on-disk admin tool, optimised for shipping the actual deliverable (CRREM-aligned PDF report) for an LP.

## Security posture (formerly "threat model write-up")

- All user vault data is local-only via the File System Access API. The browser is the only thing that ever reads or writes the .md files; no server roundtrip, no upload.
- Sample-vault demo mode fetches read-only files from the same origin as the app (`/sample-vault/*.md`) and treats them as immutable.
- The app makes zero outbound network requests after first paint (no analytics, no telemetry, no auto-update). PWA service worker only caches static assets.
- Vercel hosts the static SPA; no server-side state. Vercel deploy logs are the only off-device data.
- gstack hook (`PreToolUse:Skill`) blocks AI tools when `~/.claude/skills/gstack/bin` is missing. Local-only enforcement, never affects the running app.
