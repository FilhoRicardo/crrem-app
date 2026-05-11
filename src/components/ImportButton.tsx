import { useRef, useState } from 'react'

interface Props {
  label?: string
  /** Called once per file selected. Throw or reject to surface an error. */
  onImport: (file: File) => Promise<void>
  multiple?: boolean
  disabled?: boolean
  className?: string
  variant?: 'primary' | 'secondary' | 'ghost'
}

const VARIANTS: Record<NonNullable<Props['variant']>, string> = {
  primary: 'bg-crrem-navy text-white hover:bg-crrem-navy/90',
  secondary: 'border border-slate-200 text-slate-700 bg-white hover:bg-slate-50',
  ghost: 'text-slate-500 hover:text-crrem-navy hover:bg-slate-100',
}

export default function ImportButton({
  label = 'Import .md',
  onImport,
  multiple = true,
  disabled,
  className = '',
  variant = 'secondary',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setBusy(true)
    const errors: string[] = []
    for (const file of Array.from(files)) {
      try {
        await onImport(file)
      } catch (e) {
        errors.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    setBusy(false)
    if (errors.length > 0) {
      alert(`Some files failed to import:\n\n${errors.join('\n')}`)
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".md,text/markdown"
        multiple={multiple}
        className="hidden"
        onChange={e => {
          handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || busy}
        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${VARIANTS[variant]} disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
        title={disabled ? 'Open a real vault to import' : `Import ${multiple ? 'one or more' : 'an'} .md file${multiple ? 's' : ''}`}
      >
        <span>⬆</span>
        {busy ? 'Importing…' : label}
      </button>
    </>
  )
}
