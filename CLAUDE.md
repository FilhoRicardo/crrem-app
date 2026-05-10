# CRREM Admin App — Claude Code Instructions

## Project Overview

This is an admin tool for running CRREM (Carbon Risk Real Estate Monitor) assessments. It calculates energy and carbon intensity for real estate assets and portfolios, compares them against CRREM decarbonisation pathways, and identifies misalignment years (first year an asset exceeds its pathway).

### Key Reference Files (in `references/`)

| File | Purpose |
|------|---------|
| `blueprint.md` | Full CRREM methodology spec — the canonical source of truth for all calculations |
| `blueprint-schema.json` | JSON Schema with 16 formula steps, 7 edge cases, pathway resolution rules |
| `worked-examples-fixtures-v1.0.json` | 4 reference assets + portfolio rollup with exact expected outputs (use to validate math) |
| `pathways-v2.05.xlsx` | Carbon/energy budgets by region × property type × year (2020–2050) |
| `emission-factors-v2.05.xlsx` | Grid EFs per country/year; static EFs for other carriers |
| `postal-code-lookup-v2.05.xlsx` | ZIP/FSA/postcode → CRREM region (USA, Canada, Australia) |
| `hdd-cdd-eu-v2.05.xlsx` | Optional climate adjustment projections (HDD/CDD by scenario) |
| `assessment-guide-v1.01.pdf` | User-facing assessment guide |
| `technical-blueprint-v1.0.xlsx` | Technical blueprint in spreadsheet form |
| `worked-examples-v1.0.xlsx` | Worked examples in spreadsheet form |

### CRREM Calculation Rules (non-negotiable — from blueprint)

- **EUI** = Total energy (all carriers + consumed renewables, excluding exported) ÷ GIA
- **Grid export credit** = `MIN(Renew_Exported × EF_Elec, Elec_Grid × EF_Elec)` — cannot offset non-electric fuels
- **On-site renewables**: consumed ones count toward EUI but carry EF = 0 for carbon
- **Mixed-use**: blend pathways year-by-year (weighted by floor-area %) — never a single static row
- **Pathway resolution**: country → sub-national postcode (USA/CAN/AUS only) → region × property type lookup
- **Forward projection**: energy demand stays flat; grid EFs decline annually; all other EFs static
- **Portfolio**: GIA-weighted aggregation of all asset metrics
- **DH/DC legacy fallback**: scale UK baseline (0.20431 kgCO₂e/kWh) against local grid trajectory

### Validation Targets (from `worked-examples-fixtures-v1.0.json`)

Any calculation engine must reproduce these exactly:

| Asset | Carbon Intensity 2024 | Misalignment Year |
|-------|----------------------|-------------------|
| Midtown Tower (NY, Office, 7 500 m²) | 45.39 kgCO₂e/m² | 2024 |
| Pacific Plaza Mall (HK, Shopping Centre, 22 000 m²) | 106.62 kgCO₂e/m² | 2036 |
| Northgate Quarter (London, Mixed Use 65/35, 12 000 m²) | 20.20 kgCO₂e/m² | 2036 |
| Eastfield Logistics Park (Sydney, Warehouse, 15 000 m²) | 53.68 kgCO₂e/m² | 2028 |
| **Portfolio (56 500 m²)** | **66.08 kgCO₂e/m²** | **2034** |

Tolerances: ±0.5 kgCO₂e/m²/yr carbon, ±1.0 kWh/m²/yr EUI, **exact** misalignment year.

---

## Behavioral Guidelines

*Derived from Karpathy's observations on LLM coding pitfalls.*

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Implement EUI calculation" → "Reproduce Midtown Tower EUI = 204 kWh/m² from fixtures"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

For CRREM calculations specifically: always verify against `worked-examples-fixtures-v1.0.json` before marking any calculation step complete.

## gstack (REQUIRED — global install)

**Before doing ANY work, verify gstack is installed:**

```bash
test -d ~/.claude/skills/gstack/bin && echo "GSTACK_OK" || echo "GSTACK_MISSING"
```

If GSTACK_MISSING: STOP. Do not proceed. Tell the user:

> gstack is required for all AI-assisted work in this repo.
> Install it:
> ```bash
> git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
> cd ~/.claude/skills/gstack && ./setup --team
> ```
> Then restart your AI coding tool.

Do not skip skills, ignore gstack errors, or work around missing gstack.

Using gstack skills: After install, skills like /qa, /ship, /review, /investigate,
and /browse are available. Use /browse for all web browsing.
Use ~/.claude/skills/gstack/... for gstack file paths (the global path).
