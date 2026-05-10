import { useStore } from '../store'
import { isFSASupported } from '../vault/loader'
import TemplateButton from './TemplateButton'

export default function VaultPicker() {
  const openVaultFromFSA = useStore(s => s.openVaultFromFSA)
  const openSampleVault = useStore(s => s.openSampleVault)
  const vaultLoading = useStore(s => s.vaultLoading)
  const errors = useStore(s => s.loadErrors)
  const supported = isFSASupported()

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <header className="bg-crrem-navy text-white px-6 py-4 flex items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">CRREM Admin</h1>
        <span className="text-xs bg-white/20 px-2 py-0.5 rounded">v0.0.1</span>
      </header>
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <div className="text-center mb-6">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-crrem-navy flex items-center justify-center text-white text-2xl mb-3">
                📁
              </div>
              <h2 className="text-2xl font-semibold text-slate-900">
                Open a CRREM vault
              </h2>
              <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
                A vault is a folder of <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">.md</code> files
                holding your assets, scenarios, ECMs, and portfolios. It's yours, it's portable, and it works in Obsidian.
              </p>
            </div>

            <div className="space-y-3">
              {supported ? (
                <button
                  onClick={() => openVaultFromFSA()}
                  disabled={vaultLoading}
                  className="w-full bg-crrem-navy text-white font-medium py-3 px-5 rounded-xl hover:bg-crrem-navy/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {vaultLoading ? 'Loading…' : 'Open vault folder…'}
                </button>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
                  <p className="font-semibold">This browser doesn't support vault folders.</p>
                  <p className="mt-1 text-amber-800/80">
                    The File System Access API is required, which is currently Chrome and Edge desktop only.
                    On Firefox, Safari, or mobile, you can still try the demo with the sample vault below.
                  </p>
                </div>
              )}

              <div className="flex items-center gap-3 my-2">
                <div className="flex-1 h-px bg-slate-200"></div>
                <span className="text-xs uppercase tracking-wider text-slate-400">or</span>
                <div className="flex-1 h-px bg-slate-200"></div>
              </div>

              <button
                onClick={() => openSampleVault()}
                disabled={vaultLoading}
                className="w-full border-2 border-slate-200 text-slate-700 font-medium py-3 px-5 rounded-xl hover:border-crrem-navy hover:text-crrem-navy transition-colors disabled:opacity-50"
              >
                Try with the sample vault →
              </button>

              <p className="text-xs text-slate-400 text-center pt-2">
                The sample vault is loaded read-only from this server.
                Your changes won't be saved unless you open a real folder.
              </p>
            </div>

            {errors.length > 0 && (
              <div className="mt-6 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-900">
                <p className="font-semibold mb-1">Could not load vault:</p>
                <ul className="list-disc list-inside text-red-700 text-xs space-y-1">
                  {errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
          </div>

          <p className="text-center text-xs text-slate-400 mt-4">
            Your data stays on your machine. No accounts, no servers.
          </p>

          <div className="mt-6 bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-700">Vault file templates</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Download a blank <code>.md</code> for any vault file type. Open in Obsidian or any text editor,
                  fill in the fields, drop into your vault folder.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <TemplateButton kind="asset" />
              <TemplateButton kind="scenario" />
              <TemplateButton kind="ecm" />
              <TemplateButton kind="portfolio" />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
