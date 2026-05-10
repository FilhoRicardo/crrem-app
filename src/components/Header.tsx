import { useStore } from '../store'

export default function Header() {
  const view = useStore(s => s.view)
  const setView = useStore(s => s.setView)
  const vaultName = useStore(s => s.vaultName)
  const vaultMode = useStore(s => s.vaultMode)
  const reloadVault = useStore(s => s.reloadVault)
  const closeVault = useStore(s => s.closeVault)
  const setECMPanelOpen = useStore(s => s.setECMPanelOpen)
  const ecms = useStore(s => s.ecms.length)

  return (
    <header className="flex-shrink-0 flex items-center gap-3 px-6 py-3 text-white bg-crrem-navy">
      <svg className="w-5 h-5 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
      </svg>
      <span className="font-semibold text-base tracking-tight">CRREM Admin</span>
      <span className="text-xs bg-white/20 px-2 py-0.5 rounded">v0.0.1</span>
      <span className="ml-3 text-white/60 text-xs flex items-center gap-1.5">
        <span>📁</span>
        <span>{vaultName}</span>
        {vaultMode === 'sample' && (
          <span className="ml-1 text-[10px] bg-amber-400/20 text-amber-200 px-1.5 py-0.5 rounded uppercase tracking-wider">Demo · read-only</span>
        )}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={() => setECMPanelOpen(true)}
          className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-md transition-colors"
          title="Open ECM Library"
        >
          📚 ECMs <span className="text-white/50 ml-1">{ecms}</span>
        </button>
        <button
          onClick={() => reloadVault()}
          className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-md transition-colors"
          title="Reload from disk"
        >
          ↺ Sync
        </button>
        <div className="flex bg-white/10 rounded-md overflow-hidden">
          <button
            onClick={() => setView('asset')}
            className={`text-xs px-3 py-1.5 transition-colors ${view === 'asset' ? 'bg-white/20' : 'hover:bg-white/15'}`}
          >Asset</button>
          <button
            onClick={() => setView('portfolio')}
            className={`text-xs px-3 py-1.5 transition-colors ${view === 'portfolio' ? 'bg-white/20' : 'hover:bg-white/15'}`}
          >Portfolio</button>
        </div>
        <button
          onClick={() => closeVault()}
          className="text-xs text-white/60 hover:text-white px-2 py-1.5 rounded-md transition-colors"
          title="Close vault"
        >
          Close
        </button>
      </div>
    </header>
  )
}
