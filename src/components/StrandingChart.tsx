import { useEffect, useImperativeHandle, useMemo, useRef, forwardRef } from 'react'
import Plotly from 'plotly.js-dist-min'
import type { Asset, Scenario, EFProvider, PathwayProvider, TrajectoryPoint } from '../engine/types'
import { projectTrajectory, findMisalignmentYear, actualForYear } from '../engine/calculate'
import { getClimateFactors } from '../engine/providers'
import { splitForAsset, regionForAsset } from '../vault/loader'

interface Props {
  asset: Asset
  scenarios: Scenario[]
  getEF: EFProvider
  getPathway: PathwayProvider
  startYear?: number
  endYear?: number
}

/** Imperative handle exposed to parents for chart-image capture (PDF export). */
export interface StrandingChartHandle {
  /** The Plotly-managed div. Pass directly to Plotly.toImage() / report builders. */
  getPlotElement: () => HTMLDivElement | null
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
  const getActual = (year: number) => actualForYear(asset.actuals, year)
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
      getActual,
      renewableDegradationPctPerYear: asset.renewable_degradation_pct_per_year,
      getClimateFactors: asset.climate_scenario && asset.climate_scenario !== 'none'
        ? (year) => getClimateFactors(asset.country, year, asset.climate_scenario!)
        : undefined,
    })
    const misalignmentYear = findMisalignmentYear(trajectory).co2
    return { scenario, trajectory, misalignmentYear }
  })
}

function StrandingChartImpl(
  { asset, scenarios, getEF, getPathway, startYear = 2024, endYear = 2050 }: Props,
  forwardedRef: React.ForwardedRef<StrandingChartHandle>,
) {
  const ref = useRef<HTMLDivElement>(null)
  useImperativeHandle(forwardedRef, () => ({
    getPlotElement: () => ref.current,
  }), [])

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
      const xs = years
      const ys = s.trajectory.map(p => p.metrics.carbon_intensity_kgco2e_m2)
      const flags = s.trajectory.map(p => !!p.is_actual)

      // Projected line — dashed where the year has no actual; solid where it does.
      // Plotly handles per-segment dashing via two traces sharing the same name.
      const projY = ys.map((v, i) => (flags[i] ? null : v))
      const actY = ys.map((v, i) => (flags[i] ? v : null))

      // Continuity: if neighbours alternate, duplicate boundary points so lines connect.
      for (let i = 1; i < flags.length; i++) {
        if (flags[i] !== flags[i - 1]) {
          projY[i - 1] = ys[i - 1]
          actY[i - 1] = ys[i - 1]
        }
      }

      traces.push({
        x: xs, y: projY,
        type: 'scatter', mode: 'lines',
        name: s.scenario.name + ' (projected)',
        legendgroup: s.scenario.name,
        line: { color: colour, width: 2.5, dash: 'dash' },
        connectgaps: false,
        hovertemplate: `<b>%{x}</b><br>${s.scenario.name} (projected): %{y:.2f} kgCO₂e/m²<extra></extra>`,
      } as Plotly.Data)

      const hasActuals = flags.some(Boolean)
      traces.push({
        x: xs, y: actY,
        type: 'scatter', mode: 'lines+markers',
        name: hasActuals ? s.scenario.name + ' (actual)' : s.scenario.name,
        legendgroup: s.scenario.name,
        showlegend: hasActuals,  // Hide the redundant "(actual)" entry when there are no actuals
        line: { color: colour, width: 3 },
        marker: { color: colour, size: 6, symbol: 'circle' },
        connectgaps: false,
        hovertemplate: `<b>%{x}</b><br>${s.scenario.name} (measured): %{y:.2f} kgCO₂e/m²<extra></extra>`,
      } as Plotly.Data)
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

const StrandingChart = forwardRef<StrandingChartHandle, Props>(StrandingChartImpl)
StrandingChart.displayName = 'StrandingChart'
export default StrandingChart

