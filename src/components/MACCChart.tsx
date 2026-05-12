import { useEffect, useMemo, useRef } from 'react'
import Plotly from 'plotly.js-dist-min'
import type { Asset, Scenario } from '../engine/types'
import { analyseScenarioCost } from '../engine/cost'
import { buildMACC } from '../engine/macc'
import { efProvider } from '../engine/providers'
import { regionForAsset } from '../vault/loader'

interface Props {
  asset: Asset
  scenario: Scenario
  discountRatePct?: number
}

export default function MACCChart({ asset, scenario, discountRatePct = 6 }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  const macc = useMemo(() => {
    const cost = analyseScenarioCost(asset, scenario.retrofits, { discountRatePct, horizonYears: 25 })
    return buildMACC({
      asset,
      retrofits: scenario.retrofits,
      perRetrofitCost: cost.perRetrofit,
      getEF: efProvider,
      region: regionForAsset(asset),
      discountRatePct,
    })
  }, [asset, scenario.retrofits, discountRatePct])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (macc.bars.length === 0) {
      Plotly.purge(el)
      return
    }

    // Build the staircase-style MACC: each bar is centered at its cumulative midpoint.
    const xs: number[] = []
    const ys: number[] = []
    const widths: number[] = []
    const labels: string[] = []
    const colors: string[] = []
    let cumX = 0
    for (const b of macc.bars) {
      const w = Math.max(0, b.annualAbatementTCO2)
      const mid = cumX + w / 2
      xs.push(mid)
      ys.push(b.costPerTCO2 ?? 0)
      widths.push(w)
      labels.push(b.retrofit.name)
      // Tone: green = pays for itself (negative cost), amber = ≤100/tCO2, red = >100
      const c = b.costPerTCO2 ?? 0
      colors.push(c < 0 ? '#16a34a' : c <= 100 ? '#d97706' : '#dc2626')
      cumX += w
    }

    const currency = macc.bars[0]?.currency ?? ''
    const yLabel = `Cost / tCO₂ avoided${currency ? ` (${currency})` : ''}`

    const trace: Plotly.Data = {
      type: 'bar',
      x: xs,
      y: ys,
      width: widths,
      marker: { color: colors, line: { color: '#0f172a', width: 1 } },
      text: labels,
      textposition: 'auto',
      hovertemplate:
        '<b>%{text}</b><br>' +
        'Cost: %{y:.0f} ' + currency + ' / tCO₂<br>' +
        'Abatement: %{customdata:.1f} tCO₂/yr' +
        '<extra></extra>',
      customdata: widths,
    }

    Plotly.react(el, [trace], {
      autosize: true,
      margin: { t: 30, r: 30, b: 60, l: 70 },
      paper_bgcolor: '#0f172a',
      plot_bgcolor: '#0f172a',
      font: { color: '#cbd5e1', family: 'system-ui, sans-serif' },
      xaxis: {
        title: { text: 'Cumulative annual abatement (tCO₂/yr)' },
        gridcolor: '#1e293b',
        color: '#94a3b8',
        zerolinecolor: '#1e293b',
      },
      yaxis: {
        title: { text: yLabel },
        gridcolor: '#1e293b',
        color: '#94a3b8',
        zerolinecolor: '#475569',  // strong zero line — separates "pays for itself" from "costs money"
        zerolinewidth: 2,
      },
      bargap: 0,
      hoverlabel: { bgcolor: '#1e293b', bordercolor: '#475569', font: { color: '#f1f5f9' } },
    }, { responsive: true, displaylogo: false })
  }, [macc])

  useEffect(() => () => { if (ref.current) Plotly.purge(ref.current) }, [])

  if (scenario.retrofits.length === 0) return null

  return (
    <div className="rounded-2xl overflow-hidden shadow border border-slate-700 bg-slate-900">
      <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
        <div>
          <span className="text-slate-200 text-sm font-semibold">Marginal Abatement Cost Curve</span>
          <span className="text-slate-500 text-xs ml-2">
            sorted cheapest → most expensive · annualised at {discountRatePct}% over each retrofit's lifetime
          </span>
        </div>
        <div className="text-xs text-slate-400">
          Total abatement: <span className="text-emerald-400 font-semibold">{macc.totalAbatementTCO2.toFixed(1)} tCO₂/yr</span>
        </div>
      </div>
      <div ref={ref} style={{ height: 320 }} />
    </div>
  )
}
