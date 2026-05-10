import { useMemo } from 'react'
import type { Scenario } from '../engine/types'

interface Props {
  scenario: Scenario
  strandingYear: number | null
  selectedYear: number | null
  onSelectYear: (year: number | null) => void
  startYear?: number
  endYear?: number
}

export default function Timeline({
  scenario, strandingYear, selectedYear, onSelectYear,
  startYear = 2024, endYear = 2050,
}: Props) {
  const years = useMemo(() => {
    const arr: number[] = []
    for (let y = startYear; y <= endYear; y++) arr.push(y)
    return arr
  }, [startYear, endYear])

  const retrofitsByYear = useMemo(() => {
    const map = new Map<number, typeof scenario.retrofits>()
    for (const r of scenario.retrofits) {
      const list = map.get(r.year) ?? []
      list.push(r)
      map.set(r.year, list)
    }
    return map
  }, [scenario.retrofits])

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Retrofit Timeline</h3>
          <p className="text-xs text-slate-400 mt-0.5">Click any year to add or edit retrofits — scenario: <span className="font-medium text-slate-600">{scenario.name}</span></p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full inline-block bg-crrem-navy"></span>
            Has retrofit
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 inline-block bg-white"></span>
            Empty
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="12" height="14"><line x1="6" y1="0" x2="6" y2="14" stroke="#ef4444" strokeWidth={2} strokeDasharray="3,2"/></svg>
            Stranding
          </span>
        </div>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="flex items-end gap-1 min-w-max px-1">
          {years.map(yr => {
            const retros = retrofitsByYear.get(yr) ?? []
            const hasRetros = retros.length > 0
            const isStrand = yr === strandingYear
            const isSelected = yr === selectedYear
            const showLabel = yr === startYear || yr === endYear || yr % 5 === 0 || hasRetros || isStrand
            return (
              <div
                key={yr}
                onClick={() => onSelectYear(isSelected ? null : yr)}
                className="relative flex flex-col items-center cursor-pointer group select-none"
                style={{ minWidth: 28 }}
                title={hasRetros ? retros.map(r => r.name).join(', ') : `${yr} (no retrofits)`}
              >
                {hasRetros && (
                  <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 z-30 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="bg-slate-900 text-white text-xs rounded-xl px-3 py-2 shadow-xl whitespace-nowrap">
                      <div className="font-semibold mb-1">{yr} · {retros.length} retrofit{retros.length > 1 ? 's' : ''}</div>
                      {retros.map(r => (
                        <div key={r.id} className="text-slate-400">· {r.name}</div>
                      ))}
                    </div>
                  </div>
                )}

                {isStrand && (
                  <div className="w-0.5 h-10 -mb-6 absolute top-0 bg-red-500/30 pointer-events-none"></div>
                )}

                <div className={`relative flex items-center justify-center ${isSelected ? 'scale-125' : ''} transition-transform`}>
                  {isStrand && !hasRetros ? (
                    <div className="w-3.5 h-3.5 rounded-full z-10 border-2 border-red-500 bg-red-100"></div>
                  ) : hasRetros ? (
                    <>
                      <div className={`w-4 h-4 rounded-full shadow-sm ${isSelected ? 'ring-2 ring-offset-2 ring-crrem-navy' : ''} bg-crrem-navy`}></div>
                      {retros.length > 1 && (
                        <span className="absolute -top-2 -right-2 w-4 h-4 rounded-full flex items-center justify-center text-white font-bold shadow text-[9px] bg-crrem-amber">
                          {retros.length}
                        </span>
                      )}
                    </>
                  ) : (
                    <div className={`w-3.5 h-3.5 rounded-full border-2 bg-white transition-colors ${
                      isSelected ? 'border-crrem-navy' : 'border-slate-200 group-hover:border-crrem-navy'
                    }`}></div>
                  )}
                </div>

                <span className={`text-[9px] mt-1.5 font-medium ${
                  isStrand ? 'text-red-500' : isSelected ? 'text-crrem-navy' : showLabel ? 'text-slate-400' : 'text-transparent'
                }`}>
                  {yr}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
