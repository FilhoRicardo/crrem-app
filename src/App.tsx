export default function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-crrem-navy text-white px-6 py-4 flex items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">CRREM Admin</h1>
        <span className="text-xs bg-white/20 px-2 py-0.5 rounded">v0.0.1</span>
      </header>
      <main className="p-8 max-w-3xl mx-auto">
        <p className="text-slate-500 text-sm">
          Open a vault folder to get started.
        </p>
      </main>
    </div>
  )
}
