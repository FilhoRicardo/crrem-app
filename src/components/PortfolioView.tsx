import { useMemo, useState, useEffect, useRef } from 'react'
import Plotly from 'plotly.js-dist-min'
import { useStore } from '../store'
import { calculateYearMetrics, blendPathway, applyRetrofitsForYear, findMisalignmentYear } from '../engine/calculate'
import { efProvider, pathwayProvider } from '../engine/providers'
import { splitForAsset, regionForAsset } from '../vault/loader'
import type { Asset, Scenario, TrajectoryPoint } from '../engine/types'

interface AssetRollup {
  asset: Asset
  trajectory: TrajectoryPoint[]
  misalignmentYear: number | null
  scenarioUsed: Scenario | null
}

function rollupAsset(
  asset: Asset,
  scenario: Scenario | undefined,
  startYear: number,
  endYear: number,
): AssetRollup {
  const region = regionForAsset(asset)
  const split = splitForAsset(asset)
  const retrofits = scenario?.retrofits ?? []
  const trajectory: TrajectoryPoint[] = []
  for (let year = startYear; year <= endYear; year++) {
    const energy = applyRetrofitsForYear(asset.energy, retrofits, year)
    const metrics = calculateYearMetrics(energy, asset.gia_m2, efProvider, region, year)
    const pathway = blendPathway(pathwayProvider, region, split, year)
    trajectory.push({
      year,
      metrics,
      pathway,
      misaligned_co2: metrics.carbon_intensity_kgco2e_m2 > pathway.carbon_kgco2e_m2,
      misaligned_eui: metrics.eui_kwh_m2 > pathway.eui_kwh_m2,
    })
  }
  return {
    asset,
    trajectory,
    misalignmentYear: findMisalignmentYear(trajectory).co2,
    scenarioUsed: scenario ?? null,
  }
}

function PortfolioChart({ rollups, totalGia, startYear, endYear }: {
  rollups: AssetRollup[], totalGia: number, startYear: number, endYear: number,
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const years: number[] = []
    for (let y = startYear; y <= endYear; y++) years.push(y)
    const portfolioCI: number[] = []
    const portfolioPathway: number[] = []
    let portfolioMisalignment: number | null = null
    for (let i = 0; i < years.length; i++) {
      let ci = 0, pw = 0
      for (const r of rollups) {
        const w = r.asset.gia_m2 / totalGia
        ci += r.trajectory[i].metrics.carbon_intensity_kgco2e_m2 * w
        pw += r.trajectory[i].pathway.carbon_kgco2e_m2 * w
      }
      portfolioCI.push(ci)
      portfolioPathway.push(pw)
      if (portfolioMisalignment == null && ci > pw) portfolioMisalignment = years[i]
    }

    const traces: Plotly.Data[] = [
      {
        x: years, y: portfolioPathway,
        type: 'scatter', mode: 'lines', name: 'CRREM pathway (GIA-weighted)',
        line: { color: '#94a3b8', width: 2, dash: 'dash' },
      },
      {
        x: years, y: portfolioCI,
        type: 'scatter', mode: 'lines+markers', name: 'Portfolio CI',
        line: { color: '#1e3a5f', width: 3 },
        marker: { color: '#1e3a5f', size: 5 },
      },
    ]

    const shapes: Partial<Plotly.Shape>[] = []
    const annotations: Partial<Plotly.Annotations>[] = []
    if (portfolioMisalignment != null) {
      shapes.push({
        type: 'line',
        x0: portfolioMisalignment, x1: portfolioMisalignment,
        y0: 0, y1: 1, yref: 'paper',
        line: { color: '#ef4444', width: 1.5, dash: 'dot' },
      })
      annotations.push({
        x: portfolioMisalignment, y: 1, yref: 'paper',
        yanchor: 'bottom',
        text: `⚠ ${portfolioMisalignment}`,
        showarrow: false,
        font: { color: '#ef4444', size: 11 },
      })
    }

    Plotly.react(el, traces, {
      autosize: true,
      margin: { t: 30, r: 30, b: 50, l: 60 },
      paper_bgcolor: '#0f172a', plot_bgcolor: '#0f172a',
      font: { color: '#cbd5e1', family: 'system-ui, sans-serif' },
      xaxis: { gridcolor: '#1e293b', color: '#94a3b8' },
      yaxis: { title: { text: 'kgCO₂e / m² / yr' }, gridcolor: '#1e293b', color: '#94a3b8', rangemode: 'tozero' },
      legend: { orientation: 'h', x: 0, y: -0.18, font: { color: '#cbd5e1', size: 11 } },
      shapes, annotations,
    }, { responsive: true, displaylogo: false })
  }, [rollups, totalGia, startYear, endYear])

  useEffect(() => () => { if (ref.current) Plotly.purge(ref.current) }, [])

  return <div ref={ref} style={{ height: 380 }} />
}

export default function PortfolioView() {
  const portfolios = useStore(s => s.portfolios)
  const selectedPortfolioId = useStore(s => s.selectedPortfolioId)
  const selectPortfolio = useStore(s => s.selectPortfolio)
  const allAssets = useStore(s => s.assets)
  const allScenarios = useStore(s => s.scenarios)

  const portfolio = useMemo(
    () => portfolios.find(p => p.id === selectedPortfolioId) ?? portfolios[0],
    [portfolios, selectedPortfolioId],
  )

  // Per asset, choose first available scenario unless overridden in portfolio.
  const assetScenarioMap = useMemo<Record<string, string>>(() => {
    if (!portfolio) return {}
    const map: Record<string, string> = { ...(portfolio.scenario_overrides ?? {}) }
    for (const aid of portfolio.asset_ids) {
      if (!map[aid]) {
        const first = allScenarios.find(s => s.asset_id === aid)
        if (first) map[aid] = first.id
      }
    }
    return map
  }, [portfolio, allScenarios])

  const [overrides, setOverrides] = useState<Record<string, string>>({})
  useEffect(() => { setOverrides(assetScenarioMap) }, [assetScenarioMap])

  const rollups = useMemo<AssetRollup[]>(() => {
    if (!portfolio) return []
    return portfolio.asset_ids
      .map(aid => allAssets.find(a => a.id === aid))
      .filter((a): a is Asset => a !== undefined)
      .map(asset => {
        const sid = overrides[asset.id]
        const scenario = sid ? allScenarios.find(s => s.id === sid) : undefined
        return rollupAsset(asset, scenario, 2024, 2050)
      })
  }, [portfolio, allAssets, allScenarios, overrides])

  const totalGia = rollups.reduce((s, r) => s + r.asset.gia_m2, 0)

  if (!portfolio) {
    return (
      <main className="flex-1 flex items-center justify-center bg-slate-50">
        <p className="text-slate-400 italic">No portfolios in this vault. Add one to <code>portfolios/</code>.</p>
      </main>
    )
  }

  return (
    <main className="flex-1 overflow-y-auto bg-slate-50 p-6 flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">{portfolio.name}</h2>
          <p className="text-sm text-slate-500 mt-1">
            {rollups.length} asset{rollups.length === 1 ? '' : 's'} · {totalGia.toLocaleString()} m² total GIA · GIA-weighted
          </p>
        </div>
        <select
          value={portfolio.id}
          onChange={e => selectPortfolio(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white"
        >
          {portfolios.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div className="rounded-2xl overflow-hidden shadow border border-slate-700 bg-slate-900">
        <div className="px-5 py-3 border-b border-slate-800">
          <span className="text-slate-200 text-sm font-semibold">Portfolio CI vs Pathway (GIA-weighted)</span>
          <span className="text-slate-500 text-xs ml-2">2024–2050</span>
        </div>
        {rollups.length > 0 ? (
          <PortfolioChart rollups={rollups} totalGia={totalGia} startYear={2024} endYear={2050} />
        ) : (
          <p className="p-8 text-center text-slate-400 italic">No matching assets found in vault.</p>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Asset</th>
              <th className="px-4 py-3 text-right">GIA m²</th>
              <th className="px-4 py-3 text-right">Weight</th>
              <th className="px-4 py-3 text-right">CI 2024</th>
              <th className="px-4 py-3 text-right">Pathway 2024</th>
              <th className="px-4 py-3 text-right">Misalignment</th>
              <th className="px-4 py-3 text-left">Scenario</th>
            </tr>
          </thead>
          <tbody>
            {rollups.map(r => {
              const t0 = r.trajectory[0]
              const w = r.asset.gia_m2 / totalGia
              const scenarios = allScenarios.filter(s => s.asset_id === r.asset.id)
              return (
                <tr key={r.asset.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-800">{r.asset.name}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{r.asset.gia_m2.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-slate-500">{(w * 100).toFixed(1)}%</td>
                  <td className="px-4 py-3 text-right text-slate-700">{t0.metrics.carbon_intensity_kgco2e_m2.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-slate-500">{t0.pathway.carbon_kgco2e_m2.toFixed(2)}</td>
                  <td className={`px-4 py-3 text-right font-medium ${
                    r.misalignmentYear == null ? 'text-emerald-600'
                      : r.misalignmentYear <= 2024 ? 'text-red-600'
                      : 'text-amber-600'
                  }`}>
                    {r.misalignmentYear ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={overrides[r.asset.id] ?? ''}
                      onChange={e => setOverrides({ ...overrides, [r.asset.id]: e.target.value })}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white"
                    >
                      <option value="">— none —</option>
                      {scenarios.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </main>
  )
}
