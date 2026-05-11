import { useMemo } from 'react'
import type { Asset, Scenario } from '../engine/types'
import { analyseScenarioCost } from '../engine/cost'

interface Props {
  asset: Asset
  scenario: Scenario
}

function fmtMoney(n: number | null, currency: string | null): string {
  if (n === null) return '—'
  const c = currency ?? ''
  return `${c} ${Math.round(n).toLocaleString()}`.trim()
}

function fmtYears(n: number | null): string {
  if (n === null) return '—'
  if (n < 0.1) return '<0.1 yr'
  if (n > 100) return '>100 yr'
  return `${n.toFixed(1)} yr`
}

export default function CostSummaryCard({ asset, scenario }: Props) {
  const summary = useMemo(
    () => analyseScenarioCost(asset, scenario.retrofits),
    [asset, scenario.retrofits],
  )

  if (scenario.retrofits.length === 0) return null

  const noPrices = !asset.utility_prices || Object.keys(asset.utility_prices).length === 0

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Cost & payback</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Scenario: <span className="font-medium text-slate-600">{scenario.name}</span>
            {noPrices && (
              <span className="ml-2 text-amber-600">· add utility_prices to this asset to see savings</span>
            )}
            {!noPrices && summary.hasMissingPrices && (
              <span className="ml-2 text-amber-600">· some carriers missing utility prices</span>
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat label="Total capex" value={fmtMoney(summary.totalCapex, summary.currency)} />
        <Stat
          label="Annual savings"
          value={summary.totalAnnualSavings === null ? '—' : fmtMoney(summary.totalAnnualSavings, summary.currency)}
          tone={summary.totalAnnualSavings !== null && summary.totalAnnualSavings > 0 ? 'green' : undefined}
        />
        <Stat
          label="Avg payback"
          value={fmtYears(summary.averagePaybackYears)}
          tone={
            summary.averagePaybackYears == null ? undefined
              : summary.averagePaybackYears <= 7 ? 'green'
              : summary.averagePaybackYears <= 15 ? 'amber'
              : 'red'
          }
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead className="text-slate-500 uppercase tracking-wider">
            <tr>
              <th className="px-2 py-1.5 text-left">Retrofit</th>
              <th className="px-2 py-1.5 text-right">Year</th>
              <th className="px-2 py-1.5 text-right">Capex</th>
              <th className="px-2 py-1.5 text-right">kWh saved</th>
              <th className="px-2 py-1.5 text-right">Annual savings</th>
              <th className="px-2 py-1.5 text-right">Payback</th>
            </tr>
          </thead>
          <tbody>
            {summary.perRetrofit.map(r => {
              const totalSavedKwh = (Object.values(r.energyDelta) as number[]).reduce((s, v) => s + v, 0)
              return (
                <tr key={r.retrofit.id} className="border-t border-slate-100">
                  <td className="px-2 py-1.5 text-slate-800 font-medium">{r.retrofit.name}</td>
                  <td className="px-2 py-1.5 text-right text-slate-500">{r.retrofit.year}</td>
                  <td className="px-2 py-1.5 text-right text-slate-700">{fmtMoney(r.capex, r.currency)}</td>
                  <td className={`px-2 py-1.5 text-right ${totalSavedKwh > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                    {totalSavedKwh > 0 ? totalSavedKwh.toLocaleString() : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-right text-slate-700">
                    {fmtMoney(r.annualSavings, r.currency)}
                  </td>
                  <td className="px-2 py-1.5 text-right text-slate-700">{fmtYears(r.paybackYears)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'amber' | 'red' }) {
  const toneClass =
    tone === 'green' ? 'text-emerald-600'
      : tone === 'amber' ? 'text-amber-600'
      : tone === 'red' ? 'text-red-600'
      : 'text-slate-800'
  return (
    <div className="bg-slate-50 rounded-xl p-3">
      <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      <div className={`text-lg font-bold ${toneClass}`}>{value}</div>
    </div>
  )
}
