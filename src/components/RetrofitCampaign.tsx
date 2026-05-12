import { useMemo, useState } from 'react'
import type { Asset, ECM, Retrofit, Scenario } from '../engine/types'
import { useStore } from '../store'
import { flagForCountry } from '../engine/summary'

interface Props {
  onClose: () => void
}

const PROPERTY_TYPES = [
  'Office', 'Shopping Center', 'Retail High Street', 'Retail Warehouse',
  'Hotel', 'Residential', 'Mixed Use',
  'Distribution Warehouse Warm', 'Distribution Warehouse Cool',
  'Industrial', 'Healthcare', 'Education', 'Other',
]

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'scenario'
}

function buildRetrofitFromECM(ecm: ECM, year: number, asset: Asset): Retrofit {
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
  return {
    id: `r-${ecm.id}-${year}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    year,
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
  }
}

export default function RetrofitCampaign({ onClose }: Props) {
  const allAssets = useStore(s => s.assets)
  const allScenarios = useStore(s => s.scenarios)
  const portfolios = useStore(s => s.portfolios)
  const ecms = useStore(s => s.ecms)
  const saveScenario = useStore(s => s.saveScenario)
  const vaultMode = useStore(s => s.vaultMode)
  const readOnly = vaultMode !== 'fsa'

  const [scope, setScope] = useState<'all' | 'portfolio' | 'property_type'>('all')
  const [portfolioId, setPortfolioId] = useState<string>(portfolios[0]?.id ?? '')
  const [propertyType, setPropertyType] = useState<string>('Office')
  const [ecmId, setEcmId] = useState<string>(ecms[0]?.id ?? '')
  const [year, setYear] = useState<number>(new Date().getFullYear() + 2)
  const [targetMode, setTargetMode] = useState<'new' | 'existing'>('new')
  const [newScenarioName, setNewScenarioName] = useState<string>('Campaign retrofit')
  const [busy, setBusy] = useState(false)
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set())

  const ecm = useMemo(() => ecms.find(e => e.id === ecmId) ?? null, [ecms, ecmId])

  const targetAssets = useMemo<Asset[]>(() => {
    let list = allAssets
    if (scope === 'portfolio') {
      const p = portfolios.find(x => x.id === portfolioId)
      if (!p) return []
      list = list.filter(a => p.asset_ids.includes(a.id))
    } else if (scope === 'property_type') {
      list = list.filter(a => a.property_type === propertyType)
    }
    return list.filter(a => !excludedIds.has(a.id))
  }, [allAssets, portfolios, scope, portfolioId, propertyType, excludedIds])

  const toggleExclude = (id: string) => {
    const next = new Set(excludedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExcludedIds(next)
  }

  const handleApply = async () => {
    if (!ecm || targetAssets.length === 0 || readOnly) return
    setBusy(true)
    try {
      const baseSlug = slugify(newScenarioName)
      for (const asset of targetAssets) {
        const retrofit = buildRetrofitFromECM(ecm, year, asset)
        let scenario: Scenario
        if (targetMode === 'new') {
          // New scenario per asset, named after the campaign
          let id = `${asset.id}-${baseSlug}`
          let n = 2
          while (allScenarios.some(s => s.id === id)) id = `${asset.id}-${baseSlug}-${n++}`
          scenario = {
            id,
            name: newScenarioName,
            asset_id: asset.id,
            retrofits: [retrofit],
          }
        } else {
          // Append to the asset's first existing scenario
          const existing = allScenarios.find(s => s.asset_id === asset.id)
          if (!existing) continue  // skip assets with no scenario in 'existing' mode
          scenario = { ...existing, retrofits: [...existing.retrofits, retrofit] }
        }
        await saveScenario(scenario)
      }
      onClose()
    } catch (e) {
      alert(`Campaign apply failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-crrem-navy">
          <div>
            <h3 className="text-base font-semibold text-white">Retrofit campaign</h3>
            <p className="text-xs text-white/60 mt-0.5">
              Apply one ECM across many assets in one click. Capex + embodied carbon auto-fill from ECM × each asset's GIA.
            </p>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Scope selector */}
          <div>
            <label className="text-xs uppercase tracking-wider text-slate-500 mb-1 block">Scope</label>
            <div className="grid grid-cols-3 gap-2">
              {(['all', 'portfolio', 'property_type'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={`text-xs px-3 py-2 rounded-lg font-medium transition-colors ${
                    scope === s ? 'bg-crrem-navy text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {s === 'all' ? 'All assets' : s === 'portfolio' ? 'A portfolio' : 'By property type'}
                </button>
              ))}
            </div>
            {scope === 'portfolio' && (
              <select
                value={portfolioId}
                onChange={e => setPortfolioId(e.target.value)}
                className="mt-2 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
              >
                {portfolios.map(p => <option key={p.id} value={p.id}>{p.name} ({p.asset_ids.length})</option>)}
              </select>
            )}
            {scope === 'property_type' && (
              <select
                value={propertyType}
                onChange={e => setPropertyType(e.target.value)}
                className="mt-2 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
              >
                {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
          </div>

          {/* ECM + year */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wider text-slate-500 mb-1 block">ECM</label>
              <select
                value={ecmId}
                onChange={e => setEcmId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
              >
                {ecms.map(e => <option key={e.id} value={e.id}>{e.category} · {e.name}</option>)}
              </select>
              {ecm && ecm.cost && (
                <p className="text-xs text-slate-400 mt-1">
                  {ecm.cost.capex_per_m2_typical && `Typical capex ${ecm.cost.capex_per_m2_typical}/m² · `}
                  {ecm.cost.embodied_carbon_kg_per_m2 && `Embodied ${ecm.cost.embodied_carbon_kg_per_m2} kgCO₂e/m² · `}
                  {ecm.payback_years_range && `Payback ${ecm.payback_years_range[0]}–${ecm.payback_years_range[1]} yr`}
                </p>
              )}
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-slate-500 mb-1 block">Year</label>
              <input
                type="number"
                min={2024}
                max={2050}
                value={year}
                onChange={e => setYear(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          {/* Target scenario mode */}
          <div>
            <label className="text-xs uppercase tracking-wider text-slate-500 mb-1 block">Target scenario</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setTargetMode('new')}
                className={`text-xs px-3 py-2 rounded-lg font-medium transition-colors ${
                  targetMode === 'new' ? 'bg-crrem-navy text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Create new scenario per asset
              </button>
              <button
                onClick={() => setTargetMode('existing')}
                className={`text-xs px-3 py-2 rounded-lg font-medium transition-colors ${
                  targetMode === 'existing' ? 'bg-crrem-navy text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Append to first existing scenario
              </button>
            </div>
            {targetMode === 'new' && (
              <input
                value={newScenarioName}
                onChange={e => setNewScenarioName(e.target.value)}
                placeholder="Scenario name"
                className="mt-2 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            )}
          </div>

          {/* Targets list with exclude toggles */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs uppercase tracking-wider text-slate-500">
                Target assets ({targetAssets.length})
              </label>
              {excludedIds.size > 0 && (
                <button
                  onClick={() => setExcludedIds(new Set())}
                  className="text-xs text-crrem-navy hover:underline"
                >
                  Re-include all ({excludedIds.size} excluded)
                </button>
              )}
            </div>
            {targetAssets.length === 0 ? (
              <p className="text-xs text-slate-400 italic px-3 py-3 border border-dashed border-slate-200 rounded-lg text-center">
                No assets match the selected scope.
              </p>
            ) : (
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {(scope === 'all' ? allAssets : targetAssets.concat(
                  allAssets.filter(a => excludedIds.has(a.id) && (
                    scope === 'portfolio'
                      ? portfolios.find(p => p.id === portfolioId)?.asset_ids.includes(a.id)
                      : scope === 'property_type'
                        ? a.property_type === propertyType
                        : false
                  )),
                )).map(a => {
                  const excluded = excludedIds.has(a.id)
                  const inScope = scope === 'all' ? true
                    : scope === 'portfolio' ? !!portfolios.find(p => p.id === portfolioId)?.asset_ids.includes(a.id)
                    : a.property_type === propertyType
                  if (!inScope) return null
                  return (
                    <label key={a.id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!excluded}
                        onChange={() => toggleExclude(a.id)}
                        className="w-4 h-4 accent-crrem-navy"
                      />
                      <span className="text-lg leading-none">{flagForCountry(a.country)}</span>
                      <span className={`flex-1 text-sm ${excluded ? 'text-slate-400 line-through' : 'text-slate-800 font-medium'}`}>
                        {a.name}
                      </span>
                      <span className={`text-xs ${excluded ? 'text-slate-300' : 'text-slate-500'}`}>
                        {a.property_type} · {a.gia_m2.toLocaleString()} m²
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          {/* Apply */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              {targetAssets.length === 0 || !ecm
                ? 'Pick an ECM and at least one target asset.'
                : `Will create ${targetAssets.length} ${targetMode === 'new' ? 'new scenario' : 'retrofit'}${targetAssets.length === 1 ? '' : 's'}.`}
              {readOnly && (
                <span className="ml-2 text-amber-600">· read-only (sample vault)</span>
              )}
            </p>
            <div className="flex gap-2">
              <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-medium">
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={busy || readOnly || !ecm || targetAssets.length === 0}
                className="text-sm px-4 py-2 rounded-lg bg-crrem-navy text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy ? 'Applying…' : `Apply to ${targetAssets.length} asset${targetAssets.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
