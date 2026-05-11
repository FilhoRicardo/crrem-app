import { useMemo, useState, useEffect, useRef } from 'react'
import Plotly from 'plotly.js-dist-min'
import { useStore } from '../store'
import { calculateYearMetrics, blendPathway, applyRetrofitsForYear, findMisalignmentYear, actualForYear, applyRenewableDegradation, applyClimateAdjustment } from '../engine/calculate'
import { efProvider, pathwayProvider, getClimateFactors } from '../engine/providers'
import { splitForAsset, regionForAsset, portfolioToMarkdown, importPortfolioFile } from '../vault/loader'
import type { Asset, Scenario, TrajectoryPoint, Portfolio } from '../engine/types'
import { downloadText } from '../utils/download'
import { exportPortfolioReport } from '../utils/report'
import TemplateButton from './TemplateButton'
import ImportButton from './ImportButton'
import PortfolioForm, { emptyPortfolio } from './PortfolioForm'

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
  const degPct = asset.renewable_degradation_pct_per_year
  const climateScenario = asset.climate_scenario
  for (let year = startYear; year <= endYear; year++) {
    const actual = actualForYear(asset.actuals, year)
    let energy
    if (actual !== null) {
      energy = actual
    } else {
      let projected = applyRetrofitsForYear(asset.energy, retrofits, year)
      if (degPct) projected = applyRenewableDegradation(projected, year - startYear, degPct)
      if (climateScenario && climateScenario !== 'none') {
        projected = applyClimateAdjustment(projected, getClimateFactors(asset.country, year, climateScenario))
      }
      energy = projected
    }
    const metrics = calculateYearMetrics(energy, asset.gia_m2, efProvider, region, year)
    const pathway = blendPathway(pathwayProvider, region, split, year)
    trajectory.push({
      year,
      metrics,
      pathway,
      misaligned_co2: metrics.carbon_intensity_kgco2e_m2 > pathway.carbon_kgco2e_m2,
      misaligned_eui: metrics.eui_kwh_m2 > pathway.eui_kwh_m2,
      is_actual: actual !== null,
    })
  }
  return {
    asset,
    trajectory,
    misalignmentYear: findMisalignmentYear(trajectory).co2,
    scenarioUsed: scenario ?? null,
  }
}

function PortfolioChart({ rollups, totalGia, startYear, endYear, plotRef }: {
  rollups: AssetRollup[], totalGia: number, startYear: number, endYear: number,
  plotRef?: React.RefObject<HTMLDivElement | null>,
}) {
  const localRef = useRef<HTMLDivElement | null>(null)
  const ref = plotRef ?? localRef
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

  return <div ref={ref as React.RefObject<HTMLDivElement>} style={{ height: 380 }} />
}

export default function PortfolioView() {
  const portfolios = useStore(s => s.portfolios)
  const selectedPortfolioId = useStore(s => s.selectedPortfolioId)
  const selectPortfolio = useStore(s => s.selectPortfolio)
  const savePortfolio = useStore(s => s.savePortfolio)
  const deletePortfolio = useStore(s => s.deletePortfolio)
  const vaultMode = useStore(s => s.vaultMode)
  const readOnly = vaultMode !== 'fsa'
  const allAssets = useStore(s => s.assets)
  const allScenarios = useStore(s => s.scenarios)
  const [editing, setEditing] = useState<Portfolio | null>(null)
  const [creating, setCreating] = useState(false)
  const portfolioChartRef = useRef<HTMLDivElement | null>(null)

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

  const handleSave = async (p: Portfolio) => {
    await savePortfolio(p)
    setEditing(null)
    setCreating(false)
    selectPortfolio(p.id)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this portfolio? It will be moved to trash/portfolios/.')) return
    await deletePortfolio(id)
  }

  if (creating) {
    return (
      <main className="flex-1 overflow-y-auto bg-slate-50 p-6">
        <PortfolioForm
          initial={emptyPortfolio()}
          isNew
          existingIds={portfolios.map(p => p.id)}
          onCancel={() => setCreating(false)}
          onSave={handleSave}
          readOnly={readOnly}
        />
      </main>
    )
  }

  if (editing) {
    return (
      <main className="flex-1 overflow-y-auto bg-slate-50 p-6">
        <PortfolioForm
          initial={editing}
          isNew={false}
          existingIds={portfolios.map(p => p.id).filter(id => id !== editing.id)}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
          readOnly={readOnly}
        />
      </main>
    )
  }

  if (!portfolio) {
    return (
      <main className="flex-1 overflow-y-auto bg-slate-50 p-6 flex flex-col gap-4">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-xl font-semibold text-slate-800">Portfolios</h2>
            <p className="text-sm text-slate-500 mt-1">No portfolios in this vault yet.</p>
          </div>
          <div className="flex gap-2">
            <TemplateButton kind="portfolio" />
            <ImportButton
              label="Import .md"
              disabled={readOnly}
              onImport={async file => {
                const p = await importPortfolioFile(file)
                await savePortfolio(p)
                selectPortfolio(p.id)
              }}
            />
            <button
              onClick={() => setCreating(true)}
              disabled={readOnly}
              className="text-sm px-4 py-2 rounded-lg bg-crrem-navy text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              title={readOnly ? 'Open a real vault to create' : 'Create your first portfolio'}
            >
              + New portfolio
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-2xl mb-3">
            📊
          </div>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            Portfolios let you roll up GIA-weighted CI and pathways across multiple assets.
            {readOnly
              ? ' Open a real vault to create one.'
              : ' Click + New portfolio above to start.'}
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="flex-1 overflow-y-auto bg-slate-50 p-6 flex flex-col gap-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Portfolios</h2>
          <p className="text-sm text-slate-500 mt-1">
            {portfolios.length} portfolio{portfolios.length === 1 ? '' : 's'} in this vault · GIA-weighted rollup
          </p>
        </div>
        <div className="flex items-center gap-2">
          <TemplateButton kind="portfolio" />
          <ImportButton
            label="Import .md"
            disabled={readOnly}
            onImport={async file => {
              const p = await importPortfolioFile(file)
              await savePortfolio(p)
              selectPortfolio(p.id)
            }}
          />
          <button
            onClick={() => setCreating(true)}
            disabled={readOnly}
            className="text-sm px-4 py-2 rounded-lg bg-crrem-navy text-white font-medium shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            title={readOnly ? 'Open a real vault to create' : 'New portfolio'}
          >
            + New portfolio
          </button>
        </div>
      </div>

      {/* Portfolio pill row — always visible so all portfolios are one click away */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 flex flex-wrap items-center gap-2">
        {portfolios.map(p => {
          const active = p.id === portfolio.id
          return (
            <button
              key={p.id}
              onClick={() => selectPortfolio(p.id)}
              className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
                active
                  ? 'bg-crrem-navy text-white'
                  : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {p.name}
              <span className={`ml-1.5 text-xs ${active ? 'text-white/60' : 'text-slate-400'}`}>
                {p.asset_ids.length}
              </span>
            </button>
          )
        })}
        <button
          onClick={() => setCreating(true)}
          disabled={readOnly}
          className="text-sm px-3 py-1.5 rounded-lg border-2 border-dashed border-slate-300 text-slate-500 hover:border-crrem-navy hover:text-crrem-navy transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + New
        </button>
      </div>

      {/* Selected portfolio header row */}
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">{portfolio.name}</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {rollups.length} asset{rollups.length === 1 ? '' : 's'} · {totalGia.toLocaleString()} m² total GIA
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const reportRows = rollups.map(r => ({
                asset: r.asset,
                scenarioName: r.scenarioUsed?.name ?? null,
                ci2024: r.trajectory[0].metrics.carbon_intensity_kgco2e_m2,
                pathway2024: r.trajectory[0].pathway.carbon_kgco2e_m2,
                misalignmentYear: r.misalignmentYear,
                giaWeight: r.asset.gia_m2 / Math.max(totalGia, 1),
              }))
              const portfolioCi = reportRows.reduce((s, r) => s + r.ci2024 * r.giaWeight, 0)
              const portfolioPw = reportRows.reduce((s, r) => s + r.pathway2024 * r.giaWeight, 0)
              // Find the first year where the GIA-weighted portfolio CI > pathway
              let pmYear: number | null = null
              for (let i = 0; i < (rollups[0]?.trajectory.length ?? 0); i++) {
                let ci = 0, pw = 0
                for (const r of rollups) {
                  const w = r.asset.gia_m2 / Math.max(totalGia, 1)
                  ci += r.trajectory[i].metrics.carbon_intensity_kgco2e_m2 * w
                  pw += r.trajectory[i].pathway.carbon_kgco2e_m2 * w
                }
                if (ci > pw) { pmYear = rollups[0].trajectory[i].year; break }
              }
              exportPortfolioReport({
                portfolio,
                rows: reportRows,
                totalGia,
                portfolioCi2024: portfolioCi,
                portfolioPathway2024: portfolioPw,
                portfolioMisalignmentYear: pmYear,
                chartElement: portfolioChartRef.current,
              })
            }}
            className="text-xs px-3 py-1.5 rounded-lg border border-crrem-navy text-crrem-navy hover:bg-crrem-navy hover:text-white font-medium flex items-center gap-1.5 transition-colors"
            title="Open a printable portfolio report — save as PDF from the print dialog"
          >
            <span>⎙</span> Export PDF
          </button>
          <button
            onClick={() => downloadText(`${portfolio.id}.md`, portfolioToMarkdown(portfolio))}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium flex items-center gap-1.5"
            title="Download this portfolio as .md"
          >
            <span>⬇</span> Download
          </button>
          <button
            onClick={() => setEditing(portfolio)}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium"
            title="Edit this portfolio"
          >
            Edit
          </button>
          <button
            onClick={() => handleDelete(portfolio.id)}
            disabled={readOnly}
            className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 font-medium disabled:opacity-30 disabled:cursor-not-allowed"
            title={readOnly ? 'Open a real vault to delete' : 'Delete this portfolio'}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden shadow border border-slate-700 bg-slate-900">
        <div className="px-5 py-3 border-b border-slate-800">
          <span className="text-slate-200 text-sm font-semibold">Portfolio CI vs Pathway (GIA-weighted)</span>
          <span className="text-slate-500 text-xs ml-2">2024–2050</span>
        </div>
        {rollups.length > 0 ? (
          <PortfolioChart rollups={rollups} totalGia={totalGia} startYear={2024} endYear={2050} plotRef={portfolioChartRef} />
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
