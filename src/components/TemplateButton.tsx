import { downloadText } from '../utils/download'
import { TEMPLATES, type TemplateKey } from '../utils/templates'

interface Props {
  kind: TemplateKey
  label?: string
  className?: string
  variant?: 'primary' | 'secondary' | 'ghost'
}

const VARIANTS: Record<NonNullable<Props['variant']>, string> = {
  primary:
    'bg-crrem-navy text-white hover:bg-crrem-navy/90',
  secondary:
    'border border-slate-200 text-slate-700 bg-white hover:bg-slate-50',
  ghost:
    'text-slate-500 hover:text-crrem-navy hover:bg-slate-100',
}

export default function TemplateButton({ kind, label, className = '', variant = 'secondary' }: Props) {
  const tpl = TEMPLATES[kind]
  return (
    <button
      type="button"
      onClick={() => downloadText(tpl.filename, tpl.content)}
      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${VARIANTS[variant]} ${className}`}
      title={`Download an empty ${tpl.label.toLowerCase()} .md template — open in any text editor or Obsidian, fill in fields, then drop into your vault.`}
    >
      <span>⬇</span>
      {label ?? `${tpl.label} template`}
    </button>
  )
}
