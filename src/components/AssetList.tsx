import { useMemo } from 'react'
import { useStore } from '../store'
import { calculateYearMetrics, blendPathway } from '../engine/calculate'
import { efProvider, pathwayProvider } from '../engine/providers'
import { splitForAsset, regionForAsset } from '../vault/loader'
import type { Asset } from '../engine/types'

const COUNTRY_FLAG: Record<string, string> = {
  USA: '🇺🇸', 'United States': '🇺🇸',
  'Hong Kong': '🇭🇰', HK: '🇭🇰',
  'United Kingdom': '🇬🇧', UK: '🇬🇧', GB: '🇬🇧',
  Australia: '🇦🇺', AU: '🇦🇺',
}

function flag(country: string): string {
  return COUNTRY_FLAG[country] ?? '🏢'
}

function summariseAsset(asset: Asset, year: number) {
  const region = regionForAsset(asset)
  const split = splitForAsset(asset)
  const m = calculateYearMetrics(asset.energy, asset.gia_m2, efProvider, region, year)
  const pw = blendPathway(pathwayProvider, region, split, year)
  return {
    ci: m.carbon_intensity_kgco2e_m2,
    pathway: pw.carbon_kgco2e_m2,
    stranded: m.carbon_intensity_kgco2e_m2 > pw.carbon_kgco2e_m2,
  }
}

export default function AssetList() {
  const assets = useStore(s => s.assets)
  const selectedAssetId = useStore(s => s.selectedAssetId)
  const selectAsset = useStore(s => s.selectAsset)

  const summaries = useMemo(
    () => assets.map(a => ({ asset: a, ...summariseAsset(a, a.reporting_year) })),
    [assets],
  )

  return (
    <aside className="w-72 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Assets · {assets.length}
        </span>
      </div>
      <div className="overflow-y-auto flex-1 p-2 flex flex-col gap-1.5">
        {summaries.length === 0 && (
          <p className="text-xs text-slate-400 px-3 py-6 text-center">
            No assets in this vault.<br />
            Add a <code>.md</code> file to <code>assets/</code>.
          </p>
        )}
        {summaries.map(({ asset, ci, stranded }) => {
          const active = asset.id === selectedAssetId
          return (
            <div
              key={asset.id}
              onClick={() => selectAsset(asset.id)}
              className={`rounded-xl p-3 cursor-pointer transition-colors ${
                active
                  ? 'bg-crrem-navy text-white'
                  : 'bg-slate-50 border border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between">
                <span className={`font-medium text-sm leading-snug ${active ? 'text-white' : 'text-slate-800'}`}>
                  {asset.name}
                </span>
                <span className="text-xl ml-1 leading-none mt-0.5">{flag(asset.country)}</span>
              </div>
              <div className={`text-xs mt-0.5 ${active ? 'text-white/60' : 'text-slate-500'}`}>
                {asset.property_type} · {asset.country}
              </div>
              <div className="flex items-center justify-between mt-2.5">
                <div>
                  <span className={`text-lg font-bold ${active ? 'text-white' : 'text-slate-700'}`}>
                    {ci.toFixed(1)}
                  </span>
                  <span className={`text-xs ml-0.5 ${active ? 'text-white/60' : 'text-slate-400'}`}>
                    kgCO₂e/m²
                  </span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                  stranded
                    ? 'bg-red-100 text-red-700'
                    : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {stranded ? '🔴 Stranded' : '✓ Aligned'}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
