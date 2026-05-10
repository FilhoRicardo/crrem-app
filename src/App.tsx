import { useStore } from './store'
import VaultPicker from './components/VaultPicker'
import Header from './components/Header'
import AssetList from './components/AssetList'
import AssetDetail from './components/AssetDetail'
import PortfolioView from './components/PortfolioView'
import ECMLibrary from './components/ECMLibrary'
import ErrorBoundary from './components/ErrorBoundary'
import LoadErrorBanner from './components/LoadErrorBanner'

export default function App() {
  const vaultMode = useStore(s => s.vaultMode)
  const view = useStore(s => s.view)
  const assets = useStore(s => s.assets)
  const selectedAssetId = useStore(s => s.selectedAssetId)

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
          {view === 'asset' ? (
            <>
              <AssetList />
              {selectedAsset ? (
                <AssetDetail asset={selectedAsset} />
              ) : (
                <main className="flex-1 flex items-center justify-center text-slate-400 italic">
                  No assets in this vault. Add a <code className="mx-1">.md</code> file to <code>assets/</code>.
                </main>
              )}
            </>
          ) : (
            <PortfolioView />
          )}
        </div>
        <ECMLibrary />
      </div>
    </ErrorBoundary>
  )
}
