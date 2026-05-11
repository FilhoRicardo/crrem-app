import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { getProviderDiagnostics } from '../engine/providers'

export default function LoadErrorBanner() {
  const errors = useStore(s => s.loadErrors)
  // Re-poll provider diagnostics when assets change so new fallbacks surface.
  const assets = useStore(s => s.assets)
  const [diag, setDiag] = useState(getProviderDiagnostics())
  useEffect(() => {
    // Run after the next render cycle so any chart-triggered EF/pathway lookups
    // have already happened and registered themselves with the diagnostics set.
    const t = setTimeout(() => setDiag(getProviderDiagnostics()), 100)
    return () => clearTimeout(t)
  }, [assets])

  const totalIssues =
    errors.length +
    diag.unknownPathwayRegions.length +
    diag.unknownGridRegions.length +
    diag.fallbackPathwayRegions.length

  if (totalIssues === 0) return null

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 text-xs text-amber-900">
      <details>
        <summary className="cursor-pointer font-semibold">
          ⚠ {totalIssues} data {totalIssues === 1 ? 'issue' : 'issues'} — click to expand
        </summary>
        <div className="mt-2 ml-4 space-y-2 text-amber-800">
          {errors.length > 0 && (
            <div>
              <div className="font-semibold mb-0.5">Vault load:</div>
              <ul className="list-disc ml-4 space-y-0.5">
                {errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
          {diag.fallbackPathwayRegions.length > 0 && (
            <div>
              <div className="font-semibold mb-0.5">Pathway fallback (sub-national → country):</div>
              <ul className="list-disc ml-4 space-y-0.5">
                {diag.fallbackPathwayRegions.map((r, i) => <li key={i}>{r} — using country-level CRREM v2.05 curve</li>)}
              </ul>
            </div>
          )}
          {diag.unknownPathwayRegions.length > 0 && (
            <div>
              <div className="font-semibold mb-0.5 text-red-700">Unknown pathway regions (using generic exponential fallback):</div>
              <ul className="list-disc ml-4 space-y-0.5">
                {diag.unknownPathwayRegions.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}
          {diag.unknownGridRegions.length > 0 && (
            <div>
              <div className="font-semibold mb-0.5 text-red-700">Unknown grid-EF regions (using generic exponential fallback):</div>
              <ul className="list-disc ml-4 space-y-0.5">
                {diag.unknownGridRegions.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}
        </div>
      </details>
    </div>
  )
}
