import { useMemo, useState } from 'react'
import type { Asset, Scenario, Retrofit } from '../engine/types'
import { analyseScenarioCost } from '../engine/cost'
import { projectTrajectory, findMisalignmentYear, actualForYear } from '../engine/calculate'
import { efProvider, pathwayProvider } from '../engine/providers'
import { splitForAsset, regionForAsset } from '../vault/loader'

interface Props {
  asset: Asset
  scenarios: Scenario[]
  initialBaselineId?: string | null
  initialAlternativeId?: string | null
  onClose: () => void
}

interface ScenarioMetrics {
  scenario: Scenario | null
  ci2024: number
  pathway2024: number
  misalignmentYear: number | null
  totalCapex: number
  annualSavings: number | null
  paybackYears: number | null
  npv: number | null
  irr: number | null
  retrofits: Retrofit[]
  currency: string | null
}

function metricsFor(asset: Asset, scenario: Scenario | null): ScenarioMetrics {
  const region = regionForAsset(asset)
  const split = splitForAsset(asset)
  const traj = projectTrajectory({
    baseEnergy: asset.energy,
    gia: asset.gia_m2,
    getEF: efProvider,
    getPathway: pathwayProvider,
    region,
    split,
    retrofits: scenario?.retrofits ?? [],
    startYear: 2024,
    endYear: 2050,
    getActual: (year) => actualForYear(asset.actuals, year),
    renewableDegradationPctPerYear: asset.renewable_degradation_pct_per_year,
  })
  const misalignmentYear = findMisalignmentYear(traj).co2
  const cost = analyseScenarioCost(asset, scenario?.retrofits ?? [])
  return {
    scenario,
    ci2024: traj[0].metrics.carbon_intensity_kgco2e_m2,
    pathway2024: traj[0].pathway.carbon_kgco2e_m2,
    misalignmentYear,
    totalCapex: cost.totalCapex,
    annualSavings: cost.totalAnnualSavings,
    paybackYears: cost.averagePaybackYears,
    npv: cost.npv,
    irr: cost.irr,
    retrofits: scenario?.retrofits ?? [],
    currency: cost.currency,
  }
}

interface RetrofitDiff {
  name: string
  year: number
  status: 'added' | 'removed' | 'unchanged' | 'changed'
  baseline: Retrofit | null
  alternative: Retrofit | null
}

function diffRetrofits(base: Retrofit[], alt: Retrofit[]): RetrofitDiff[] {
  const out: RetrofitDiff[] = []
  const byKey = (r: Retrofit) => `${r.year}::${r.name}`
  const baseMap = new Map(base.map(r => [byKey(r), r]))
  const altMap = new Map(alt.map(r => [byKey(r), r]))
  const seen = new Set<string>()

  // Walk in chronological order across union
  const all = [...base, ...alt].sort((a, b) => a.year - b.year || a.name.localeCompare(b.name))
  for (const r of all) {
    const k = byKey(r)
    if (seen.has(k)) continue
    seen.add(k)
    const b = baseMap.get(k) ?? null
    const a = altMap.get(k) ?? null
    let status: RetrofitDiff['status']
    if (b && !a) status = 'removed'
    else if (a && !b) status = 'added'
    else if (b && a && JSON.stringify(b.impacts) === JSON.stringify(a.impacts)
          && (b.cost?.capex_total ?? 0) === (a.cost?.capex_total ?? 0)) status = 'unchanged'
    else status = 'changed'
    out.push({ name: r.name, year: r.year, status, baseline: b, alternative: a })
  }
  return out
}

function fmtMoney(n: number | null, currency: string | null): string {
  if (n === null) return '—'
  const c = currency ?? ''
  return `${c} ${Math.round(n).toLocaleString()}`.trim()
}

function fmtDelta(value: number | null, baseline: number | null, currency: string | null, opts: { invertColor?: boolean; pct?: boolean } = {}): { text: string; tone: 'green' | 'red' | 'neutral' } {
  if (value === null || baseline === null) return { text: '—', tone: 'neutral' }
  const delta = value - baseline
  if (Math.abs(delta) < 1e-3) return { text: '±0', tone: 'neutral' }
  const sign = delta > 0 ? '+' : ''
  const text = opts.pct
    ? `${sign}${delta.toFixed(1)}%`
    : currency
      ? `${sign}${currency} ${Math.round(delta).toLocaleString()}`
      : `${sign}${Math.round(delta).toLocaleString()}`
  // Default: lower is better (CI, capex, payback). invertColor=true for things where higher = better (savings, NPV, IRR).
  const isBetter = opts.invertColor ? delta > 0 : delta < 0
  return { text, tone: isBetter ? 'green' : 'red' }
}

function fmtYearDelta(alt: number | null, base: number | null): { text: string; tone: 'green' | 'red' | 'neutral' } {
  if (alt === null && base === null) return { text: '±0 yr', tone: 'neutral' }
  if (alt === null) return { text: 'never', tone: 'green' }
  if (base === null) return { text: 'now misaligned', tone: 'red' }
  const d = alt - base
  if (d === 0) return { text: '±0 yr', tone: 'neutral' }
  return { text: `${d > 0 ? '+' : ''}${d} yr`, tone: d > 0 ? 'green' : 'red' }
}

export default function ScenarioCompare({ asset, scenarios, initialBaselineId, initialAlternativeId, onClose }: Props) {
  const [baselineId, setBaselineId] = useState<string>(initialBaselineId ?? scenarios[0]?.id ?? '')
  const [altId, setAltId] = useState<string>(
    initialAlternativeId ?? scenarios.find(s => s.id !== (initialBaselineId ?? scenarios[0]?.id))?.id ?? '',
  )

  const baseline = useMemo(() => scenarios.find(s => s.id === baselineId) ?? null, [scenarios, baselineId])
  const alternative = useMemo(() => scenarios.find(s => s.id === altId) ?? null, [scenarios, altId])

  const baselineM = useMemo(() => metricsFor(asset, baseline), [asset, baseline])
  const alternativeM = useMemo(() => metricsFor(asset, alternative), [asset, alternative])

  const retrofitDiffs = useMemo(
    () => diffRetrofits(baselineM.retrofits, alternativeM.retrofits),
    [baselineM.retrofits, alternativeM.retrofits],
  )

  const currency = alternativeM.currency ?? baselineM.currency

  const Row = ({ label, base, alt, fmt }: {
    label: string
    base: string
    alt: string
    fmt: { text: string; tone: 'green' | 'red' | 'neutral' }
  }) => (
    <tr className="border-t border-slate-100">
      <td className="px-3 py-2 text-sm text-slate-700">{label}</td>
      <td className="px-3 py-2 text-sm text-right tabular-nums text-slate-700">{base}</td>
      <td className="px-3 py-2 text-sm text-right tabular-nums text-slate-700">{alt}</td>
      <td className={`px-3 py-2 text-sm text-right tabular-nums font-medium ${
        fmt.tone === 'green' ? 'text-emerald-600' : fmt.tone === 'red' ? 'text-red-600' : 'text-slate-400'
      }`}>{fmt.text}</td>
    </tr>
  )

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-crrem-navy">
          <div>
            <h3 className="text-base font-semibold text-white">Compare scenarios — {asset.name}</h3>
            <p className="text-xs text-white/60 mt-0.5">Side-by-side delta. Picks any two scenarios on this asset.</p>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-slate-500 mb-1 block">Baseline</label>
              <select
                value={baselineId}
                onChange={e => setBaselineId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
              >
                <option value="">— do nothing —</option>
                {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-slate-500 mb-1 block">Alternative</label>
              <select
                value={altId}
                onChange={e => setAltId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
              >
                <option value="">— do nothing —</option>
                {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-slate-500">Metric</th>
                  <th className="px-3 py-2 text-right text-xs uppercase tracking-wider text-slate-500">{baseline?.name ?? 'do nothing'}</th>
                  <th className="px-3 py-2 text-right text-xs uppercase tracking-wider text-slate-500">{alternative?.name ?? 'do nothing'}</th>
                  <th className="px-3 py-2 text-right text-xs uppercase tracking-wider text-slate-500">Δ</th>
                </tr>
              </thead>
              <tbody>
                <Row
                  label="Carbon intensity 2024 (kgCO₂e/m²)"
                  base={baselineM.ci2024.toFixed(2)}
                  alt={alternativeM.ci2024.toFixed(2)}
                  fmt={fmtDelta(alternativeM.ci2024, baselineM.ci2024, null)}
                />
                <Row
                  label="Misalignment year"
                  base={baselineM.misalignmentYear?.toString() ?? 'never'}
                  alt={alternativeM.misalignmentYear?.toString() ?? 'never'}
                  fmt={fmtYearDelta(alternativeM.misalignmentYear, baselineM.misalignmentYear)}
                />
                <Row
                  label="Total capex"
                  base={fmtMoney(baselineM.totalCapex, currency)}
                  alt={fmtMoney(alternativeM.totalCapex, currency)}
                  fmt={fmtDelta(alternativeM.totalCapex, baselineM.totalCapex, currency)}
                />
                <Row
                  label="Annual savings"
                  base={fmtMoney(baselineM.annualSavings, currency)}
                  alt={fmtMoney(alternativeM.annualSavings, currency)}
                  fmt={fmtDelta(alternativeM.annualSavings, baselineM.annualSavings, currency, { invertColor: true })}
                />
                <Row
                  label="Avg payback (yr)"
                  base={baselineM.paybackYears?.toFixed(1) ?? '—'}
                  alt={alternativeM.paybackYears?.toFixed(1) ?? '—'}
                  fmt={fmtDelta(alternativeM.paybackYears, baselineM.paybackYears, null)}
                />
                <Row
                  label="NPV"
                  base={fmtMoney(baselineM.npv, currency)}
                  alt={fmtMoney(alternativeM.npv, currency)}
                  fmt={fmtDelta(alternativeM.npv, baselineM.npv, currency, { invertColor: true })}
                />
                <Row
                  label="IRR (%)"
                  base={baselineM.irr?.toFixed(1) ?? '—'}
                  alt={alternativeM.irr?.toFixed(1) ?? '—'}
                  fmt={fmtDelta(alternativeM.irr, baselineM.irr, null, { invertColor: true, pct: true })}
                />
              </tbody>
            </table>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Retrofit diff</h4>
            {retrofitDiffs.length === 0 ? (
              <p className="text-xs text-slate-400 italic px-3 py-4 text-center border border-slate-200 rounded-lg">
                Both scenarios have no retrofits.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {retrofitDiffs.map((d, i) => (
                  <li
                    key={i}
                    className={`text-sm px-3 py-2 rounded-lg flex items-center gap-2 ${
                      d.status === 'added' ? 'bg-emerald-50 border border-emerald-200'
                        : d.status === 'removed' ? 'bg-red-50 border border-red-200'
                        : d.status === 'changed' ? 'bg-amber-50 border border-amber-200'
                        : 'bg-slate-50 border border-slate-200'
                    }`}
                  >
                    <span className={`text-xs uppercase font-semibold tracking-wider ${
                      d.status === 'added' ? 'text-emerald-700'
                        : d.status === 'removed' ? 'text-red-700'
                        : d.status === 'changed' ? 'text-amber-700'
                        : 'text-slate-500'
                    }`}>
                      {d.status === 'added' ? '+ added' : d.status === 'removed' ? '− removed' : d.status === 'changed' ? '~ changed' : '= same'}
                    </span>
                    <span className="text-slate-700">
                      {d.year} · {d.name}
                    </span>
                    {d.status === 'changed' && d.baseline && d.alternative && (
                      <span className="text-xs text-slate-500 ml-auto">
                        capex {(d.baseline.cost?.capex_total ?? 0).toLocaleString()} → {(d.alternative.cost?.capex_total ?? 0).toLocaleString()}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="text-xs text-slate-400 text-right pt-2 border-t border-slate-100">
            Lower CI / capex / payback is better (green). Higher savings / NPV / IRR is better (green). Misalignment year delta: positive = pushed later (good).
          </div>
        </div>
      </div>
    </div>
  )
}
