import { useMemo, useState } from 'react'
import type { Asset, YearActual, Carrier } from '../engine/types'

interface Props {
  asset: Pick<Asset, 'energy' | 'reporting_year' | 'actuals'>
  onChange: (next: YearActual[]) => void
  readOnly?: boolean
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function emptyMonthlyRow(): Array<number | null> {
  return Array(12).fill(null)
}

function sumMonthly(arr: Array<number | null> | undefined): number {
  if (!arr) return 0
  return arr.reduce((s: number, v) => s + (typeof v === 'number' ? v : 0), 0)
}

export default function ActualsEditor({ asset, onChange, readOnly }: Props) {
  const actuals = asset.actuals ?? []
  // Carriers to show: union of carriers in baseline + carriers in any actual.
  const carriers = useMemo<Carrier[]>(() => {
    const set = new Set<Carrier>()
    Object.keys(asset.energy).forEach(c => set.add(c as Carrier))
    actuals.forEach(a => {
      if (a.monthly) Object.keys(a.monthly).forEach(c => set.add(c as Carrier))
      if (a.annual) Object.keys(a.annual).forEach(c => set.add(c as Carrier))
    })
    if (set.size === 0) set.add('Elec_Grid')
    return [...set]
  }, [asset.energy, actuals])

  const sortedYears = useMemo(
    () => [...actuals].sort((a, b) => b.year - a.year),
    [actuals],
  )

  const [selectedYear, setSelectedYear] = useState<number | null>(
    () => sortedYears[0]?.year ?? null,
  )
  const [newYearInput, setNewYearInput] = useState<string>(
    () => String(asset.reporting_year),
  )

  const selected = useMemo(
    () => actuals.find(a => a.year === selectedYear) ?? null,
    [actuals, selectedYear],
  )

  const setActuals = (next: YearActual[]) => onChange(next)

  const addYear = () => {
    const yr = parseInt(newYearInput, 10)
    if (!Number.isFinite(yr)) return
    if (actuals.some(a => a.year === yr)) {
      setSelectedYear(yr)
      return
    }
    const monthly: YearActual['monthly'] = {}
    carriers.forEach(c => { monthly[c] = emptyMonthlyRow() })
    const next: YearActual = { year: yr, monthly }
    setActuals([...actuals, next])
    setSelectedYear(yr)
  }

  const removeYear = (year: number) => {
    if (!confirm(`Remove all measured readings for ${year}?`)) return
    const next = actuals.filter(a => a.year !== year)
    setActuals(next)
    setSelectedYear(next[0]?.year ?? null)
  }

  const setMonth = (carrier: Carrier, monthIdx: number, value: string) => {
    if (!selected) return
    const v = value.trim() === '' ? null : Number(value)
    const next = actuals.map(a => {
      if (a.year !== selected.year) return a
      const monthly = { ...(a.monthly ?? {}) }
      const row = [...(monthly[carrier] ?? emptyMonthlyRow())]
      row[monthIdx] = (typeof v === 'number' && Number.isFinite(v)) ? v : null
      monthly[carrier] = row
      return { ...a, monthly }
    })
    setActuals(next)
  }

  return (
    <div className="border-t border-slate-100 pt-4">
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <h4 className="text-sm font-semibold text-slate-700">Measured energy by year</h4>
          <p className="text-xs text-slate-400 mt-0.5">
            Monthly meter readings, kWh per carrier. Per CRREM, actuals override the projected baseline
            for any year you've recorded — the chart switches to a solid line for those years.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={newYearInput}
            onChange={e => setNewYearInput(e.target.value)}
            min={2000}
            max={2050}
            className="w-24 px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
            placeholder="2025"
            disabled={readOnly}
          />
          <button
            onClick={addYear}
            disabled={readOnly}
            className="text-xs px-3 py-1.5 rounded-lg bg-crrem-navy text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + Add year
          </button>
        </div>
      </div>

      {sortedYears.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {sortedYears.map(a => {
            const sum = Object.values(a.monthly ?? {}).reduce(
              (s, row) => s + sumMonthly(row),
              sumMonthly(undefined) + (a.annual ? Object.values(a.annual).reduce((x, y) => x + (y ?? 0), 0) : 0),
            )
            return (
              <button
                key={a.year}
                onClick={() => setSelectedYear(a.year)}
                className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  a.year === selectedYear
                    ? 'bg-crrem-navy text-white'
                    : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {a.year} <span className="opacity-70 ml-1">{Math.round(sum).toLocaleString()} kWh</span>
              </button>
            )
          })}
        </div>
      )}

      {!selected && sortedYears.length === 0 && (
        <p className="text-sm text-slate-400 italic">
          No actuals yet — add a year to start recording monthly readings.
        </p>
      )}

      {selected && (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">
              {selected.year} · monthly readings (kWh)
            </span>
            <button
              onClick={() => removeYear(selected.year)}
              disabled={readOnly}
              className="text-xs text-red-500 hover:text-red-700 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Remove year
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead className="bg-slate-50/50">
                <tr>
                  <th className="px-2 py-1.5 text-left text-slate-500 font-semibold sticky left-0 bg-slate-50/50 z-10 min-w-[120px]">
                    Carrier
                  </th>
                  {MONTHS.map(m => (
                    <th key={m} className="px-1 py-1.5 text-center text-slate-500 font-semibold min-w-[60px]">{m}</th>
                  ))}
                  <th className="px-2 py-1.5 text-right text-slate-500 font-semibold min-w-[80px]">Annual</th>
                </tr>
              </thead>
              <tbody>
                {carriers.map(carrier => {
                  const row = selected.monthly?.[carrier] ?? emptyMonthlyRow()
                  const sum = sumMonthly(row)
                  return (
                    <tr key={carrier} className="border-t border-slate-100">
                      <td className="px-2 py-1 font-medium text-slate-700 sticky left-0 bg-white z-10">
                        {carrier}
                      </td>
                      {row.map((v, i) => (
                        <td key={i} className="px-0.5 py-1">
                          <input
                            type="number"
                            value={v ?? ''}
                            onChange={e => setMonth(carrier, i, e.target.value)}
                            disabled={readOnly}
                            placeholder="—"
                            className="w-full px-1.5 py-1 text-xs border border-slate-200 rounded text-right focus:outline-none focus:border-crrem-navy disabled:bg-slate-50 disabled:cursor-not-allowed"
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1 text-right text-slate-600 font-semibold">
                        {sum > 0 ? Math.round(sum).toLocaleString() : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
