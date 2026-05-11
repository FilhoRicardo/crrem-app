import { useState } from 'react'
import { useStore } from '../store'
import type { Scenario } from '../engine/types'
import { scenarioToMarkdown, importScenarioFile } from '../vault/loader'
import { downloadText } from '../utils/download'
import TemplateButton from './TemplateButton'
import ImportButton from './ImportButton'

interface Props {
  assetId: string
  scenarios: Scenario[]
  activeIds: string[]
  onToggle: (id: string) => void
  readOnly?: boolean
}

const PALETTE = ['#2d7a4f', '#1e3a5f', '#d97706', '#7c3aed', '#0891b2', '#dc2626', '#0d9488']

function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

export default function ScenarioPanel({ assetId, scenarios, activeIds, onToggle, readOnly }: Props) {
  const saveScenario = useStore(s => s.saveScenario)
  const deleteScenario = useStore(s => s.deleteScenario)
  const allScenarios = useStore(s => s.scenarios)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newBranchFrom, setNewBranchFrom] = useState<string>('')

  const handleCreate = () => {
    const name = newName.trim()
    if (!name) return
    const baseId = slugify(`${assetId}-${name}`)
    let id = baseId
    let n = 2
    while (allScenarios.some(x => x.id === id)) {
      id = `${baseId}-${n++}`
    }
    const parent = newBranchFrom ? scenarios.find(s => s.id === newBranchFrom) : undefined
    const next: Scenario = {
      id,
      name,
      asset_id: assetId,
      parent_scenario_id: parent?.id,
      // Branch = full copy of parent retrofits (with fresh IDs)
      retrofits: parent
        ? parent.retrofits.map(r => ({ ...r, id: `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}` }))
        : [],
    }
    saveScenario(next).then(() => {
      onToggle(id)
    })
    setNewName('')
    setNewBranchFrom('')
    setShowNew(false)
  }

  const handleDelete = (id: string) => {
    if (!confirm(`Delete scenario? Moved to trash/scenarios/.`)) return
    deleteScenario(id)
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <span className="text-sm font-semibold text-slate-700">Scenarios</span>
        <div className="flex gap-2">
          <TemplateButton kind="scenario" variant="ghost" />
          <ImportButton
            label="Import"
            disabled={readOnly}
            variant="ghost"
            onImport={async file => {
              const s = await importScenarioFile(file)
              if (s.asset_id !== assetId) {
                if (!confirm(`This scenario references asset "${s.asset_id}" but you're viewing "${assetId}". Re-link it to this asset?`)) return
                s.asset_id = assetId
              }
              await saveScenario(s)
              onToggle(s.id)
            }}
          />
          {!readOnly && (
            <button
              onClick={() => setShowNew(s => !s)}
              className="text-xs text-white px-3 py-1.5 rounded-lg font-medium shadow-sm bg-crrem-navy"
            >
              + New scenario
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {scenarios.length === 0 && (
          <p className="text-xs text-slate-400 italic">No scenarios for this asset.</p>
        )}
        {scenarios.map((s, idx) => {
          const active = activeIds.includes(s.id)
          const colour = PALETTE[idx % PALETTE.length]
          return (
            <label
              key={s.id}
              className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl border-2 cursor-pointer select-none transition-colors ${
                active ? 'bg-slate-50' : 'border-slate-200 bg-white'
              }`}
              style={active ? { borderColor: colour + '60', backgroundColor: colour + '10' } : undefined}
            >
              <input
                type="checkbox"
                checked={active}
                onChange={() => onToggle(s.id)}
                className="w-4 h-4 accent-crrem-navy"
              />
              <span className={`text-sm font-medium ${active ? '' : 'text-slate-700'}`} style={active ? { color: colour } : undefined}>
                {s.name}
              </span>
              {s.retrofits.length > 0 && (() => {
                const capex = s.retrofits.reduce((sum, r) => sum + (r.cost?.capex_total ?? 0), 0)
                const currency = s.retrofits.find(r => r.cost?.currency)?.cost?.currency ?? ''
                return (
                  <span className="text-xs text-slate-400">
                    {s.retrofits.length} retrofit{s.retrofits.length === 1 ? '' : 's'}
                    {capex > 0 && ` · ${currency} ${capex.toLocaleString()}`}
                  </span>
                )
              })()}
              <svg width="24" height="6"><line x1="0" y1="3" x2="24" y2="3" stroke={colour} strokeWidth={2}/></svg>
              <button
                onClick={(e) => {
                  e.preventDefault()
                  downloadText(`${s.id}.md`, scenarioToMarkdown(s))
                }}
                className="ml-1 text-slate-300 hover:text-crrem-navy text-sm leading-none"
                title="Download as .md"
              >
                ⬇
              </button>
              {!readOnly && (
                <button
                  onClick={(e) => { e.preventDefault(); handleDelete(s.id) }}
                  className="ml-1 text-slate-300 hover:text-red-500 text-xs"
                  title="Delete (move to trash)"
                >
                  ×
                </button>
              )}
            </label>
          )
        })}
      </div>

      {showNew && !readOnly && (
        <div className="mt-3 p-3 border-t border-slate-100 space-y-2">
          <div className="flex gap-2">
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
              placeholder="Scenario name (e.g. LED + PV)"
              className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-crrem-navy"
            />
            <select
              value={newBranchFrom}
              onChange={e => setNewBranchFrom(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
            >
              <option value="">(empty scenario)</option>
              {scenarios.map(s => (
                <option key={s.id} value={s.id}>Branch from: {s.name}</option>
              ))}
            </select>
            <button onClick={handleCreate} className="text-xs bg-crrem-navy text-white px-3 py-2 rounded-lg font-medium">Create</button>
            <button onClick={() => setShowNew(false)} className="text-xs text-slate-500 px-2">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
