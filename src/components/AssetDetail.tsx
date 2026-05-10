import { useMemo, useState, useEffect } from 'react'
import { useStore } from '../store'
import StrandingChart, { buildScenarioTrajectories } from './StrandingChart'
import Timeline from './Timeline'
import RetrofitDrawer from './RetrofitDrawer'
import ScenarioPanel from './ScenarioPanel'
import { efProvider, pathwayProvider } from '../engine/providers'
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
      <div className="flex items-start justify-between">
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
      </div>

      <StrandingChart
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
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs uppercase tracking-wider text-slate-400">Editing scenario</span>
              <div className="text-sm font-semibold text-slate-700 mt-0.5">{editScenario.name}</div>
            </div>
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

          <Timeline
            scenario={editScenario}
            strandingYear={timelineStranding}
            selectedYear={selectedYear}
            onSelectYear={setSelectedYear}
          />

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
    </main>
  )
}
