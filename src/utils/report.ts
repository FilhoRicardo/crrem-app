/**
 * Build + export a CRREM-aligned single-page assessment report for an asset
 * or portfolio. Opens a new window with print-friendly HTML and triggers the
 * browser print dialog — user saves as PDF from there. Zero deps, works in
 * every browser.
 */

import Plotly from 'plotly.js-dist-min'
import type { Asset, Scenario, Portfolio } from '../engine/types'
import type { ScenarioCostSummary } from '../engine/cost'
import { summariseAsset, flagForCountry } from '../engine/summary'
import { regionForAsset } from '../vault/loader'

const ESC: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }
const esc = (s: unknown) => String(s ?? '').replace(/[<>&"']/g, c => ESC[c]!)
const fmtNumber = (n: number, digits = 0) => Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: digits }) : '—'
const fmtMoney = (n: number | null, currency: string | null) =>
  n === null ? '—' : `${currency ?? ''} ${fmtNumber(Math.round(n))}`.trim()
const fmtYears = (n: number | null) => n === null ? '—' : n < 0.1 ? '<0.1 yr' : n > 100 ? '>100 yr' : `${n.toFixed(1)} yr`

const DOC_HEAD_STYLE = `
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #0f172a; margin: 0; padding: 32px; max-width: 920px; }
  h1 { font-size: 22px; margin: 0 0 4px; color: #1e3a5f; }
  h2 { font-size: 14px; margin: 24px 0 8px; color: #1e3a5f; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
  .meta { color: #64748b; font-size: 12px; margin-bottom: 16px; }
  .badges { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 16px; }
  .badge { font-size: 11px; padding: 3px 8px; border-radius: 999px; background: #f1f5f9; color: #334155; }
  .badge.green { background: #d1fae5; color: #065f46; }
  .badge.red   { background: #fee2e2; color: #991b1b; }
  .badge.amber { background: #fef3c7; color: #92400e; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 12px 0 20px; }
  .stat { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; }
  .stat .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; margin-bottom: 4px; }
  .stat .value { font-size: 18px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { padding: 6px 10px; text-align: left; border-bottom: 1px solid #f1f5f9; }
  th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; background: #f8fafc; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .chart { width: 100%; margin: 8px 0 4px; }
  .chart img { width: 100%; height: auto; border: 1px solid #e2e8f0; border-radius: 8px; }
  footer { margin-top: 24px; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; }
  .actions { position: sticky; top: 0; background: white; padding: 8px 0 16px; margin-bottom: 16px; border-bottom: 1px solid #e2e8f0; display: flex; gap: 8px; }
  .actions button { font-size: 13px; padding: 6px 14px; border-radius: 6px; border: 1px solid #cbd5e1; background: white; cursor: pointer; font-weight: 500; }
  .actions button.primary { background: #1e3a5f; color: white; border-color: #1e3a5f; }
  @media print {
    body { padding: 16px; max-width: none; }
    .actions { display: none; }
  }
`

interface ChartImageOpts {
  width?: number
  height?: number
}

async function captureChartImage(
  el: HTMLElement | null,
  opts: ChartImageOpts = {},
): Promise<string | null> {
  if (!el) return null
  try {
    const dataUrl = await Plotly.toImage(el, { format: 'png', width: opts.width ?? 1000, height: opts.height ?? 400, scale: 2 })
    return dataUrl
  } catch {
    return null
  }
}

function openReportWindow(html: string, title: string): void {
  const w = window.open('', '_blank', 'width=1000,height=900')
  if (!w) {
    alert('Could not open the report — your browser may have blocked the popup. Allow popups for this site and try again.')
    return
  }
  w.document.open()
  w.document.write(html)
  w.document.close()
  // Slight delay so images & fonts render before the print dialog opens.
  setTimeout(() => {
    try { w.focus() } catch { /* */ }
  }, 200)
  void title
}

// ────────────────────────────────────────────────────────────────────────────
// Asset report
// ────────────────────────────────────────────────────────────────────────────

export interface AssetReportInput {
  asset: Asset
  scenario: Scenario | null
  costSummary: ScenarioCostSummary | null
  /** Direct reference to the chart's Plotly-managed div (preferred). */
  chartElement?: HTMLElement | null
}

export async function exportAssetReport({ asset, scenario, costSummary, chartElement }: AssetReportInput): Promise<void> {
  const summary = summariseAsset(asset, scenario ?? undefined)
  const chartImg = await captureChartImage(chartElement ?? null, { width: 1100, height: 420 })
  const region = regionForAsset(asset)

  const stranded = summary.stranded
  const misalignBadge = summary.misalignmentYear == null
    ? `<span class="badge green">Aligned through 2050</span>`
    : summary.misalignmentYear <= asset.reporting_year
      ? `<span class="badge red">Stranded ${esc(summary.misalignmentYear)}</span>`
      : `<span class="badge amber">Misaligns ${esc(summary.misalignmentYear)}</span>`

  const carriers = Object.keys(asset.energy)
  const totalKwh = Object.values(asset.energy).reduce((s, v) => s + (v ?? 0), 0)

  const retrofitRows = (scenario?.retrofits ?? []).map(r => `
    <tr>
      <td>${esc(r.name)}</td>
      <td class="num">${esc(r.year)}</td>
      <td>${r.impacts.map(i =>
        `<span class="badge">${esc(i.carrier)} · ${i.operation === 'remove' ? 'remove' : `${i.operation} ${esc(i.value)}${i.mode === 'percent' ? '%' : ' kWh'}`}</span>`
      ).join(' ')}</td>
      <td class="num">${r.cost?.capex_total != null ? fmtMoney(r.cost.capex_total, r.cost.currency ?? null) : '—'}</td>
    </tr>
  `).join('')

  const costRows = (costSummary?.perRetrofit ?? []).map(r => {
    const totalSavedKwh = Object.values(r.energyDelta).reduce((s, v) => s + (v as number), 0)
    return `
    <tr>
      <td>${esc(r.retrofit.name)}</td>
      <td class="num">${esc(r.retrofit.year)}</td>
      <td class="num">${fmtMoney(r.capex, r.currency)}</td>
      <td class="num">${totalSavedKwh > 0 ? fmtNumber(totalSavedKwh) : '—'}</td>
      <td class="num">${fmtMoney(r.annualSavings, r.currency)}</td>
      <td class="num">${fmtYears(r.paybackYears)}</td>
    </tr>
  `}).join('')

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(asset.name)} — CRREM Assessment Report</title>
<style>${DOC_HEAD_STYLE}</style>
</head>
<body>
<div class="actions">
  <button class="primary" onclick="window.print()">⎙ Save as PDF / Print</button>
  <button onclick="window.close()">Close</button>
</div>

<h1>${esc(asset.name)}</h1>
<div class="meta">
  ${esc(flagForCountry(asset.country))} ${esc(asset.country)}${asset.postal_code ? ` · ${esc(asset.postal_code)}` : ''}
  · ${esc(asset.property_type)}
  · ${fmtNumber(asset.gia_m2)} m² GIA
  · CRREM region: <code>${esc(region)}</code>
  · Reporting year ${esc(asset.reporting_year)}
</div>
<div class="badges">${misalignBadge}</div>

<h2>Carbon snapshot — reporting year ${esc(asset.reporting_year)}</h2>
<div class="stats">
  <div class="stat"><div class="label">Carbon intensity</div><div class="value" style="color: ${stranded ? '#dc2626' : '#065f46'}">${summary.ci.toFixed(2)}</div><div class="label">kgCO₂e/m²/yr</div></div>
  <div class="stat"><div class="label">CRREM pathway</div><div class="value">${summary.pathway.toFixed(2)}</div><div class="label">kgCO₂e/m²/yr</div></div>
  <div class="stat"><div class="label">Misalignment year</div><div class="value">${summary.misalignmentYear ?? '—'}</div><div class="label">${summary.misalignmentYear == null ? 'never' : 'first breach'}</div></div>
  <div class="stat"><div class="label">Total energy</div><div class="value">${fmtNumber(totalKwh)}</div><div class="label">kWh/yr · ${carriers.length} carrier${carriers.length === 1 ? '' : 's'}</div></div>
</div>

${chartImg ? `<h2>Trajectory 2024–2050</h2><div class="chart"><img src="${chartImg}" alt="Stranding chart"></div>` : ''}

${scenario && scenario.retrofits.length > 0 ? `
<h2>Retrofit plan — ${esc(scenario.name)}</h2>
<table>
  <thead><tr>
    <th>Retrofit</th><th class="num">Year</th><th>Impacts</th><th class="num">Capex</th>
  </tr></thead>
  <tbody>${retrofitRows}</tbody>
</table>` : ''}

${costSummary && costSummary.perRetrofit.length > 0 ? `
<h2>Cost & payback</h2>
<div class="stats">
  <div class="stat"><div class="label">Total capex</div><div class="value">${fmtMoney(costSummary.totalCapex, costSummary.currency)}</div></div>
  <div class="stat"><div class="label">Annual savings</div><div class="value">${fmtMoney(costSummary.totalAnnualSavings, costSummary.currency)}</div></div>
  <div class="stat"><div class="label">Avg payback</div><div class="value">${fmtYears(costSummary.averagePaybackYears)}</div></div>
  <div class="stat"><div class="label">Currency</div><div class="value">${esc(costSummary.currency ?? '—')}</div></div>
</div>
<table>
  <thead><tr>
    <th>Retrofit</th><th class="num">Year</th><th class="num">Capex</th><th class="num">kWh saved</th><th class="num">Annual savings</th><th class="num">Payback</th>
  </tr></thead>
  <tbody>${costRows}</tbody>
</table>` : ''}

<footer>
  Generated ${esc(new Date().toISOString().slice(0, 10))} by CRREM Admin (https://crrem-app.vercel.app).
  CRREM data: v2.05 (https://crrem.org/library/reference-implementations/).
  Method per CRREM Assessment Guide v1.01 — assessment is informational, not a substitute for a qualified energy auditor.
</footer>
</body>
</html>`

  openReportWindow(html, `${asset.name} — CRREM`)
}

// ────────────────────────────────────────────────────────────────────────────
// Portfolio report
// ────────────────────────────────────────────────────────────────────────────

export interface PortfolioReportRow {
  asset: Asset
  scenarioName: string | null
  ci2024: number
  pathway2024: number
  misalignmentYear: number | null
  giaWeight: number
}

export interface PortfolioReportInput {
  portfolio: Portfolio
  rows: PortfolioReportRow[]
  totalGia: number
  portfolioCi2024: number
  portfolioPathway2024: number
  portfolioMisalignmentYear: number | null
  chartElement?: HTMLElement | null
}

export async function exportPortfolioReport(input: PortfolioReportInput): Promise<void> {
  const { portfolio, rows, totalGia, portfolioCi2024, portfolioPathway2024, portfolioMisalignmentYear, chartElement } = input
  const chartImg = await captureChartImage(chartElement ?? null, { width: 1100, height: 420 })

  const stranded = portfolioCi2024 > portfolioPathway2024
  const misalignBadge = portfolioMisalignmentYear == null
    ? `<span class="badge green">Aligned through 2050</span>`
    : `<span class="badge ${stranded ? 'red' : 'amber'}">Misaligns ${esc(portfolioMisalignmentYear)}</span>`

  const tableRows = rows.map(r => `
    <tr>
      <td>${esc(r.asset.name)}<div style="color:#94a3b8;font-size:10px">${esc(r.asset.id)}</div></td>
      <td>${esc(flagForCountry(r.asset.country))} ${esc(r.asset.country)}</td>
      <td>${esc(r.asset.property_type)}</td>
      <td class="num">${fmtNumber(r.asset.gia_m2)}</td>
      <td class="num">${(r.giaWeight * 100).toFixed(1)}%</td>
      <td class="num">${r.ci2024.toFixed(2)}</td>
      <td class="num">${r.pathway2024.toFixed(2)}</td>
      <td class="num">${r.misalignmentYear ?? '—'}</td>
      <td>${esc(r.scenarioName ?? '—')}</td>
    </tr>
  `).join('')

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(portfolio.name)} — CRREM Portfolio Report</title>
<style>${DOC_HEAD_STYLE}</style>
</head>
<body>
<div class="actions">
  <button class="primary" onclick="window.print()">⎙ Save as PDF / Print</button>
  <button onclick="window.close()">Close</button>
</div>

<h1>${esc(portfolio.name)}</h1>
<div class="meta">
  ${rows.length} asset${rows.length === 1 ? '' : 's'} · ${fmtNumber(totalGia)} m² total GIA · GIA-weighted rollup
</div>
<div class="badges">${misalignBadge}</div>

<h2>Portfolio snapshot — 2024</h2>
<div class="stats">
  <div class="stat"><div class="label">Carbon intensity</div><div class="value" style="color: ${stranded ? '#dc2626' : '#065f46'}">${portfolioCi2024.toFixed(2)}</div><div class="label">kgCO₂e/m²/yr</div></div>
  <div class="stat"><div class="label">CRREM pathway</div><div class="value">${portfolioPathway2024.toFixed(2)}</div><div class="label">kgCO₂e/m²/yr</div></div>
  <div class="stat"><div class="label">Misalignment year</div><div class="value">${portfolioMisalignmentYear ?? '—'}</div><div class="label">${portfolioMisalignmentYear == null ? 'never' : 'first breach'}</div></div>
  <div class="stat"><div class="label">Total GIA</div><div class="value">${fmtNumber(totalGia)}</div><div class="label">m²</div></div>
</div>

${chartImg ? `<h2>Trajectory 2024–2050</h2><div class="chart"><img src="${chartImg}" alt="Portfolio chart"></div>` : ''}

<h2>Constituent assets</h2>
<table>
  <thead><tr>
    <th>Asset</th><th>Country</th><th>Type</th>
    <th class="num">GIA m²</th><th class="num">Weight</th>
    <th class="num">CI 2024</th><th class="num">Pathway</th>
    <th class="num">Misalign</th><th>Scenario</th>
  </tr></thead>
  <tbody>${tableRows}</tbody>
</table>

<footer>
  Generated ${esc(new Date().toISOString().slice(0, 10))} by CRREM Admin (https://crrem-app.vercel.app).
  CRREM data: v2.05 · Method per CRREM Assessment Guide v1.01.
</footer>
</body>
</html>`

  openReportWindow(html, `${portfolio.name} — CRREM`)
}
