import { create } from 'zustand'
import type { Asset, Scenario, ECM, Portfolio } from './engine/types'
import {
  loadVault, loadSampleVault, requestVaultDirectory, ensureReadWritePermission,
  writeScenario as writeScenarioToVault, writeECM as writeECMToVault,
  deleteScenario as deleteScenarioFromVault,
} from './vault/loader'

export type VaultMode = 'none' | 'sample' | 'fsa'
export type ViewMode = 'asset' | 'portfolio'

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
}))
