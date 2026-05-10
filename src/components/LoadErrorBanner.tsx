import { useStore } from '../store'

export default function LoadErrorBanner() {
  const errors = useStore(s => s.loadErrors)
  if (errors.length === 0) return null
  return (
    <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 text-xs text-amber-900">
      <details>
        <summary className="cursor-pointer font-semibold">
          ⚠ {errors.length} vault load issue{errors.length === 1 ? '' : 's'} (click to expand)
        </summary>
        <ul className="mt-2 space-y-0.5 ml-4 list-disc text-amber-800">
          {errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      </details>
    </div>
  )
}
