import { useState, useEffect } from 'react'
import type { Scenario, Retrofit, RetrofitImpact, Carrier, ECM } from '../engine/types'

interface Props {
  scenario: Scenario
  year: number
  ecms: ECM[]
  onClose: () => void
  onSave: (next: Scenario) => void
  onPickFromECM: (year: number) => void
  readOnly?: boolean
}

const CARRIERS: Carrier[] = [
  'Elec_Grid', 'District_Heating', 'District_Cooling', 'Gas', 'Oil', 'Biomass',
  'Other_Fuels', 'Renew_Consumed', 'Renew_Exported',
]

function emptyImpact(): RetrofitImpact {
  return { carrier: 'Elec_Grid', operation: 'reduce', mode: 'percent', value: 10 }
}

function emptyRetrofit(year: number): Retrofit {
  return {
    id: `r-${Date.now().toString(36)}`,
    year,
    name: 'New retrofit',
    impacts: [emptyImpact()],
    cost: { capex_total: 0, currency: 'USD' },
  }
}

interface CardProps {
  retrofit: Retrofit
  ecms: ECM[]
  onChange: (next: Retrofit) => void
  onRemove: () => void
  readOnly?: boolean
}

function RetrofitCard({ retrofit, ecms, onChange, onRemove, readOnly }: CardProps) {
  const [editing, setEditing] = useState(false)
  const ecm = retrofit.ecm_id ? ecms.find(e => e.id === retrofit.ecm_id) : undefined

  const updateImpact = (idx: number, patch: Partial<RetrofitImpact>) => {
    const next = retrofit.impacts.map((imp, i) => (i === idx ? { ...imp, ...patch } : imp))
    onChange({ ...retrofit, impacts: next })
  }

  const addImpact = () => onChange({ ...retrofit, impacts: [...retrofit.impacts, emptyImpact()] })
  const removeImpact = (idx: number) =>
    onChange({ ...retrofit, impacts: retrofit.impacts.filter((_, i) => i !== idx) })

  if (!editing) {
    return (
      <div className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-amber-100 flex-shrink-0">
          <span className="text-lg">⚙️</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">{retrofit.name}</p>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {retrofit.impacts.map((imp, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                    {imp.carrier} · {imp.operation === 'remove' ? 'remove' : `${imp.operation} ${imp.value}${imp.mode === 'percent' ? '%' : ' kWh'}`}
                  </span>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-1.5">
                {retrofit.cost?.capex_total != null && (
                  <>Capex: <span className="text-slate-600 font-medium">
                    {(retrofit.cost.currency ?? '')} {retrofit.cost.capex_total.toLocaleString()}
                  </span></>
                )}
                {ecm && <> · From ECM <span className="text-crrem-navy underline">{ecm.name}</span></>}
              </p>
            </div>
            {!readOnly && (
              <div className="flex gap-1.5 flex-shrink-0">
                <button onClick={() => setEditing(true)} className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 font-medium">Edit</button>
                <button onClick={onRemove} className="text-xs px-2.5 py-1 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 font-medium">Remove</button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 rounded-xl border-2 border-crrem-navy/40 bg-white">
      <div className="flex items-center gap-2 mb-3">
        <input
          value={retrofit.name}
          onChange={e => onChange({ ...retrofit, name: e.target.value })}
          className="flex-1 px-2 py-1 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-crrem-navy"
          placeholder="Retrofit name"
        />
        <label className="text-xs text-slate-500 flex items-center gap-1.5">
          Capex
          <input
            type="number"
            value={retrofit.cost?.capex_total ?? 0}
            onChange={e => onChange({ ...retrofit, cost: { ...(retrofit.cost ?? {}), capex_total: Number(e.target.value), currency: retrofit.cost?.currency ?? 'USD' } })}
            className="w-28 px-2 py-1 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-crrem-navy"
            placeholder="0"
          />
        </label>
        <label
          className="text-xs text-slate-500 flex items-center gap-1.5"
          title="One-time embodied carbon footprint of the retrofit (kgCO₂e). Counts manufacturing + transport + installation. Hits the carbon ledger in the install year."
        >
          Embodied (kgCO₂e)
          <input
            type="number"
            value={retrofit.cost?.embodied_carbon_kg ?? 0}
            onChange={e => onChange({ ...retrofit, cost: { ...(retrofit.cost ?? {}), embodied_carbon_kg: Number(e.target.value), currency: retrofit.cost?.currency ?? 'USD' } })}
            className="w-28 px-2 py-1 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-crrem-navy"
            placeholder="0"
          />
        </label>
      </div>
      <div className="space-y-2">
        {retrofit.impacts.map((imp, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <select
              value={imp.carrier}
              onChange={e => updateImpact(i, { carrier: e.target.value as Carrier })}
              className="px-2 py-1 border border-slate-200 rounded-lg bg-white"
            >
              {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={imp.operation}
              onChange={e => updateImpact(i, { operation: e.target.value as RetrofitImpact['operation'] })}
              className="px-2 py-1 border border-slate-200 rounded-lg bg-white"
            >
              <option value="reduce">reduce</option>
              <option value="add">add</option>
              <option value="remove">remove</option>
            </select>
            {imp.operation !== 'remove' && (
              <>
                <input
                  type="number"
                  value={imp.value}
                  onChange={e => updateImpact(i, { value: Number(e.target.value) })}
                  className="w-20 px-2 py-1 border border-slate-200 rounded-lg"
                />
                <select
                  value={imp.mode}
                  onChange={e => updateImpact(i, { mode: e.target.value as RetrofitImpact['mode'] })}
                  className="px-2 py-1 border border-slate-200 rounded-lg bg-white"
                >
                  <option value="percent">%</option>
                  <option value="absolute">kWh</option>
                </select>
              </>
            )}
            <button onClick={() => removeImpact(i)} className="ml-auto text-red-500 hover:text-red-700 text-sm">×</button>
          </div>
        ))}
        <button onClick={addImpact} className="text-xs text-crrem-navy hover:underline">+ Add impact</button>
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={() => setEditing(false)} className="text-xs px-3 py-1.5 rounded-lg bg-crrem-navy text-white font-medium">Done</button>
      </div>
    </div>
  )
}

export default function RetrofitDrawer({ scenario, year, ecms, onClose, onSave, onPickFromECM, readOnly }: Props) {
  const [draft, setDraft] = useState<Scenario>(scenario)

  // Sync draft when scenario or year changes externally.
  useEffect(() => { setDraft(scenario) }, [scenario.id, year])

  const yearRetrofits = draft.retrofits.filter(r => r.year === year)
  const totalCapex = yearRetrofits.reduce((s, r) => s + (r.cost?.capex_total ?? 0), 0)
  const dirty = JSON.stringify(draft) !== JSON.stringify(scenario)

  const updateRetrofit = (id: string, next: Retrofit) => {
    setDraft({ ...draft, retrofits: draft.retrofits.map(r => (r.id === id ? next : r)) })
  }

  const removeRetrofit = (id: string) => {
    setDraft({ ...draft, retrofits: draft.retrofits.filter(r => r.id !== id) })
  }

  const addRetrofit = () => {
    setDraft({ ...draft, retrofits: [...draft.retrofits, emptyRetrofit(year)] })
  }

  const handleSave = () => {
    onSave(draft)
    onClose()
  }

  const handleClose = () => {
    if (dirty && !readOnly && !confirm('Discard unsaved changes?')) return
    onClose()
  }

  return (
    <div className="bg-white rounded-2xl border-2 shadow-sm border-crrem-navy/30">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-bold bg-crrem-navy">
            {String(year).slice(-2)}
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-800">Retrofits in {year}</h4>
            <p className="text-xs text-slate-400">
              {yearRetrofits.length} intervention{yearRetrofits.length === 1 ? '' : 's'}
              {totalCapex > 0 && ` · Total capex ${totalCapex.toLocaleString()}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dirty && !readOnly && (
            <button onClick={handleSave} className="text-xs bg-crrem-green text-white font-medium px-3 py-1.5 rounded-lg">
              Save
            </button>
          )}
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
        </div>
      </div>

      <div className="p-5 flex flex-col gap-3">
        {yearRetrofits.length === 0 && (
          <p className="text-sm text-slate-400 italic text-center py-3">
            No retrofits scheduled for {year}.
          </p>
        )}
        {yearRetrofits.map(r => (
          <RetrofitCard
            key={r.id}
            retrofit={r}
            ecms={ecms}
            onChange={next => updateRetrofit(r.id, next)}
            onRemove={() => removeRetrofit(r.id)}
            readOnly={readOnly}
          />
        ))}

        {!readOnly && (
          <div className="flex gap-3 pt-1">
            <button onClick={addRetrofit} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white shadow-sm bg-crrem-navy">
              + Add retrofit
            </button>
            <button onClick={() => onPickFromECM(year)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border-2 border-dashed text-slate-600 hover:border-slate-400 transition-colors border-crrem-navy/40">
              📚 Pick from ECM library
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
