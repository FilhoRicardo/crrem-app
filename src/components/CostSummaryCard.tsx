import { useMemo, useState } from 'react'
import type { Asset, Scenario } from '../engine/types'
import { analyseScenarioCost } from '../engine/cost'

/** Apply a ± shift to all utility_prices (proportional). Pure helper. */
function asWithPriceShift(asset: Asset, pricePct: number): Asset {
  if (pricePct === 0 || !asset.utility_prices) return asset
  const factor = 1 + pricePct / 100
  const up = { ...asset.utility_prices }
  for (const k of Object.keys(up) as Array<keyof typeof up>) {
    if (k === 'currency' || k === 'escalation_pct_per_year') continue
    const v = up[k]
    if (typeof v === 'number') (up as Record<string, unknown>)[k] = v * factor
  }
  return { ...asset, utility_prices: up }
}

/** Apply a ± shift to all retrofit capex (proportional). Pure helper. */
function scenarioWithCapexShift(scenario: Scenario, capexPct: number): Scenario {
  if (capexPct === 0) return scenario
  const factor = 1 + capexPct / 100
  return {
    ...scenario,
    retrofits: scenario.retrofits.map(r => {
      if (!r.cost?.capex_total) return r
      return { ...r, cost: { ...r.cost, capex_total: r.cost.capex_total * factor } }
    }),
  }
}

interface Props {
  asset: Asset
  scenario: Scenario
}

const DEFAULT_DISCOUNT_PCT = 6  // typical real-estate hurdle rate
const DEFAULT_HORIZON_YEARS = 25

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

function fmtPct(n: number | null): string {
  if (n === null) return '—'
  if (n < -50) return '<−50%'
  if (n > 100) return '>100%'
  return `${n.toFixed(1)}%`
}

export default function CostSummaryCard({ asset, scenario }: Props) {
  const [discountPct, setDiscountPct] = useState(DEFAULT_DISCOUNT_PCT)
  const [horizonYears, setHorizonYears] = useState(DEFAULT_HORIZON_YEARS)
  const [showSensitivity, setShowSensitivity] = useState(false)
  const [pricePct, setPricePct] = useState(0)
  const [capexPct, setCapexPct] = useState(0)

  // Apply sensitivity shifts before passing to the engine
  const adjustedAsset = useMemo(() => asWithPriceShift(asset, pricePct), [asset, pricePct])
  const adjustedScenario = useMemo(() => scenarioWithCapexShift(scenario, capexPct), [scenario, capexPct])

  const summary = useMemo(
    () => analyseScenarioCost(adjustedAsset, adjustedScenario.retrofits, { discountRatePct: discountPct, horizonYears }),
    [adjustedAsset, adjustedScenario.retrofits, discountPct, horizonYears],
  )

  if (scenario.retrofits.length === 0) return null

  const noPrices = !asset.utility_prices || Object.keys(asset.utility_prices).length === 0
  const hasFinance = summary.npv !== null

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Cost & financial return</h3>
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
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 flex items-center gap-1.5">
            Discount %
            <input
              type="number"
              step={0.5}
              min={0}
              max={30}
              value={discountPct}
              onChange={e => setDiscountPct(Number(e.target.value))}
              className="w-16 px-2 py-1 text-xs border border-slate-200 rounded"
              title="Cost of capital used for NPV. Typical real-estate hurdle: 5–8%."
            />
          </label>
          <label className="text-xs text-slate-500 flex items-center gap-1.5">
            Horizon yr
            <input
              type="number"
              step={1}
              min={5}
              max={40}
              value={horizonYears}
              onChange={e => setHorizonYears(Number(e.target.value))}
              className="w-16 px-2 py-1 text-xs border border-slate-200 rounded"
              title="Years of savings to project. Defaults to 25 (CRREM trajectory length)."
            />
          </label>
          <button
            onClick={() => setShowSensitivity(s => !s)}
            className={`text-xs px-2.5 py-1 rounded font-medium transition-colors ${
              showSensitivity ? 'bg-crrem-navy text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
            title="Sensitivity sliders — see how NPV / IRR / payback change with energy-price and capex shifts"
          >
            ± Sensitivity
          </button>
        </div>
      </div>

      {showSensitivity && (
        <div className="mb-4 bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
          <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
            What-if sensitivity {(pricePct !== 0 || capexPct !== 0) && (
              <span className="text-amber-600 ml-2 normal-case font-normal">
                · numbers above reflect shifted inputs
              </span>
            )}
          </div>
          <SensSlider
            label="Energy prices"
            value={pricePct}
            onChange={setPricePct}
            help="Shift every utility_price proportionally. Useful for testing what happens if prices spike or drop."
          />
          <SensSlider
            label="Capex"
            value={capexPct}
            onChange={setCapexPct}
            help="Shift every retrofit's capex_total proportionally. Test cost-overrun and cost-undershoot scenarios."
          />
          {(pricePct !== 0 || capexPct !== 0) && (
            <button
              onClick={() => { setPricePct(0); setCapexPct(0) }}
              className="text-xs text-crrem-navy hover:underline"
            >
              Reset to baseline
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-6 gap-3 mb-4">
        <Stat label="Total capex" value={fmtMoney(summary.totalCapex, summary.currency)} />
        <Stat
          label="Annual savings"
          value={summary.totalAnnualSavings === null ? '—' : fmtMoney(summary.totalAnnualSavings, summary.currency)}
          tone={summary.totalAnnualSavings !== null && summary.totalAnnualSavings > 0 ? 'green' : undefined}
        />
        <Stat
          label="Payback (simple)"
          value={fmtYears(summary.averagePaybackYears)}
          tone={
            summary.averagePaybackYears == null ? undefined
              : summary.averagePaybackYears <= 7 ? 'green'
              : summary.averagePaybackYears <= 15 ? 'amber'
              : 'red'
          }
        />
        <Stat
          label={`Payback @ ${discountPct}%`}
          value={fmtYears(summary.discountedPaybackYears)}
          tone={
            summary.discountedPaybackYears == null ? undefined
              : summary.discountedPaybackYears <= 10 ? 'green'
              : summary.discountedPaybackYears <= 20 ? 'amber'
              : 'red'
          }
        />
        <Stat
          label={`NPV @ ${discountPct}%`}
          value={hasFinance ? fmtMoney(summary.npv, summary.currency) : '—'}
          tone={hasFinance && summary.npv! > 0 ? 'green' : hasFinance && summary.npv! < 0 ? 'red' : undefined}
        />
        <Stat
          label="IRR"
          value={fmtPct(summary.irr)}
          tone={
            summary.irr == null ? undefined
              : summary.irr >= discountPct + 5 ? 'green'
              : summary.irr >= discountPct ? 'amber'
              : 'red'
          }
        />
      </div>

      {summary.totalEmbodiedCarbonKg > 0 && (
        <div className="bg-slate-50 rounded-xl p-3 mb-4 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500">Embodied carbon (one-time)</div>
            <div className="text-xs text-slate-400 mt-0.5">
              Manufacturing + transport + installation. Operational savings need to outweigh this for the scenario to be net-positive over its lifetime.
            </div>
          </div>
          <div className="text-lg font-bold text-amber-600 tabular-nums">
            {Math.round(summary.totalEmbodiedCarbonKg).toLocaleString()} kgCO₂e
          </div>
        </div>
      )}

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
              <th className="px-2 py-1.5 text-right">Embodied (kgCO₂e)</th>
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
                  <td className="px-2 py-1.5 text-right text-slate-700">
                    {r.embodiedCarbonKg > 0 ? Math.round(r.embodiedCarbonKg).toLocaleString() : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SensSlider({ label, value, onChange, help }: {
  label: string; value: number; onChange: (n: number) => void; help: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-600 font-medium" title={help}>{label}</span>
        <span className={`tabular-nums font-semibold ${value === 0 ? 'text-slate-500' : value > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
          {value > 0 ? '+' : ''}{value}%
        </span>
      </div>
      <input
        type="range"
        min={-50}
        max={50}
        step={5}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-crrem-navy"
      />
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
      <div className={`text-base font-bold leading-tight ${toneClass}`}>{value}</div>
    </div>
  )
}
