# TODOs

Living list of deferred work. Anything mentioned in a commit message or
discussion that isn't immediately implemented should land here, not in
human memory.

## Now in flight

(none — see CHANGELOG / git log for what just shipped)

## Next round (CEO-review-accepted scope)

- [x] Real xlsx pathway + EF loader — full CRREM coverage (44 countries × 18 property types) instead of 4 fixture combos. **Ships with the round this TODO file lands in.**
- [x] CSV bulk-import for monthly actuals (one-row-per-month per file)
- [x] PDF assessment report export per asset + per portfolio
- [x] Cost & payback engine — utility_prices × energy delta → opex savings + payback period per retrofit
- [x] Vault focus-rescan watcher — auto-reload when window regains focus
- [x] TODOS.md + ASCII data-flow diagram in MEMORY.md

## Deferred to v2

- [ ] Climate-adjusted projections using `references/hdd-cdd-eu-v2.05.xlsx` — CRREM v2.05 ships HDD/CDD scenarios; the engine ignores them.
- [ ] Bulk asset import — drop a folder of N `.md` files at once. (Single-file import works today; FSA's `showDirectoryPicker` makes the user point at the parent folder anyway.)
- [ ] Renewable degradation — PV ~0.5%/yr loss factor on `Renew_Consumed`/`Renew_Exported`.
- [ ] Energy price escalation — utility_prices × inflation curve for forward opex.
- [ ] Retrofit lifetime + replacement modelling — heat pumps replaced at 15yr, etc.
- [ ] ECM .zip import/export — bundle requires `jszip` dep. MVP supports single .md only.
- [ ] Threat model write-up — vault contents stay in browser, but we should document the security posture explicitly.
- [ ] Loader / store / component test coverage — engine has 20/20; everything else is type-checked + manually QA'd.
- [ ] Observability — analytics/error reporting; not needed for single-user, will be needed for multi-user.

## Known yellow flags

- `RetrofitDrawer.tsx:166` — `JSON.stringify` dirty-check is O(n) per render. Fine ≤20 retrofits, replace with structural compare beyond that.
- `ECMLibrary.tsx` Apply-to-year flow uses a `window.dispatchEvent(CustomEvent)` bus → AssetDetail listener. Works but couples the two. Refactor candidate if a third subscriber appears.

## Process notes

- Every commit pushes to `main` and triggers Vercel auto-deploy.
- `gstack` is required for AI-assisted work in this repo (`.claude/hooks/check-gstack.sh` enforces). Install: `git clone --depth 1 https://github.com/garrytan/gstack ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup --team`.
- New deferred items always land here in the same commit as the deferral.
