import { create } from 'zustand'
import type { Asset, Scenario, ECM, Portfolio } from './engine/types'
import {
  loadVault, loadSampleVault, requestVaultDirectory, ensureReadWritePermission,
  writeScenario as writeScenarioToVault, writeECM as writeECMToVault,
  writeAsset as writeAssetToVault, writePortfolio as writePortfolioToVault,
  deleteScenario as deleteScenarioFromVault,
  deleteAsset as deleteAssetFromVault,
  deletePortfolio as deletePortfolioFromVault,
  deleteECM as deleteECMFromVault,
} from './vault/loader'

export type VaultMode = 'none' | 'sample' | 'fsa'
export type ViewMode = 'asset' | 'portfolio' | 'properties' | 'usage'

const UNDO_DEPTH = 20

interface UndoSnapshot {
  assets: Asset[]
  scenarios: Scenario[]
  ecms: ECM[]
  portfolios: Portfolio[]
  /** Human-readable description shown in the undo button + history list */
  label: string
  /** ms timestamp */
  ts: number
}

/**
 * Capture the pre-mutation state into the undo stack. Called at the very
 * start of every save/delete action. Caps at UNDO_DEPTH — older snapshots
 * fall off the back.
 *
 * Cheap because state arrays hold references (assets/scenarios are typically
 * <100 items each); deep copy isn't needed because the engine never mutates
 * the entity objects in place — every save call replaces the slot.
 */
function pushUndo(
  get: () => AppState,
  set: (partial: Partial<AppState>) => void,
  label: string,
): void {
  const s = get()
  const snap: UndoSnapshot = {
    assets: s.assets,
    scenarios: s.scenarios,
    ecms: s.ecms,
    portfolios: s.portfolios,
    label,
    ts: Date.now(),
  }
  const next = [...s.undoStack, snap]
  if (next.length > UNDO_DEPTH) next.shift()
  set({ undoStack: next })
}

interface AppState {
  // Vault state — vaultDir is non-serialisable; do NOT add persist middleware.
  vaultDir: FileSystemDirectoryHandle | null
  vaultMode: VaultMode
  vaultName: string
  vaultLoading: boolean
  loadErrors: string[]

  // Data
  assets: Asset[]
  scenarios: Scenario[]
  ecms: ECM[]
  portfolios: Portfolio[]

  // Selection
  view: ViewMode
  selectedAssetId: string | null
  activeScenarioIds: string[]
  selectedPortfolioId: string | null
  ecmPanelOpen: boolean

  // Actions
  openVaultFromFSA: () => Promise<void>
  openSampleVault: () => Promise<void>
  reloadVault: () => Promise<void>
  closeVault: () => void

  selectAsset: (id: string) => void
  toggleScenario: (id: string) => void
  setActiveScenarios: (ids: string[]) => void
  setView: (v: ViewMode) => void
  selectPortfolio: (id: string) => void
  setECMPanelOpen: (open: boolean) => void

  saveScenario: (scenario: Scenario) => Promise<void>
  deleteScenario: (scenarioId: string) => Promise<void>
  saveECM: (ecm: ECM) => Promise<void>
  deleteECM: (ecmId: string) => Promise<void>
  saveAsset: (asset: Asset) => Promise<void>
  deleteAsset: (assetId: string) => Promise<void>
  savePortfolio: (portfolio: Portfolio) => Promise<void>
  deletePortfolio: (portfolioId: string) => Promise<void>

  // Undo
  undoStack: UndoSnapshot[]
  undo: () => Promise<void>
  /** Description of the most recent undoable change, or null if nothing to undo. */
  undoableLabel: () => string | null
}

export const useStore = create<AppState>((set, get) => ({
  vaultDir: null,
  vaultMode: 'none',
  vaultName: '',
  vaultLoading: false,
  loadErrors: [],

  assets: [],
  scenarios: [],
  ecms: [],
  portfolios: [],

  view: 'asset',
  selectedAssetId: null,
  activeScenarioIds: [],
  selectedPortfolioId: null,
  ecmPanelOpen: false,

  undoStack: [],
  undoableLabel: (): string | null => {
    const stack = get().undoStack
    return stack.length > 0 ? stack[stack.length - 1].label : null
  },
  undo: async () => {
    const { undoStack, vaultMode, vaultDir, assets, scenarios, ecms, portfolios } = get()
    if (undoStack.length === 0) return
    const snap = undoStack[undoStack.length - 1]

    // Compute the diff against the current state so we can mirror it to disk
    // in FSA mode without re-writing every file (each save call rewrites
    // anyway, but only the changed ones).
    const newAssets = snap.assets
    const newScenarios = snap.scenarios
    const newEcms = snap.ecms
    const newPortfolios = snap.portfolios

    set({
      assets: newAssets,
      scenarios: newScenarios,
      ecms: newEcms,
      portfolios: newPortfolios,
      undoStack: undoStack.slice(0, -1),
    })

    if (vaultMode === 'fsa' && vaultDir) {
      // Mirror the snapshot to disk: write any changed entity, delete any
      // entity that was present before this undo but isn't in the snapshot.
      try {
        for (const a of newAssets) {
          const before = assets.find(x => x.id === a.id)
          if (!before || JSON.stringify(before) !== JSON.stringify(a)) {
            await writeAssetToVault(vaultDir, a)
          }
        }
        for (const old of assets) {
          if (!newAssets.find(a => a.id === old.id)) {
            await deleteAssetFromVault(vaultDir, old.id)
          }
        }
        for (const s of newScenarios) {
          const before = scenarios.find(x => x.id === s.id)
          if (!before || JSON.stringify(before) !== JSON.stringify(s)) {
            await writeScenarioToVault(vaultDir, s)
          }
        }
        for (const old of scenarios) {
          if (!newScenarios.find(s => s.id === old.id)) {
            await deleteScenarioFromVault(vaultDir, old.id)
          }
        }
        for (const e of newEcms) {
          const before = ecms.find(x => x.id === e.id)
          if (!before || JSON.stringify(before) !== JSON.stringify(e)) {
            await writeECMToVault(vaultDir, e)
          }
        }
        for (const old of ecms) {
          if (!newEcms.find(e => e.id === old.id)) {
            await deleteECMFromVault(vaultDir, old.id)
          }
        }
        for (const p of newPortfolios) {
          const before = portfolios.find(x => x.id === p.id)
          if (!before || JSON.stringify(before) !== JSON.stringify(p)) {
            await writePortfolioToVault(vaultDir, p)
          }
        }
        for (const old of portfolios) {
          if (!newPortfolios.find(p => p.id === old.id)) {
            await deletePortfolioFromVault(vaultDir, old.id)
          }
        }
      } catch (e) {
        set(s => ({ loadErrors: [...s.loadErrors, `Undo write-back: ${e instanceof Error ? e.message : String(e)}`] }))
      }
    }
  },

  openVaultFromFSA: async () => {
    set({ vaultLoading: true, loadErrors: [] })
    try {
      const dir = await requestVaultDirectory()
      await ensureReadWritePermission(dir)
      const v = await loadVault(dir)
      const firstAsset = v.assets[0]?.id ?? null
      const firstAssetScenarios = firstAsset
        ? v.scenarios.filter(s => s.asset_id === firstAsset).map(s => s.id)
        : []
      set({
        vaultDir: dir,
        vaultMode: 'fsa',
        vaultName: dir.name,
        assets: v.assets,
        scenarios: v.scenarios,
        ecms: v.ecms,
        portfolios: v.portfolios,
        loadErrors: v.errors,
        selectedAssetId: firstAsset,
        activeScenarioIds: firstAssetScenarios,
        selectedPortfolioId: v.portfolios[0]?.id ?? null,
        undoStack: [],
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // Ignore user cancellation — looks like AbortError.
      if (!/abort/i.test(msg)) set({ loadErrors: [msg] })
    } finally {
      set({ vaultLoading: false })
    }
  },

  openSampleVault: async () => {
    set({ vaultLoading: true, loadErrors: [] })
    try {
      const v = await loadSampleVault('/sample-vault')
      const firstAsset = v.assets[0]?.id ?? null
      const firstAssetScenarios = firstAsset
        ? v.scenarios.filter(s => s.asset_id === firstAsset).map(s => s.id)
        : []
      set({
        vaultDir: null,
        vaultMode: 'sample',
        vaultName: 'Sample Vault',
        assets: v.assets,
        scenarios: v.scenarios,
        ecms: v.ecms,
        portfolios: v.portfolios,
        loadErrors: v.errors,
        selectedAssetId: firstAsset,
        activeScenarioIds: firstAssetScenarios,
        selectedPortfolioId: v.portfolios[0]?.id ?? null,
        undoStack: [],
      })
    } catch (e) {
      set({ loadErrors: [e instanceof Error ? e.message : String(e)] })
    } finally {
      set({ vaultLoading: false })
    }
  },

  reloadVault: async () => {
    const { vaultMode, vaultDir } = get()
    if (vaultMode === 'fsa' && vaultDir) {
      const v = await loadVault(vaultDir)
      set({
        assets: v.assets,
        scenarios: v.scenarios,
        ecms: v.ecms,
        portfolios: v.portfolios,
        loadErrors: v.errors,
      })
    } else if (vaultMode === 'sample') {
      await get().openSampleVault()
    }
  },

  closeVault: () => set({
    vaultDir: null,
    vaultMode: 'none',
    vaultName: '',
    assets: [], scenarios: [], ecms: [], portfolios: [],
    selectedAssetId: null, activeScenarioIds: [], selectedPortfolioId: null,
    loadErrors: [],
    undoStack: [],
  }),

  selectAsset: (id) => {
    const { scenarios } = get()
    const assetScenarios = scenarios.filter(s => s.asset_id === id).map(s => s.id)
    set({
      selectedAssetId: id,
      activeScenarioIds: assetScenarios,
    })
  },

  toggleScenario: (id) => set(s => ({
    activeScenarioIds: s.activeScenarioIds.includes(id)
      ? s.activeScenarioIds.filter(x => x !== id)
      : [...s.activeScenarioIds, id],
  })),

  setActiveScenarios: (ids) => set({ activeScenarioIds: ids }),

  setView: (v) => set({ view: v }),

  selectPortfolio: (id) => set({ selectedPortfolioId: id }),

  setECMPanelOpen: (open) => set({ ecmPanelOpen: open }),

  saveScenario: async (scenario) => {
    pushUndo(get, set, `Save scenario "${scenario.name}"`)
    const { vaultMode, vaultDir, scenarios } = get()
    const next = scenarios.some(s => s.id === scenario.id)
      ? scenarios.map(s => (s.id === scenario.id ? scenario : s))
      : [...scenarios, scenario]
    set({ scenarios: next })
    if (vaultMode === 'fsa' && vaultDir) {
      try {
        await writeScenarioToVault(vaultDir, scenario)
      } catch (e) {
        set(s => ({ loadErrors: [...s.loadErrors, `Save scenario "${scenario.name}": ${e instanceof Error ? e.message : String(e)}`] }))
      }
    }
  },

  deleteScenario: async (scenarioId) => {
    pushUndo(get, set, `Delete scenario`)
    const { vaultMode, vaultDir, scenarios, activeScenarioIds } = get()
    set({
      scenarios: scenarios.filter(s => s.id !== scenarioId),
      activeScenarioIds: activeScenarioIds.filter(x => x !== scenarioId),
    })
    if (vaultMode === 'fsa' && vaultDir) {
      try {
        await deleteScenarioFromVault(vaultDir, scenarioId)
      } catch (e) {
        set(s => ({ loadErrors: [...s.loadErrors, `Delete scenario: ${e instanceof Error ? e.message : String(e)}`] }))
      }
    }
  },

  saveECM: async (ecm) => {
    pushUndo(get, set, `Save ECM "${ecm.name}"`)
    const { vaultMode, vaultDir, ecms } = get()
    const next = ecms.some(x => x.id === ecm.id)
      ? ecms.map(x => (x.id === ecm.id ? ecm : x))
      : [...ecms, ecm]
    set({ ecms: next })
    if (vaultMode === 'fsa' && vaultDir) {
      try {
        await writeECMToVault(vaultDir, ecm)
      } catch (e) {
        set(s => ({ loadErrors: [...s.loadErrors, `Save ECM: ${e instanceof Error ? e.message : String(e)}`] }))
      }
    }
  },

  saveAsset: async (asset) => {
    pushUndo(get, set, `Save asset "${asset.name}"`)
    const { vaultMode, vaultDir, assets, selectedAssetId } = get()
    const next = assets.some(a => a.id === asset.id)
      ? assets.map(a => (a.id === asset.id ? asset : a))
      : [...assets, asset]
    set({
      assets: next,
      selectedAssetId: selectedAssetId ?? asset.id,
    })
    if (vaultMode === 'fsa' && vaultDir) {
      try {
        await writeAssetToVault(vaultDir, asset)
      } catch (e) {
        set(s => ({ loadErrors: [...s.loadErrors, `Save asset "${asset.name}": ${e instanceof Error ? e.message : String(e)}`] }))
      }
    }
  },

  deleteAsset: async (assetId) => {
    pushUndo(get, set, `Delete asset`)
    const { vaultMode, vaultDir, assets, selectedAssetId } = get()
    const remaining = assets.filter(a => a.id !== assetId)
    set({
      assets: remaining,
      selectedAssetId: selectedAssetId === assetId ? (remaining[0]?.id ?? null) : selectedAssetId,
    })
    if (vaultMode === 'fsa' && vaultDir) {
      try {
        await deleteAssetFromVault(vaultDir, assetId)
      } catch (e) {
        set(s => ({ loadErrors: [...s.loadErrors, `Delete asset: ${e instanceof Error ? e.message : String(e)}`] }))
      }
    }
  },

  savePortfolio: async (portfolio) => {
    pushUndo(get, set, `Save portfolio "${portfolio.name}"`)
    const { vaultMode, vaultDir, portfolios, selectedPortfolioId } = get()
    const next = portfolios.some(p => p.id === portfolio.id)
      ? portfolios.map(p => (p.id === portfolio.id ? portfolio : p))
      : [...portfolios, portfolio]
    set({
      portfolios: next,
      selectedPortfolioId: selectedPortfolioId ?? portfolio.id,
    })
    if (vaultMode === 'fsa' && vaultDir) {
      try {
        await writePortfolioToVault(vaultDir, portfolio)
      } catch (e) {
        set(s => ({ loadErrors: [...s.loadErrors, `Save portfolio "${portfolio.name}": ${e instanceof Error ? e.message : String(e)}`] }))
      }
    }
  },

  deletePortfolio: async (portfolioId) => {
    pushUndo(get, set, `Delete portfolio`)
    const { vaultMode, vaultDir, portfolios, selectedPortfolioId } = get()
    const remaining = portfolios.filter(p => p.id !== portfolioId)
    set({
      portfolios: remaining,
      selectedPortfolioId: selectedPortfolioId === portfolioId ? (remaining[0]?.id ?? null) : selectedPortfolioId,
    })
    if (vaultMode === 'fsa' && vaultDir) {
      try {
        await deletePortfolioFromVault(vaultDir, portfolioId)
      } catch (e) {
        set(s => ({ loadErrors: [...s.loadErrors, `Delete portfolio: ${e instanceof Error ? e.message : String(e)}`] }))
      }
    }
  },

  deleteECM: async (ecmId) => {
    pushUndo(get, set, `Delete ECM`)
    const { vaultMode, vaultDir, ecms } = get()
    set({ ecms: ecms.filter(x => x.id !== ecmId) })
    if (vaultMode === 'fsa' && vaultDir) {
      try {
        await deleteECMFromVault(vaultDir, ecmId)
      } catch (e) {
        set(s => ({ loadErrors: [...s.loadErrors, `Delete ECM: ${e instanceof Error ? e.message : String(e)}`] }))
      }
    }
  },
}))
