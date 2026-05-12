import { useMemo, useState } from 'react'
import type { Asset, Scenario } from '../engine/types'
import { summariseAsset, flagForCountry } from '../engine/summary'
import { useStore } from '../store'

interface Props {
  initialLeftId?: string | null
  initialRightId?: string | null
  onClose: () => void
}

interface Snapshot {
  asset: Asset
  scenario: Scenario | null
  ci: number
  pathway: number
  stranded: boolean
  misalignmentYear: number | null
  scenarioCapex: number
  totalEnergyKwh: number
  carriers: string[]
}

function snapshotFor(asset: Asset, scenario: Scenario | null): Snapshot {
  const summary = summariseAsset(asset, scenario ?? undefined)
  const totalEnergyKwh = (Object.values(asset.energy) as number[]).reduce((s, v) => s + (v ?? 0), 0)
  return {
    asset,
    scenario,
    ci: summary.ci,
    pathway: summary.pathway,
    stranded: summary.stranded,
    misalignmentYear: summary.misalignmentYear,
    scenarioCapex: summary.scenarioCapex,
    totalEnergyKwh,
    carriers: Object.keys(asset.energy),
  }
}

function fmtNum(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString(undefined, { maximumFractionDigits: digits })
}

function fmtDelta(left: number | null, right: number | null, opts: { invert?: boolean; pct?: boolean } = {}): { text: string; tone: 'green' | 'red' | 'neutral' } {
  if (left === null || right === null) return { text: '—', tone: 'neutral' }
  const delta = right - left
  if (Math.abs(delta) < 1e-3) return { text: '±0', tone: 'neutral' }
  const sign = delta > 0 ? '+' : ''
  const text = opts.pct ? `${sign}${delta.toFixed(1)}%` : `${sign}${fmtNum(delta)}`
  const isBetter = opts.invert ? delta > 0 : delta < 0
  return { text, tone: isBetter ? 'green' : 'red' }
}

function fmtYearDelta(left: number | null, right: number | null): { text: string; tone: 'green' | 'red' | 'neutral' } {
  if (left === null && right === null) return { text: '±0 yr', tone: 'neutral' }
  if (left === null) return { text: 'right misaligns', tone: 'red' }
  if (right === null) return { text: 'right never misaligns', tone: 'green' }
  const d = right - left
  if (d === 0) return { text: '±0 yr', tone: 'neutral' }
  return { text: `${d > 0 ? '+' : ''}${d} yr`, tone: d > 0 ? 'green' : 'red' }
}

export default function AssetCompare({ initialLeftId, initialRightId, onClose }: Props) {
  const allAssets = useStore(s => s.assets)
  const allScenarios = useStore(s => s.scenarios)
  const [leftId, setLeftId] = useState<string>(initialLeftId ?? allAssets[0]?.id ?? '')
  const [rightId, setRightId] = useState<string>(
    initialRightId ?? allAssets.find(a => a.id !== (initialLeftId ?? allAssets[0]?.id))?.id ?? '',
  )

  const left = useMemo(() => allAssets.find(a => a.id === leftId) ?? null, [allAssets, leftId])
  const right = useMemo(() => allAssets.find(a => a.id === rightId) ?? null, [allAssets, rightId])

  // Use the first scenario for each asset (sidebar always shows do-nothing CI)
  const leftScenario = useMemo(
    () => left ? (allScenarios.find(s => s.asset_id === left.id) ?? null) : null,
    [allScenarios, left],
  )
  const rightScenario = useMemo(
    () => right ? (allScenarios.find(s => s.asset_id === right.id) ?? null) : null,
    [allScenarios, right],
  )

  const leftSnap = useMemo(() => left ? snapshotFor(left, leftScenario) : null, [left, leftScenario])
  const rightSnap = useMemo(() => right ? snapshotFor(right, rightScenario) : null, [right, rightScenario])

  const Row = ({ label, leftVal, rightVal, fmt }: {
    label: string
    leftVal: string
    rightVal: string
    fmt: { text: string; tone: 'green' | 'red' | 'neutral' }
  }) => (
    <tr className="border-t border-slate-100">
      <td className="px-3 py-2 text-sm text-slate-700">{label}</td>
      <td className="px-3 py-2 text-sm text-right tabular-nums text-slate-700">{leftVal}</td>
      <td className="px-3 py-2 text-sm text-right tabular-nums text-slate-700">{rightVal}</td>
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
            <h3 className="text-base font-semibold text-white">Compare assets</h3>
            <p className="text-xs text-white/60 mt-0.5">
              Side-by-side CI / pathway / misalignment / capex deltas. Uses each asset's first scenario.
            </p>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-slate-500 mb-1 block">Asset A</label>
              <select
                value={leftId}
                onChange={e => setLeftId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
              >
                {allAssets.map(a => <option key={a.id} value={a.id}>{flagForCountry(a.country)} {a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-slate-500 mb-1 block">Asset B</label>
              <select
                value={rightId}
                onChange={e => setRightId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
              >
                {allAssets.map(a => <option key={a.id} value={a.id}>{flagForCountry(a.country)} {a.name}</option>)}
              </select>
            </div>
          </div>

          {leftSnap && rightSnap && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-slate-500">Metric</th>
                    <th className="px-3 py-2 text-right text-xs uppercase tracking-wider text-slate-500">{flagForCountry(leftSnap.asset.country)} {leftSnap.asset.name}</th>
                    <th className="px-3 py-2 text-right text-xs uppercase tracking-wider text-slate-500">{flagForCountry(rightSnap.asset.country)} {rightSnap.asset.name}</th>
                    <th className="px-3 py-2 text-right text-xs uppercase tracking-wider text-slate-500">Δ (B − A)</th>
                  </tr>
                </thead>
                <tbody>
                  <Row
                    label="GIA (m²)"
                    leftVal={fmtNum(leftSnap.asset.gia_m2)}
                    rightVal={fmtNum(rightSnap.asset.gia_m2)}
                    fmt={fmtDelta(leftSnap.asset.gia_m2, rightSnap.asset.gia_m2, { invert: true })}
                  />
                  <Row
                    label="Property type"
                    leftVal={leftSnap.asset.property_type}
                    rightVal={rightSnap.asset.property_type}
                    fmt={{ text: '', tone: 'neutral' }}
                  />
                  <Row
                    label="Country"
                    leftVal={leftSnap.asset.country}
                    rightVal={rightSnap.asset.country}
                    fmt={{ text: '', tone: 'neutral' }}
                  />
                  <Row
                    label="Total energy (kWh/yr)"
                    leftVal={fmtNum(leftSnap.totalEnergyKwh)}
                    rightVal={fmtNum(rightSnap.totalEnergyKwh)}
                    fmt={fmtDelta(leftSnap.totalEnergyKwh, rightSnap.totalEnergyKwh)}
                  />
                  <Row
                    label="EUI (kWh/m²/yr)"
                    leftVal={fmtNum(leftSnap.totalEnergyKwh / leftSnap.asset.gia_m2, 1)}
                    rightVal={fmtNum(rightSnap.totalEnergyKwh / rightSnap.asset.gia_m2, 1)}
                    fmt={fmtDelta(leftSnap.totalEnergyKwh / leftSnap.asset.gia_m2, rightSnap.totalEnergyKwh / rightSnap.asset.gia_m2)}
                  />
                  <Row
                    label="Carbon intensity (kgCO₂e/m²/yr)"
                    leftVal={leftSnap.ci.toFixed(2)}
                    rightVal={rightSnap.ci.toFixed(2)}
                    fmt={fmtDelta(leftSnap.ci, rightSnap.ci)}
                  />
                  <Row
                    label="CRREM pathway 2024"
                    leftVal={leftSnap.pathway.toFixed(2)}
                    rightVal={rightSnap.pathway.toFixed(2)}
                    fmt={fmtDelta(leftSnap.pathway, rightSnap.pathway, { invert: true })}
                  />
                  <Row
                    label="Stranded today"
                    leftVal={leftSnap.stranded ? '🔴 Yes' : '✓ No'}
                    rightVal={rightSnap.stranded ? '🔴 Yes' : '✓ No'}
                    fmt={{ text: '', tone: 'neutral' }}
                  />
                  <Row
                    label="Misalignment year"
                    leftVal={leftSnap.misalignmentYear?.toString() ?? 'never'}
                    rightVal={rightSnap.misalignmentYear?.toString() ?? 'never'}
                    fmt={fmtYearDelta(leftSnap.misalignmentYear, rightSnap.misalignmentYear)}
                  />
                  <Row
                    label="Scenario capex"
                    leftVal={fmtNum(leftSnap.scenarioCapex)}
                    rightVal={fmtNum(rightSnap.scenarioCapex)}
                    fmt={fmtDelta(leftSnap.scenarioCapex, rightSnap.scenarioCapex)}
                  />
                </tbody>
              </table>
            </div>
          )}

          <div className="text-xs text-slate-400 text-right pt-2 border-t border-slate-100">
            Lower CI / pathway / energy / capex is better (green). Higher pathway means more headroom.
          </div>
        </div>
      </div>
    </div>
  )
}
