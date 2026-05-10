import { useEffect, useMemo, useRef } from 'react'
import Plotly from 'plotly.js-dist-min'
import type { Asset, Scenario, EFProvider, PathwayProvider, TrajectoryPoint } from '../engine/types'
import { projectTrajectory, findMisalignmentYear } from '../engine/calculate'
import { splitForAsset, regionForAsset } from '../vault/loader'

interface Props {
  asset: Asset
  scenarios: Scenario[]
  getEF: EFProvider
  getPathway: PathwayProvider
  startYear?: number
  endYear?: number
}

const PALETTE = ['#2d7a4f', '#1e3a5f', '#d97706', '#7c3aed', '#0891b2', '#dc2626', '#0d9488']

export interface ScenarioTrajectory {
  scenario: Scenario
  trajectory: TrajectoryPoint[]
  misalignmentYear: number | null
}

export function buildScenarioTrajectories(
  asset: Asset,
  scenarios: Scenario[],
  getEF: EFProvider,
  getPathway: PathwayProvider,
  startYear: number,
  endYear: number,
): ScenarioTrajectory[] {
  const region = regionForAsset(asset)
  const split = splitForAsset(asset)
  return scenarios.map(scenario => {
    const trajectory = projectTrajectory({
      baseEnergy: asset.energy,
      gia: asset.gia_m2,
      getEF,
      getPathway,
      region,
      split,
      retrofits: scenario.retrofits,
      startYear,
      endYear,
    })
    const misalignmentYear = findMisalignmentYear(trajectory).co2
    return { scenario, trajectory, misalignmentYear }
  })
}

export default function StrandingChart({
  asset, scenarios, getEF, getPathway,
  startYear = 2024, endYear = 2050,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)

  const series = useMemo(
    () => buildScenarioTrajectories(asset, scenarios, getEF, getPathway, startYear, endYear),
    [asset, scenarios, getEF, getPathway, startYear, endYear],
  )

  // Pathway shared across scenarios (it's per asset)
  const years = useMemo(() => {
    const arr: number[] = []
    for (let y = startYear; y <= endYear; y++) arr.push(y)
    return arr
  }, [startYear, endYear])

  const pathwayY = useMemo(() => {
    if (series.length === 0) return []
    return series[0].trajectory.map(p => p.pathway.carbon_kgco2e_m2)
  }, [series])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const traces: Plotly.Data[] = []

    // Pathway line
    traces.push({
      x: years,
      y: pathwayY,
      type: 'scatter',
      mode: 'lines',
      name: 'CRREM pathway',
      line: { color: '#94a3b8', width: 2, dash: 'dash' },
      hovertemplate: '<b>%{x}</b><br>Pathway: %{y:.2f} kgCO₂e/m²<extra></extra>',
    })

    series.forEach((s, idx) => {
      const colour = PALETTE[idx % PALETTE.length]
      traces.push({
        x: years,
        y: s.trajectory.map(p => p.metrics.carbon_intensity_kgco2e_m2),
        type: 'scatter',
        mode: 'lines+markers',
        name: s.scenario.name,
        line: { color: colour, width: 2.5 },
        marker: { color: colour, size: 4 },
        hovertemplate: `<b>%{x}</b><br>${s.scenario.name}: %{y:.2f} kgCO₂e/m²<extra></extra>`,
      })
    })

    const shapes: Partial<Plotly.Shape>[] = []
    const annotations: Partial<Plotly.Annotations>[] = []

    series.forEach((s, idx) => {
      if (s.misalignmentYear == null) return
      const colour = PALETTE[idx % PALETTE.length]
      shapes.push({
        type: 'line',
        x0: s.misalignmentYear, x1: s.misalignmentYear,
        y0: 0, y1: 1, yref: 'paper',
        line: { color: colour, width: 1.5, dash: 'dot' },
      })
      annotations.push({
        x: s.misalignmentYear, y: 1, yref: 'paper',
        yanchor: 'bottom',
        text: `⚠ ${s.misalignmentYear}`,
        showarrow: false,
        font: { color: colour, size: 11 },
        bgcolor: 'rgba(255,255,255,0.9)',
        bordercolor: colour,
        borderwidth: 1,
        borderpad: 3,
      })
    })

    const layout: Partial<Plotly.Layout> = {
      autosize: true,
      margin: { t: 30, r: 30, b: 50, l: 60 },
      paper_bgcolor: '#0f172a',
      plot_bgcolor: '#0f172a',
      font: { color: '#cbd5e1', family: 'system-ui, sans-serif' },
      xaxis: {
        title: { text: 'Year' },
        gridcolor: '#1e293b',
        zerolinecolor: '#1e293b',
        color: '#94a3b8',
      },
      yaxis: {
        title: { text: 'kgCO₂e / m² / yr' },
        gridcolor: '#1e293b',
        zerolinecolor: '#1e293b',
        rangemode: 'tozero',
        color: '#94a3b8',
      },
      legend: {
        orientation: 'h',
        x: 0, y: -0.18,
        font: { color: '#cbd5e1', size: 11 },
      },
      shapes,
      annotations,
      hoverlabel: { bgcolor: '#1e293b', bordercolor: '#475569', font: { color: '#f1f5f9' } },
    }

    Plotly.react(el, traces, layout, {
      responsive: true, displaylogo: false,
      modeBarButtonsToRemove: ['lasso2d', 'select2d'],
    })
  }, [series, years, pathwayY])

  useEffect(() => {
    return () => {
      if (ref.current) Plotly.purge(ref.current)
    }
  }, [])

  return (
    <div className="rounded-2xl overflow-hidden shadow border border-slate-700 bg-slate-900">
      <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
        <div>
          <span className="text-slate-200 text-sm font-semibold">Carbon Intensity vs CRREM Pathway</span>
          <span className="text-slate-500 text-xs ml-2">{startYear}–{endYear}</span>
        </div>
        <div className="text-xs text-slate-400">
          {series.length} scenario{series.length === 1 ? '' : 's'}
        </div>
      </div>
      <div ref={ref} style={{ height: 380 }} />
    </div>
  )
}
