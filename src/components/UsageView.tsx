import { useMemo, useState, useEffect } from 'react'
import { useStore } from '../store'
import type { Asset, YearActual } from '../engine/types'
import { flagForCountry } from '../engine/summary'
import ActualsEditor from './ActualsEditor'
import TemplateButton from './TemplateButton'

function yearsCovered(actuals: YearActual[] | undefined): number[] {
  if (!actuals) return []
  return [...new Set(actuals.map(a => a.year))].sort((a, b) => a - b)
}

function monthsRecorded(a: YearActual): number {
  if (a.annual && Object.keys(a.annual).length > 0) return 12
  if (!a.monthly) return 0
  let max = 0
  for (const carrier of Object.keys(a.monthly)) {
    const arr = a.monthly[carrier as keyof typeof a.monthly]
    if (!Array.isArray(arr)) continue
    let count = 0
    for (const v of arr) if (typeof v === 'number') count++
    if (count > max) max = count
  }
  return max
}

export default function UsageView() {
  const assets = useStore(s => s.assets)
  const saveAsset = useStore(s => s.saveAsset)
  const vaultMode = useStore(s => s.vaultMode)
  const readOnly = vaultMode !== 'fsa'

  const [selectedId, setSelectedId] = useState<string | null>(() => assets[0]?.id ?? null)
  useEffect(() => {
    if (selectedId && !assets.some(a => a.id === selectedId)) {
      setSelectedId(assets[0]?.id ?? null)
    } else if (!selectedId && assets.length > 0) {
      setSelectedId(assets[0].id)
    }
  }, [assets, selectedId])

  const selected = useMemo(
    () => assets.find(a => a.id === selectedId) ?? null,
    [assets, selectedId],
  )

  const [draft, setDraft] = useState<YearActual[]>(selected?.actuals ?? [])
  useEffect(() => {
    setDraft(selected?.actuals ?? [])
  }, [selected?.id, selected?.actuals])

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(selected?.actuals ?? []),
    [draft, selected?.actuals],
  )

  const handleSave = () => {
    if (!selected) return
    const next: Asset = { ...selected, actuals: draft.length > 0 ? draft : undefined }
    saveAsset(next)
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Sidebar — assets with their coverage summary */}
      <aside className="w-72 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Usage tracking</span>
          <span className="text-xs text-slate-400">{assets.length} asset{assets.length === 1 ? '' : 's'}</span>
        </div>
        <div className="overflow-y-auto flex-1 p-2 flex flex-col gap-1.5">
          {assets.length === 0 && (
            <p className="text-xs text-slate-400 px-3 py-6 text-center">
              No assets yet — add one from the <strong>Properties</strong> tab.
            </p>
          )}
          {assets.map(a => {
            const years = yearsCovered(a.actuals)
            const active = a.id === selectedId
            return (
              <button
                key={a.id}
                onClick={() => setSelectedId(a.id)}
                className={`text-left rounded-xl p-3 cursor-pointer transition-colors ${
                  active
                    ? 'bg-crrem-navy text-white'
                    : 'bg-slate-50 border border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={`font-medium text-sm leading-snug ${active ? 'text-white' : 'text-slate-800'}`}>
                    {a.name}
                  </span>
                  <span className="text-xl ml-1 leading-none">{flagForCountry(a.country)}</span>
                </div>
                <div className={`text-xs mt-0.5 ${active ? 'text-white/60' : 'text-slate-500'}`}>
                  {a.property_type}
                </div>
                <div className={`text-xs mt-2 flex items-center gap-1.5 ${active ? 'text-white/80' : 'text-slate-600'}`}>
                  {years.length === 0 ? (
                    <span className={active ? 'text-white/50' : 'text-slate-400'}>No measured years</span>
                  ) : (
                    <>
                      <span className="font-semibold">{years.length}</span>
                      <span className={active ? 'text-white/60' : 'text-slate-500'}>year{years.length === 1 ? '' : 's'} recorded</span>
                      <span className={`ml-auto text-xs px-1.5 py-0.5 rounded ${active ? 'bg-white/20' : 'bg-emerald-100 text-emerald-700'}`}>
                        {years[0]}–{years[years.length - 1]}
                      </span>
                    </>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      {/* Main pane — ActualsEditor for selected asset */}
      <main className="flex-1 overflow-y-auto bg-slate-50 p-6 flex flex-col gap-4">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-xl font-semibold text-slate-800">
              {selected ? `Usage · ${selected.name}` : 'Usage'}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Record measured monthly meter readings. Per the CRREM method, actuals override the projected baseline for that year and the chart shows them as a solid line.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <TemplateButton kind="asset" label="Asset template" />
            {selected && dirty && (
              <button
                onClick={handleSave}
                disabled={readOnly}
                className="text-sm px-4 py-2 rounded-lg bg-crrem-green text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Save changes
              </button>
            )}
          </div>
        </div>

        {!selected ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
            <p className="text-sm text-slate-500">
              Pick an asset from the left to record measured energy.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
                <span>{flagForCountry(selected.country)} {selected.country}</span>
                <span className="text-slate-300">|</span>
                <span>{selected.property_type}</span>
                <span className="text-slate-300">|</span>
                <span>{selected.gia_m2.toLocaleString()} m² GIA</span>
                <span className="text-slate-300">|</span>
                <span>Reporting yr {selected.reporting_year}</span>
              </div>
              {(() => {
                const yrs = yearsCovered(draft)
                if (yrs.length === 0) return null
                const totalMonths = draft.reduce((s, a) => s + monthsRecorded(a), 0)
                return (
                  <span className="text-xs text-slate-500">
                    {yrs.length} year{yrs.length === 1 ? '' : 's'} ·{' '}
                    {totalMonths} month{totalMonths === 1 ? '' : 's'} recorded
                  </span>
                )
              })()}
            </div>
            <ActualsEditor
              asset={{
                energy: selected.energy,
                reporting_year: selected.reporting_year,
                actuals: draft,
              }}
              onChange={setDraft}
              readOnly={readOnly}
            />
          </div>
        )}

        {readOnly && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
            <p className="font-semibold">Read-only mode</p>
            <p className="mt-1 text-amber-800/80">
              You're in the bundled sample vault. To save measured readings, close the vault and open a real folder using <strong>Open vault folder…</strong> (Chrome or Edge desktop only).
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
