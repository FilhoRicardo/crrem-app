import { useEffect } from 'react'
import { useStore } from './store'
import VaultPicker from './components/VaultPicker'
import Header from './components/Header'
import AssetList from './components/AssetList'
import AssetDetail from './components/AssetDetail'
import PortfolioView from './components/PortfolioView'
import PropertiesView from './components/PropertiesView'
import UsageView from './components/UsageView'
import ECMLibrary from './components/ECMLibrary'
import ErrorBoundary from './components/ErrorBoundary'
import LoadErrorBanner from './components/LoadErrorBanner'

export default function App() {
  const vaultMode = useStore(s => s.vaultMode)
  const view = useStore(s => s.view)
  const assets = useStore(s => s.assets)
  const selectedAssetId = useStore(s => s.selectedAssetId)
  const reloadVault = useStore(s => s.reloadVault)

  // Auto-rescan the vault when the window regains focus.
  // Lets the user edit .md files in Obsidian or any text editor and see changes
  // here without clicking ↺ Sync. Only fires when an FSA vault is open
  // (sample vault is fetched from the server and doesn't drift).
  useEffect(() => {
    if (vaultMode !== 'fsa') return
    let lastRescan = 0
    const onFocus = () => {
      // Throttle: don't refire within 2s of the previous rescan.
      const now = Date.now()
      if (now - lastRescan < 2000) return
      lastRescan = now
      reloadVault()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [vaultMode, reloadVault])

  if (vaultMode === 'none') {
    return (
      <ErrorBoundary>
        <VaultPicker />
      </ErrorBoundary>
    )
  }

  const selectedAsset = assets.find(a => a.id === selectedAssetId) ?? assets[0] ?? null

  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
        <Header />
        <LoadErrorBanner />
        <div className="flex flex-1 overflow-hidden">
          {view === 'asset' && (
            <>
              <AssetList />
              {selectedAsset ? (
                <AssetDetail asset={selectedAsset} />
              ) : (
                <main className="flex-1 flex items-center justify-center text-slate-400 italic px-6 text-center">
                  No properties in this vault yet — switch to the <strong className="mx-1 text-slate-600">Properties</strong> tab to add one.
                </main>
              )}
            </>
          )}
          {view === 'properties' && <PropertiesView />}
          {view === 'usage' && <UsageView />}
          {view === 'portfolio' && <PortfolioView />}
        </div>
        <ECMLibrary />
      </div>
    </ErrorBoundary>
  )
}
