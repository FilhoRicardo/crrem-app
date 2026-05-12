import { useMemo, useState, useEffect, useRef } from 'react'
import { useStore } from '../store'
import StrandingChart, { buildScenarioTrajectories, type StrandingChartHandle } from './StrandingChart'
import Timeline from './Timeline'
import RetrofitDrawer from './RetrofitDrawer'
import ScenarioPanel from './ScenarioPanel'
import CostSummaryCard from './CostSummaryCard'
import MACCChart from './MACCChart'
import ScenarioCompare from './ScenarioCompare'
import { efProvider, pathwayProvider } from '../engine/providers'
import { analyseScenarioCost } from '../engine/cost'
import { assetToMarkdown } from '../vault/loader'
import { downloadText } from '../utils/download'
import { exportAssetReport } from '../utils/report'
import type { Asset, Scenario, Retrofit } from '../engine/types'

const FLAGS: Record<string, string> = {
  USA: '🇺🇸', 'United States': '🇺🇸',
  'Hong Kong': '🇭🇰', HK: '🇭🇰',
  'United Kingdom': '🇬🇧', UK: '🇬🇧',
  Australia: '🇦🇺', AU: '🇦🇺',
}

interface Props {
  asset: Asset
}

export default function AssetDetail({ asset }: Props) {
  const chartRef = useRef<StrandingChartHandle>(null)
  const [showCompare, setShowCompare] = useState(false)
  const allScenarios = useStore(s => s.scenarios)
  const ecms = useStore(s => s.ecms)
  const activeIds = useStore(s => s.activeScenarioIds)
  const toggleScenario = useStore(s => s.toggleScenario)
  const saveScenario = useStore(s => s.saveScenario)
  const setECMPanelOpen = useStore(s => s.setECMPanelOpen)
  const vaultMode = useStore(s => s.vaultMode)
  const readOnly = vaultMode !== 'fsa'

  const assetScenarios = useMemo(
    () => allScenarios.filter(s => s.asset_id === asset.id),
    [allScenarios, asset.id],
  )
  const activeScenarios = useMemo(
    () => assetScenarios.filter(s => activeIds.includes(s.id)),
    [assetScenarios, activeIds],
  )

  // Pick the first active scenario for the timeline
  const [editScenarioId, setEditScenarioId] = useState<string | null>(null)
  const editScenario = useMemo(
    () => assetScenarios.find(s => s.id === editScenarioId)
      ?? activeScenarios[0]
      ?? assetScenarios[0]
      ?? null,
    [assetScenarios, activeScenarios, editScenarioId],
  )
  const [selectedYear, setSelectedYear] = useState<number | null>(null)

  useEffect(() => {
    setSelectedYear(null)
    setEditScenarioId(null)
  }, [asset.id])

  // Compute trajectories for highlighting stranding year on timeline
  const series = useMemo(
    () => buildScenarioTrajectories(asset, activeScenarios, efProvider, pathwayProvider, 2024, 2050),
    [asset, activeScenarios],
  )

  const timelineStranding = useMemo(() => {
    if (!editScenario) return null
    const found = series.find(s => s.scenario.id === editScenario.id)
    return found?.misalignmentYear ?? null
  }, [series, editScenario])

  const handleSaveScenario = (next: Scenario) => {
    saveScenario(next)
  }

  const handlePickFromECM = (_year: number) => {
    setECMPanelOpen(true)
  }

  // Apply ECM hook (used by ECMLibrary side panel)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { ecmId: string; year: number }
      const targetScenario = editScenario
      if (!targetScenario) return
      const ecm = ecms.find(x => x.id === detail.ecmId)
      if (!ecm) return
      // Auto-fill capex + embodied from the ECM's per-m² rates × asset GIA.
      // Falls back to capex_total / embodied_carbon_kg if the ECM ships absolute values.
      const ecmCost = ecm.cost
      const capexPerM2 = ecmCost?.capex_per_m2_typical ?? ecmCost?.capex_per_m2
      const capexAbs = ecmCost?.capex_total
      const capexTotal = typeof capexPerM2 === 'number'
        ? capexPerM2 * asset.gia_m2
        : typeof capexAbs === 'number' ? capexAbs : undefined
      const embodiedPerM2 = ecmCost?.embodied_carbon_kg_per_m2
      const embodiedAbs = ecmCost?.embodied_carbon_kg
      const embodiedKg = typeof embodiedPerM2 === 'number'
        ? embodiedPerM2 * asset.gia_m2
        : typeof embodiedAbs === 'number' ? embodiedAbs : undefined
      const lifetime = ecm.payback_years_range
        // ECM doesn't carry lifetime directly; leave blank unless we want to default
        ? undefined
        : undefined
      const newRetrofit: Retrofit = {
        id: `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        year: detail.year,
        name: ecm.name,
        ecm_id: ecm.id,
        impacts: ecm.impacts.map(imp => ({
          carrier: imp.carrier,
          operation: imp.operation,
          mode: imp.mode,
          value: imp.value_typical,
        })),
        cost: (capexTotal !== undefined || embodiedKg !== undefined)
          ? {
              ...(capexTotal !== undefined ? { capex_total: capexTotal } : {}),
              ...(embodiedKg !== undefined ? { embodied_carbon_kg: embodiedKg } : {}),
              currency: ecmCost?.currency ?? asset.utility_prices?.currency,
            }
          : undefined,
        ...(lifetime !== undefined ? { lifetime_years: lifetime } : {}),
      }
      const next: Scenario = {
        ...targetScenario,
        retrofits: [...targetScenario.retrofits, newRetrofit],
      }
      saveScenario(next)
      setSelectedYear(detail.year)
    }
    window.addEventListener('crrem:apply-ecm', handler)
    return () => window.removeEventListener('crrem:apply-ecm', handler)
  }, [editScenario, ecms, saveScenario])

  const flag = FLAGS[asset.country] ?? '🏢'

  return (
    <main className="flex-1 overflow-y-auto bg-slate-50 p-6 flex flex-col gap-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">{asset.name}</h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-slate-500">
            <span>{flag} {asset.country}{asset.postal_code ? ` · ${asset.postal_code}` : ''}</span>
            <span className="text-slate-300">|</span>
            <span>{asset.property_type}</span>
            <span className="text-slate-300">|</span>
            <span>{asset.gia_m2.toLocaleString()} m² GIA</span>
            <span className="text-slate-300">|</span>
            <span>Reporting year: {asset.reporting_year}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const cost = editScenario ? analyseScenarioCost(asset, editScenario.retrofits) : null
              exportAssetReport({
                asset,
                scenario: editScenario,
                costSummary: cost,
                chartElement: chartRef.current?.getPlotElement() ?? null,
              })
            }}
            className="text-xs px-3 py-1.5 rounded-lg border border-crrem-navy text-crrem-navy hover:bg-crrem-navy hover:text-white font-medium flex items-center gap-1.5 transition-colors"
            title="Open a printable assessment report — save as PDF from the print dialog"
          >
            <span>⎙</span> Export PDF
          </button>
          <button
            onClick={() => downloadText(`${asset.id}.md`, assetToMarkdown(asset))}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium flex items-center gap-1.5"
            title="Download this asset as .md"
          >
            <span>⬇</span> Download
          </button>
        </div>
      </div>

      <StrandingChart
        ref={chartRef}
        asset={asset}
        scenarios={activeScenarios.length > 0 ? activeScenarios : assetScenarios.slice(0, 1)}
        getEF={efProvider}
        getPathway={pathwayProvider}
      />

      <ScenarioPanel
        assetId={asset.id}
        scenarios={assetScenarios}
        activeIds={activeIds}
        onToggle={toggleScenario}
        readOnly={readOnly}
      />

      {editScenario && (
        <>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center justify-between flex-wrap gap-2">
            <div>
              <span className="text-xs uppercase tracking-wider text-slate-400">Editing scenario</span>
              <div className="text-sm font-semibold text-slate-700 mt-0.5">{editScenario.name}</div>
            </div>
            <div className="flex items-center gap-2">
              {assetScenarios.length >= 2 && (
                <button
                  onClick={() => setShowCompare(true)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-crrem-navy text-crrem-navy hover:bg-crrem-navy hover:text-white font-medium transition-colors"
                  title="Compare two scenarios side-by-side with a delta on every metric"
                >
                  ⇄ Compare scenarios
                </button>
              )}
              <select
                value={editScenario.id}
                onChange={e => setEditScenarioId(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white"
              >
                {assetScenarios.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <Timeline
            scenario={editScenario}
            strandingYear={timelineStranding}
            selectedYear={selectedYear}
            onSelectYear={setSelectedYear}
          />

          <CostSummaryCard asset={asset} scenario={editScenario} />

          <MACCChart asset={asset} scenario={editScenario} />

          {selectedYear != null && (
            <RetrofitDrawer
              scenario={editScenario}
              year={selectedYear}
              ecms={ecms}
              onClose={() => setSelectedYear(null)}
              onSave={handleSaveScenario}
              onPickFromECM={handlePickFromECM}
              readOnly={readOnly}
            />
          )}
        </>
      )}

      {showCompare && (
        <ScenarioCompare
          asset={asset}
          scenarios={assetScenarios}
          initialBaselineId={assetScenarios[0]?.id ?? null}
          initialAlternativeId={editScenario?.id ?? assetScenarios[1]?.id ?? null}
          onClose={() => setShowCompare(false)}
        />
      )}
    </main>
  )
}
