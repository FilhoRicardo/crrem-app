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

const COL_WIDTH = 32  // px per year column — wide enough that 2024/2025 labels don't collide
const DOT_BOX = 16    // px — uniform clickable dot wrapper

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

  const totalWidth = years.length * COL_WIDTH

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Retrofit Timeline</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Click any year to add or edit retrofits — scenario:{' '}
            <span className="font-medium text-slate-600">{scenario.name}</span>
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full inline-block bg-crrem-navy"></span>
            Has retrofit
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full border-2 border-slate-300 inline-block bg-white"></span>
            Empty
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full border-2 border-red-500 bg-red-100 inline-block"></span>
            Stranding
          </span>
        </div>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="relative" style={{ width: totalWidth, height: 64 }}>
          {/* Stranding vertical guide line */}
          {strandingYear != null && strandingYear >= startYear && strandingYear <= endYear && (
            <div
              className="absolute top-0 bottom-0 w-px bg-red-300/60 pointer-events-none"
              style={{ left: (strandingYear - startYear) * COL_WIDTH + COL_WIDTH / 2 - 0.5 }}
            />
          )}

          {/* Year cells */}
          {years.map((yr, i) => {
            const retros = retrofitsByYear.get(yr) ?? []
            const hasRetros = retros.length > 0
            const isStrand = yr === strandingYear
            const isSelected = yr === selectedYear
            const showLabel = yr === startYear || yr === endYear || yr % 5 === 0 || hasRetros || isStrand

            return (
              <button
                key={yr}
                type="button"
                onClick={() => onSelectYear(isSelected ? null : yr)}
                title={hasRetros ? retros.map(r => r.name).join(', ') : `${yr} (no retrofits)`}
                className="group absolute top-0 flex flex-col items-center cursor-pointer focus:outline-none"
                style={{ left: i * COL_WIDTH, width: COL_WIDTH, height: 64 }}
              >
                {/* Tooltip */}
                {hasRetros && (
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-30 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="bg-slate-900 text-white text-xs rounded-xl px-3 py-2 shadow-xl whitespace-nowrap">
                      <div className="font-semibold mb-1">{yr} · {retros.length} retrofit{retros.length > 1 ? 's' : ''}</div>
                      {retros.map(r => (
                        <div key={r.id} className="text-slate-400">· {r.name}</div>
                      ))}
                    </div>
                    <div className="w-2 h-2 bg-slate-900 rotate-45 mx-auto -mt-1"></div>
                  </div>
                )}

                {/* Dot — fixed-size box so all rows align perfectly */}
                <div
                  className="flex items-center justify-center"
                  style={{ width: DOT_BOX, height: DOT_BOX, marginTop: 8 }}
                >
                  {hasRetros ? (
                    <div className="relative">
                      <div className={`w-3.5 h-3.5 rounded-full bg-crrem-navy shadow-sm ${
                        isSelected ? 'ring-2 ring-crrem-navy/40 ring-offset-2 ring-offset-white' : ''
                      }`} />
                      {retros.length > 1 && (
                        <span
                          className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full flex items-center justify-center text-white font-bold shadow bg-crrem-amber"
                          style={{ fontSize: 9 }}
                        >
                          {retros.length}
                        </span>
                      )}
                    </div>
                  ) : isStrand ? (
                    <div className={`w-3.5 h-3.5 rounded-full border-2 border-red-500 bg-red-100 ${
                      isSelected ? 'ring-2 ring-red-400/50 ring-offset-2 ring-offset-white' : ''
                    }`} />
                  ) : (
                    <div className={`w-3 h-3 rounded-full border-2 bg-white transition-colors ${
                      isSelected
                        ? 'border-crrem-navy ring-2 ring-crrem-navy/30 ring-offset-1 ring-offset-white'
                        : 'border-slate-300 group-hover:border-crrem-navy'
                    }`} />
                  )}
                </div>

                {/* Year label */}
                <span
                  className={`mt-2 font-medium tabular-nums ${
                    isStrand ? 'text-red-500' : isSelected ? 'text-crrem-navy' : 'text-slate-400'
                  } ${showLabel ? '' : 'invisible'}`}
                  style={{ fontSize: 10 }}
                >
                  {yr}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
