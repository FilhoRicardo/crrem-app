import { useState, useMemo, useRef, useEffect } from 'react'
import { useStore } from '../store'
import { parseFrontmatter } from '../vault/loader'
import type { ECM } from '../engine/types'

const CATEGORY_COLOURS: Record<string, string> = {
  Lighting: 'bg-amber-100 text-amber-700',
  HVAC: 'bg-blue-100 text-blue-700',
  Renewables: 'bg-yellow-100 text-yellow-700',
  Envelope: 'bg-emerald-100 text-emerald-700',
  Controls: 'bg-sky-100 text-sky-700',
  Metering: 'bg-purple-100 text-purple-700',
  Other: 'bg-slate-100 text-slate-700',
}

function categoryClass(cat: string): string {
  return CATEGORY_COLOURS[cat] ?? CATEGORY_COLOURS.Other
}

export default function ECMLibrary() {
  const open = useStore(s => s.ecmPanelOpen)
  const setOpen = useStore(s => s.setECMPanelOpen)
  const ecms = useStore(s => s.ecms)
  const saveECM = useStore(s => s.saveECM)
  const vaultMode = useStore(s => s.vaultMode)
  const readOnly = vaultMode !== 'fsa'
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string>('')
  const [applyFor, setApplyFor] = useState<string | null>(null) // ECM id pending apply
  const [yearInput, setYearInput] = useState('2030')

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  const categories = useMemo(() => {
    const set = new Set<string>()
    ecms.forEach(e => set.add(e.category))
    return [...set].sort()
  }, [ecms])

  const filtered = useMemo(() => {
    return ecms.filter(e => {
      if (category && e.category !== category) return false
      if (search) {
        const q = search.toLowerCase()
        if (!e.name.toLowerCase().includes(q) && !e.category.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [ecms, search, category])

  const handleApply = (ecmId: string) => {
    const year = parseInt(yearInput, 10)
    if (!Number.isFinite(year)) return
    window.dispatchEvent(new CustomEvent('crrem:apply-ecm', { detail: { ecmId, year } }))
    setApplyFor(null)
    setOpen(false)
  }

  const handleImport = async (file: File) => {
    try {
      const content = await file.text()
      const { data, body } = parseFrontmatter(content)
      const ecm: ECM = {
        id: String(data.id ?? file.name.replace(/\.md$/, '')),
        name: String(data.name ?? 'Imported ECM'),
        category: String(data.category ?? 'Other'),
        version: typeof data.version === 'string' ? data.version : '1.0',
        license: typeof data.license === 'string' ? data.license : 'CC-BY-4.0',
        summary: typeof data.summary === 'string' ? data.summary : undefined,
        impacts: Array.isArray(data.impacts) ? data.impacts as ECM['impacts'] : [],
        cost: data.cost as ECM['cost'],
        body,
      }
      await saveECM(ecm)
    } catch (e) {
      alert(`Failed to import: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const handleExport = (ecm: ECM) => {
    const yamlObj = {
      doc_type: 'ecm',
      ecm_schema: '1.0',
      id: ecm.id,
      name: ecm.name,
      category: ecm.category,
      version: ecm.version,
      license: ecm.license,
      summary: ecm.summary,
      impacts: ecm.impacts,
      cost: ecm.cost,
    }
    const yaml = Object.entries(yamlObj)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}: ${typeof v === 'string' ? `"${v}"` : JSON.stringify(v)}`)
      .join('\n')
    const md = `---\n${yaml}\n---\n\n# ${ecm.name}\n\n${ecm.body ?? ''}`
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${ecm.id}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="absolute top-0 right-0 bottom-0 w-[440px] max-w-full bg-white shadow-2xl flex flex-col border-l border-slate-200">
        <div className="flex-shrink-0 px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-crrem-navy">
          <div className="flex items-center gap-2.5">
            <span className="text-white/80 text-lg">📚</span>
            <span className="font-semibold text-white">ECM Library</span>
            <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full">
              {filtered.length} of {ecms.length}
            </span>
          </div>
          <button onClick={() => setOpen(false)} className="text-white/60 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="flex-shrink-0 px-4 py-3 border-b border-slate-100 flex gap-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search ECMs…"
            className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-crrem-navy"
          />
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-600 bg-white"
          >
            <option value="">All</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {filtered.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8 italic">No ECMs match.</p>
          )}
          {filtered.map(ecm => {
            const applying = applyFor === ecm.id
            return (
              <div key={ecm.id} className="border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition-all bg-white">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{ecm.name}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryClass(ecm.category)}`}>
                        {ecm.category}
                      </span>
                      {ecm.license && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{ecm.license}</span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => handleExport(ecm)} className="text-slate-300 hover:text-slate-600 text-sm" title="Export this ECM">
                    ⬇
                  </button>
                </div>
                {ecm.summary && (
                  <p className="text-xs text-slate-500 mb-2">{ecm.summary}</p>
                )}
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-3 flex-wrap">
                  {ecm.impacts.slice(0, 3).map((imp, i) => (
                    <span key={i} className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-blue-400 inline-block"></span>
                      {imp.carrier} {imp.operation === 'remove' ? 'remove' : `${imp.operation} ${imp.value_typical}${imp.mode === 'percent' ? '%' : ' kWh'}`}
                    </span>
                  ))}
                  {ecm.payback_years_range && (
                    <span className="text-slate-400">
                      · Payback {ecm.payback_years_range[0]}–{ecm.payback_years_range[1]} yr
                    </span>
                  )}
                </div>
                {applying ? (
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={yearInput}
                      onChange={e => setYearInput(e.target.value)}
                      className="w-24 px-2 py-1.5 text-xs border border-slate-200 rounded-lg"
                    />
                    <button onClick={() => handleApply(ecm.id)} className="flex-1 text-xs font-semibold py-1.5 rounded-lg text-white bg-crrem-navy">
                      Apply to {yearInput}
                    </button>
                    <button onClick={() => setApplyFor(null)} className="text-xs px-2 text-slate-500">Cancel</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setApplyFor(ecm.id)}
                    className="w-full text-xs font-semibold py-2 rounded-lg border-2 text-crrem-navy hover:bg-crrem-navy hover:text-white transition-colors border-crrem-navy"
                  >
                    Apply to year…
                  </button>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex-shrink-0 border-t border-slate-100 px-4 py-3 flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".md"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) handleImport(file)
              e.target.value = ''
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={readOnly}
            className="flex-1 flex items-center justify-center gap-2 text-xs py-2.5 rounded-xl border border-dashed border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-600 transition-colors font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            title={readOnly ? 'Open a real vault to import' : 'Import an .md ECM file'}
          >
            ⬆ Import .md
          </button>
        </div>
      </div>
    </div>
  )
}
