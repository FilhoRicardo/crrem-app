import { useState } from 'react'
import { useStore } from '../store'
import type { Portfolio } from '../engine/types'

interface Props {
  initial: Portfolio
  isNew: boolean
  existingIds: string[]
  onCancel: () => void
  onSave: (p: Portfolio) => void
  readOnly?: boolean
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'portfolio'
}

export function emptyPortfolio(): Portfolio {
  return {
    id: '',
    name: '',
    asset_ids: [],
    weighting: 'gia',
  }
}

export default function PortfolioForm({ initial, isNew, existingIds, onCancel, onSave, readOnly }: Props) {
  const allAssets = useStore(s => s.assets)
  const allScenarios = useStore(s => s.scenarios)
  const [draft, setDraft] = useState<Portfolio>(initial)
  const [error, setError] = useState<string | null>(null)

  const toggleAsset = (assetId: string) => {
    const has = draft.asset_ids.includes(assetId)
    setDraft({
      ...draft,
      asset_ids: has ? draft.asset_ids.filter(x => x !== assetId) : [...draft.asset_ids, assetId],
    })
  }

  const setOverride = (assetId: string, scenarioId: string) => {
    const overrides = { ...(draft.scenario_overrides ?? {}) }
    if (scenarioId) overrides[assetId] = scenarioId
    else delete overrides[assetId]
    setDraft({ ...draft, scenario_overrides: Object.keys(overrides).length > 0 ? overrides : undefined })
  }

  const handleSave = () => {
    if (!draft.name.trim()) return setError('Name is required')
    if (draft.asset_ids.length === 0) return setError('Select at least one asset')
    let id = draft.id || slugify(draft.name)
    if (isNew) {
      let n = 2
      const base = id
      while (existingIds.includes(id)) id = `${base}-${n++}`
    }
    setError(null)
    onSave({ ...draft, id })
  }

  const totalGia = draft.asset_ids
    .map(aid => allAssets.find(a => a.id === aid)?.gia_m2 ?? 0)
    .reduce((s, x) => s + x, 0)

  return (
    <div className="bg-white rounded-2xl border-2 border-crrem-navy/20 shadow-sm p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">
            {isNew ? 'New portfolio' : `Edit · ${initial.name}`}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Portfolio rollups are GIA-weighted across the assets you select. Optionally pin a specific scenario per asset.
          </p>
        </div>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-5">
        <label className="block">
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1 block">Name *</span>
          <input
            value={draft.name}
            onChange={e => setDraft({ ...draft, name: e.target.value })}
            placeholder="e.g. Core European Office Portfolio"
            disabled={readOnly}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-crrem-navy disabled:bg-slate-50"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1 block">ID</span>
          <input
            value={draft.id}
            onChange={e => setDraft({ ...draft, id: slugify(e.target.value) })}
            placeholder={slugify(draft.name) || 'auto'}
            disabled={readOnly || !isNew}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono focus:outline-none focus:border-crrem-navy disabled:bg-slate-50"
          />
        </label>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-slate-700">
            Assets ({draft.asset_ids.length} selected · {totalGia.toLocaleString()} m² total)
          </h4>
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => setDraft({ ...draft, asset_ids: allAssets.map(a => a.id) })}
              disabled={readOnly}
              className="text-crrem-navy hover:underline disabled:opacity-40"
            >
              Select all
            </button>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              onClick={() => setDraft({ ...draft, asset_ids: [], scenario_overrides: undefined })}
              disabled={readOnly}
              className="text-slate-500 hover:underline disabled:opacity-40"
            >
              Clear
            </button>
          </div>
        </div>

        {allAssets.length === 0 ? (
          <p className="text-xs text-slate-400 italic px-3 py-4 border border-dashed border-slate-200 rounded-lg text-center">
            No assets in this vault yet. Add some on the Properties tab first.
          </p>
        ) : (
          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {allAssets.map(a => {
              const checked = draft.asset_ids.includes(a.id)
              const scenarios = allScenarios.filter(s => s.asset_id === a.id)
              return (
                <label key={a.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleAsset(a.id)}
                    disabled={readOnly}
                    className="w-4 h-4 accent-crrem-navy"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{a.name}</div>
                    <div className="text-xs text-slate-400 truncate">
                      {a.country} · {a.property_type} · {a.gia_m2.toLocaleString()} m²
                    </div>
                  </div>
                  {checked && scenarios.length > 0 && (
                    <select
                      value={draft.scenario_overrides?.[a.id] ?? ''}
                      onChange={e => setOverride(a.id, e.target.value)}
                      disabled={readOnly}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white"
                      onClick={e => e.stopPropagation()}
                    >
                      <option value="">— first scenario —</option>
                      {scenarios.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  )}
                </label>
              )
            })}
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 flex items-center justify-end gap-2">
        <button onClick={onCancel} className="text-sm px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-medium">
          Cancel
        </button>
        {!readOnly && (
          <button onClick={handleSave} className="text-sm px-4 py-2 rounded-lg bg-crrem-navy text-white font-medium">
            {isNew ? 'Create portfolio' : 'Save changes'}
          </button>
        )}
      </div>
    </div>
  )
}
