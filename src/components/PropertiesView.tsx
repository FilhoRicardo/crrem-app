import { useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import type { Asset, EnergyMap, Carrier, YearActual } from '../engine/types'
import { assetToMarkdown, importAssetFile } from '../vault/loader'
import { downloadText } from '../utils/download'
import { summariseAsset, flagForCountry } from '../engine/summary'
import { parseAssetsCsv, ASSETS_CSV_TEMPLATE } from '../utils/csvAssets'
import TemplateButton from './TemplateButton'
import ActualsEditor from './ActualsEditor'
import ImportButton from './ImportButton'
import AssetCompare from './AssetCompare'

const CARRIERS: Carrier[] = [
  'Elec_Grid', 'District_Heating', 'District_Cooling', 'Gas', 'Oil', 'Biomass',
  'Other_Fuels', 'Renew_Consumed', 'Renew_Exported',
]

const COUNTRIES = [
  'USA', 'United Kingdom', 'Hong Kong', 'Australia', 'Germany', 'France',
  'Netherlands', 'Spain', 'Italy', 'Canada', 'Japan', 'Singapore', 'Other',
]

const PROPERTY_TYPES = [
  'Office', 'Shopping Center', 'Retail High Street', 'Retail Warehouse',
  'Hotel', 'Residential', 'Mixed Use',
  'Distribution Warehouse Warm', 'Distribution Warehouse Cool',
  'Industrial', 'Healthcare', 'Education', 'Other',
]

const flag = flagForCountry

function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'asset'
}

function hasAnyPrice(up: Record<string, unknown>): boolean {
  return Object.entries(up).some(([k, v]) => k !== 'currency' && v !== undefined && v !== null)
    || (typeof up.currency === 'string' && up.currency.length > 0)
}

function emptyAsset(reportingYear: number): Asset {
  return {
    id: '',
    name: '',
    country: 'USA',
    property_type: 'Office',
    gia_m2: 0,
    reporting_year: reportingYear,
    energy: {},
  }
}

interface FormProps {
  initial: Asset
  isNew: boolean
  onCancel: () => void
  onSave: (a: Asset) => void
  existingIds: string[]
  readOnly: boolean
}

function AssetForm({ initial, isNew, onCancel, onSave, existingIds, readOnly }: FormProps) {
  const [draft, setDraft] = useState<Asset>(initial)
  const [error, setError] = useState<string | null>(null)

  const setEnergy = (carrier: Carrier, value: number) => {
    const energy: EnergyMap = { ...draft.energy }
    if (value > 0) energy[carrier] = value
    else delete energy[carrier]
    setDraft({ ...draft, energy })
  }

  const setUtilityPrice = (carrier: Carrier, value: number) => {
    const up = { ...(draft.utility_prices ?? {}) }
    if (value > 0) (up as Record<string, unknown>)[carrier] = value
    else delete (up as Record<string, unknown>)[carrier]
    setDraft({ ...draft, utility_prices: hasAnyPrice(up) ? up : undefined })
  }
  const setUtilityCurrency = (currency: string) => {
    const up = { ...(draft.utility_prices ?? {}), currency: currency || undefined }
    setDraft({ ...draft, utility_prices: hasAnyPrice(up) ? up : undefined })
  }
  const setUtilityEscalation = (pct: number) => {
    const up = { ...(draft.utility_prices ?? {}) }
    if (Number.isFinite(pct) && pct !== 0) up.escalation_pct_per_year = pct
    else delete up.escalation_pct_per_year
    setDraft({ ...draft, utility_prices: hasAnyPrice(up) ? up : undefined })
  }
  const carriersWithDemand = (Object.keys(draft.energy) as Carrier[])
    .filter(c => (draft.energy[c] ?? 0) > 0 && c !== 'Renew_Exported')

  const handleSave = () => {
    if (!draft.name.trim()) return setError('Name is required')
    if (draft.gia_m2 <= 0) return setError('GIA must be greater than 0')
    let id = draft.id || slugify(draft.name)
    if (isNew) {
      let n = 2
      const base = id
      while (existingIds.includes(id)) id = `${base}-${n++}`
    }
    setError(null)
    onSave({ ...draft, id })
  }

  return (
    <div className="bg-white rounded-2xl border-2 border-crrem-navy/20 shadow-sm p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">
            {isNew ? 'New property' : `Edit · ${initial.name}`}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            All fields validated against the CRREM asset schema. Energy is in kWh/yr per carrier.
          </p>
        </div>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Name *">
          <input
            value={draft.name}
            onChange={e => setDraft({ ...draft, name: e.target.value })}
            placeholder="e.g. Midtown Tower"
            disabled={readOnly}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-crrem-navy disabled:bg-slate-50"
          />
        </Field>

        <Field label="ID (auto-generated if empty)">
          <input
            value={draft.id}
            onChange={e => setDraft({ ...draft, id: slugify(e.target.value) })}
            placeholder={slugify(draft.name) || 'auto'}
            disabled={readOnly || !isNew}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono focus:outline-none focus:border-crrem-navy disabled:bg-slate-50"
          />
        </Field>

        <Field label="Country *">
          <select
            value={draft.country}
            onChange={e => setDraft({ ...draft, country: e.target.value })}
            disabled={readOnly}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-crrem-navy disabled:bg-slate-50"
          >
            {COUNTRIES.map(c => <option key={c} value={c}>{flag(c)} {c}</option>)}
          </select>
        </Field>

        <Field label="Postal code">
          <input
            value={draft.postal_code ?? ''}
            onChange={e => setDraft({ ...draft, postal_code: e.target.value || undefined })}
            placeholder="e.g. 10005"
            disabled={readOnly}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-crrem-navy disabled:bg-slate-50"
          />
        </Field>

        <Field label="Property type *">
          <select
            value={draft.property_type}
            onChange={e => setDraft({ ...draft, property_type: e.target.value })}
            disabled={readOnly}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-crrem-navy disabled:bg-slate-50"
          >
            {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>

        <Field label="GIA (m²) *">
          <input
            type="number"
            value={draft.gia_m2 || ''}
            onChange={e => setDraft({ ...draft, gia_m2: Number(e.target.value) })}
            min={1}
            disabled={readOnly}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-crrem-navy disabled:bg-slate-50"
          />
        </Field>

        <Field label="Reporting year *">
          <input
            type="number"
            value={draft.reporting_year}
            onChange={e => setDraft({ ...draft, reporting_year: Number(e.target.value) })}
            min={2020}
            max={2050}
            disabled={readOnly}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-crrem-navy disabled:bg-slate-50"
          />
        </Field>

        <Field label="CRREM region (optional)">
          <input
            value={draft.region ?? ''}
            onChange={e => setDraft({ ...draft, region: e.target.value || undefined })}
            placeholder="e.g. USA-NY (overrides country lookup)"
            disabled={readOnly}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-crrem-navy disabled:bg-slate-50"
          />
        </Field>
      </div>

      <div className="mt-5">
        <h4 className="text-sm font-semibold text-slate-700 mb-2">Baseline energy (reporting year, kWh/yr)</h4>
        <p className="text-xs text-slate-400 mb-3">
          Whole-building annual demand per carrier. Leave at 0 to omit. Used for years that don't have measured actuals below.
        </p>
        <div className="grid grid-cols-3 gap-3">
          {CARRIERS.map(c => (
            <Field key={c} label={c}>
              <input
                type="number"
                value={draft.energy[c] ?? ''}
                onChange={e => setEnergy(c, Number(e.target.value))}
                min={0}
                step={1000}
                placeholder="0"
                disabled={readOnly}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-crrem-navy disabled:bg-slate-50"
              />
            </Field>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <h4 className="text-sm font-semibold text-slate-700 mb-2">Utility prices (optional)</h4>
        <p className="text-xs text-slate-400 mb-3">
          Per-carrier energy prices in the asset's currency. Used to compute opex savings + payback for each retrofit.
          Leave empty if you don't want a cost analysis. Future-year prices escalate at the rate below.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Currency">
            <input
              value={draft.utility_prices?.currency ?? ''}
              onChange={e => setUtilityCurrency(e.target.value.toUpperCase())}
              placeholder="USD"
              maxLength={6}
              disabled={readOnly}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-crrem-navy disabled:bg-slate-50 uppercase"
            />
          </Field>
          <Field label="Escalation %/yr">
            <input
              type="number"
              step={0.1}
              value={draft.utility_prices?.escalation_pct_per_year ?? ''}
              onChange={e => setUtilityEscalation(Number(e.target.value))}
              placeholder="0"
              disabled={readOnly}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-crrem-navy disabled:bg-slate-50"
            />
          </Field>
          <Field label="Renew. degradation %/yr">
            <input
              type="number"
              step={0.1}
              min={0}
              max={5}
              value={draft.renewable_degradation_pct_per_year ?? ''}
              onChange={e => {
                const v = Number(e.target.value)
                setDraft({
                  ...draft,
                  renewable_degradation_pct_per_year:
                    Number.isFinite(v) && v > 0 ? v : undefined,
                })
              }}
              placeholder="0 (off)"
              disabled={readOnly}
              title="On-site renewables (PV, etc.) lose ~0.5%/yr typically. Applied to projected years only — measured actuals stay untouched."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-crrem-navy disabled:bg-slate-50"
            />
          </Field>
          <Field label="Climate adjustment (HDD/CDD)">
            <select
              value={draft.climate_scenario ?? 'none'}
              onChange={e => {
                const v = e.target.value as 'none' | 'rcp45' | 'rcp85'
                setDraft({ ...draft, climate_scenario: v === 'none' ? undefined : v })
              }}
              disabled={readOnly}
              title="Scale heating/cooling demand by projected HDD/CDD changes. CRREM v2.05 ships data for 30 European countries — non-EU assets are a no-op."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-crrem-navy disabled:bg-slate-50"
            >
              <option value="none">none (off)</option>
              <option value="rcp45">RCP 4.5 (medium scenario)</option>
              <option value="rcp85">RCP 8.5 (high-emissions)</option>
            </select>
          </Field>
          {carriersWithDemand.length === 0 ? (
            <p className="col-span-3 text-xs text-slate-400 italic">
              Add baseline energy demand above first — prices show only for carriers with non-zero kWh.
            </p>
          ) : (
            carriersWithDemand.map(c => (
              <Field key={c} label={`${c} (per kWh)`}>
                <input
                  type="number"
                  step={0.001}
                  value={(draft.utility_prices?.[c as keyof typeof draft.utility_prices] as number | undefined) ?? ''}
                  onChange={e => setUtilityPrice(c, Number(e.target.value))}
                  placeholder="0.00"
                  disabled={readOnly}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-crrem-navy disabled:bg-slate-50"
                />
              </Field>
            ))
          )}
        </div>
      </div>

      <div className="mt-5">
        <ActualsEditor
          asset={draft}
          onChange={(actuals: YearActual[]) => setDraft({ ...draft, actuals })}
          readOnly={readOnly}
        />
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
            {isNew ? 'Create property' : 'Save changes'}
          </button>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1 block">{label}</span>
      {children}
    </label>
  )
}

export default function PropertiesView() {
  const assets = useStore(s => s.assets)
  const scenarios = useStore(s => s.scenarios)
  const saveAsset = useStore(s => s.saveAsset)
  const deleteAsset = useStore(s => s.deleteAsset)
  const selectAsset = useStore(s => s.selectAsset)
  const setView = useStore(s => s.setView)
  const vaultMode = useStore(s => s.vaultMode)
  const readOnly = vaultMode !== 'fsa'

  const [editing, setEditing] = useState<Asset | null>(null)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [comparing, setComparing] = useState<{ left: string | null; right: string | null } | null>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)

  const handleCsvImport = async (file: File) => {
    try {
      const text = await file.text()
      const { assets: parsed, warnings } = parseAssetsCsv(text, assets.map(a => a.id))
      if (parsed.length === 0) {
        alert(`No assets parsed from ${file.name}.\n\n${warnings.join('\n')}`)
        return
      }
      // Save sequentially to avoid FSA write contention.
      for (const a of parsed) await saveAsset(a)
      const msg = warnings.length > 0
        ? `Imported ${parsed.length} asset(s).\n\nWarnings:\n${warnings.join('\n')}`
        : `Imported ${parsed.length} asset(s).`
      alert(msg)
    } catch (e) {
      alert(`Failed to import ${file.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const existingIds = assets.map(a => a.id)

  const rows = useMemo(() => {
    return assets.map(a => {
      const assetScenarios = scenarios.filter(s => s.asset_id === a.id)
      // Use the first scenario for the misalignment projection (informational only).
      const summary = summariseAsset(a, assetScenarios[0])
      return { asset: a, summary, scenarioCount: assetScenarios.length }
    })
  }, [assets, scenarios])

  const filtered = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.trim().toLowerCase()
    return rows.filter(r =>
      r.asset.name.toLowerCase().includes(q) ||
      r.asset.country.toLowerCase().includes(q) ||
      r.asset.property_type.toLowerCase().includes(q) ||
      r.asset.id.toLowerCase().includes(q),
    )
  }, [rows, search])

  const handleSave = async (a: Asset) => {
    await saveAsset(a)
    setEditing(null)
    setCreating(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this property? It will be moved to trash/assets/.')) return
    await deleteAsset(id)
  }

  if (creating) {
    return (
      <main className="flex-1 overflow-y-auto bg-slate-50 p-6">
        <AssetForm
          initial={emptyAsset(new Date().getFullYear())}
          isNew
          onCancel={() => setCreating(false)}
          onSave={handleSave}
          existingIds={existingIds}
          readOnly={readOnly}
        />
      </main>
    )
  }

  if (editing) {
    return (
      <main className="flex-1 overflow-y-auto bg-slate-50 p-6">
        <AssetForm
          initial={editing}
          isNew={false}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
          existingIds={existingIds.filter(id => id !== editing.id)}
          readOnly={readOnly}
        />
      </main>
    )
  }

  return (
    <main className="flex-1 overflow-y-auto bg-slate-50 p-6 flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Properties</h2>
          <p className="text-sm text-slate-500 mt-1">
            {assets.length} propert{assets.length === 1 ? 'y' : 'ies'} in vault
            {readOnly && <span className="ml-2 text-amber-600">· read-only (sample vault)</span>}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            className="text-sm px-3 py-1.5 border border-slate-200 rounded-lg w-48 focus:outline-none focus:border-crrem-navy"
          />
          <TemplateButton kind="asset" />
          <button
            onClick={() => downloadText('assets-template.csv', ASSETS_CSV_TEMPLATE, 'text/csv')}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium flex items-center gap-1.5"
            title="Download a CSV template you can fill in then re-upload to bulk-import many assets at once"
          >
            <span>⬇</span> Bulk CSV template
          </button>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) handleCsvImport(file)
              e.target.value = ''
            }}
          />
          <button
            onClick={() => csvInputRef.current?.click()}
            disabled={readOnly}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            title={readOnly ? 'Open a real vault to bulk-import' : 'Bulk-import many assets from a CSV (one row per asset)'}
          >
            <span>⬆</span> Bulk import CSV
          </button>
          <ImportButton
            label="Import .md"
            disabled={readOnly}
            onImport={async file => { await saveAsset(await importAssetFile(file)) }}
          />
          {assets.length >= 2 && (
            <button
              onClick={() => setComparing({ left: assets[0]?.id ?? null, right: assets[1]?.id ?? null })}
              className="text-xs px-3 py-1.5 rounded-lg border border-crrem-navy text-crrem-navy hover:bg-crrem-navy hover:text-white font-medium transition-colors"
              title="Compare two assets side-by-side"
            >
              ⇄ Compare assets
            </button>
          )}
          <button
            onClick={() => setCreating(true)}
            disabled={readOnly}
            className="text-sm px-4 py-2 rounded-lg bg-crrem-navy text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            title={readOnly ? 'Open a real vault to add properties' : 'Add a new property'}
          >
            + New property
          </button>
        </div>
      </div>
      {comparing && (
        <AssetCompare
          initialLeftId={comparing.left}
          initialRightId={comparing.right}
          onClose={() => setComparing(null)}
        />
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        {assets.length === 0 ? (
          <p className="p-8 text-center text-slate-400 italic">
            No properties yet. Click <strong>+ New property</strong> to add one.
          </p>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center text-slate-400 italic">
            No properties match "<strong>{search}</strong>".
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Country</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-right">GIA m²</th>
                <th className="px-4 py-3 text-right">CI 2024</th>
                <th className="px-4 py-3 text-right">Misalign.</th>
                <th className="px-4 py-3 text-right">Scenarios</th>
                <th className="px-4 py-3 text-left">Carriers</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ asset: a, summary, scenarioCount }) => (
                <tr key={a.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => { selectAsset(a.id); setView('asset') }}
                      className="font-medium text-crrem-navy hover:underline text-left"
                    >
                      {a.name}
                    </button>
                    <div className="text-xs text-slate-400 font-mono">{a.id}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{flag(a.country)} {a.country}</td>
                  <td className="px-4 py-3 text-slate-600">{a.property_type}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{a.gia_m2.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-semibold ${summary.stranded ? 'text-red-600' : 'text-emerald-600'}`}>
                      {summary.ci.toFixed(1)}
                    </span>
                    <div className="text-xs text-slate-400">vs {summary.pathway.toFixed(1)}</div>
                  </td>
                  <td className={`px-4 py-3 text-right font-medium ${
                    summary.misalignmentYear == null ? 'text-emerald-600'
                      : summary.misalignmentYear <= a.reporting_year ? 'text-red-600'
                      : 'text-amber-600'
                  }`}>
                    {summary.misalignmentYear ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-500">{scenarioCount}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {Object.keys(a.energy).map(c => (
                        <span key={c} className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          {c}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => downloadText(`${a.id}.md`, assetToMarkdown(a))}
                        className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 font-medium"
                        title="Download this asset as a .md file"
                      >
                        ⬇
                      </button>
                      <button
                        onClick={() => setEditing(a)}
                        className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(a.id)}
                        disabled={readOnly}
                        className="text-xs px-2.5 py-1 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 font-medium disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {readOnly && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
          <p className="font-semibold">Read-only mode</p>
          <p className="mt-1 text-amber-800/80">
            You're viewing the bundled sample vault. To create or edit properties, close the vault and open a real folder
            using <strong>Open vault folder…</strong> (Chrome or Edge desktop only).
          </p>
        </div>
      )}
    </main>
  )
}
