import { beforeEach, describe, test, expect } from 'vitest'
import { useStore } from './store'
import type { Asset, Scenario, ECM, Portfolio } from './engine/types'

// Direct unit tests against the Zustand store. We focus on the in-memory
// state mutations (selection, save, delete, cascading effects). Disk writes
// only happen when vaultMode === 'fsa', so all tests run in 'none' / 'sample'
// mode (no FileSystemAccess required).

const makeAsset = (id: string, name = id): Asset => ({
  id,
  name,
  country: 'Germany',
  property_type: 'Office',
  gia_m2: 5000,
  reporting_year: 2024,
  energy: { Elec_Grid: 100_000 },
})

const makeScenario = (id: string, asset_id: string, name = id): Scenario => ({
  id, name, asset_id, retrofits: [],
})

const makeECM = (id: string, name = id): ECM => ({
  id, name, category: 'Lighting', impacts: [],
})

const makePortfolio = (id: string, asset_ids: string[], name = id): Portfolio => ({
  id, name, asset_ids, weighting: 'gia',
})

beforeEach(() => {
  // Reset the store to a clean slate before each test
  useStore.setState({
    vaultDir: null, vaultMode: 'none', vaultName: '', vaultLoading: false,
    loadErrors: [],
    assets: [], scenarios: [], ecms: [], portfolios: [],
    view: 'asset',
    selectedAssetId: null, activeScenarioIds: [], selectedPortfolioId: null,
    ecmPanelOpen: false,
    undoStack: [],
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Selection
// ─────────────────────────────────────────────────────────────────────────────

describe('selectAsset', () => {
  test('selects the asset and auto-activates all its scenarios', () => {
    useStore.setState({
      assets: [makeAsset('a'), makeAsset('b')],
      scenarios: [makeScenario('s1', 'a'), makeScenario('s2', 'a'), makeScenario('s3', 'b')],
      selectedAssetId: 'b',
      activeScenarioIds: ['s3'],
    })
    useStore.getState().selectAsset('a')
    const s = useStore.getState()
    expect(s.selectedAssetId).toBe('a')
    expect(new Set(s.activeScenarioIds)).toEqual(new Set(['s1', 's2']))
  })

  test('selecting an asset with no scenarios clears active scenarios', () => {
    useStore.setState({
      assets: [makeAsset('a'), makeAsset('b')],
      scenarios: [makeScenario('s1', 'a')],
      selectedAssetId: 'a',
      activeScenarioIds: ['s1'],
    })
    useStore.getState().selectAsset('b')
    expect(useStore.getState().activeScenarioIds).toEqual([])
  })
})

describe('toggleScenario', () => {
  test('adds scenario id when not present', () => {
    useStore.setState({ activeScenarioIds: ['a', 'b'] })
    useStore.getState().toggleScenario('c')
    expect(useStore.getState().activeScenarioIds).toEqual(['a', 'b', 'c'])
  })

  test('removes scenario id when present', () => {
    useStore.setState({ activeScenarioIds: ['a', 'b', 'c'] })
    useStore.getState().toggleScenario('b')
    expect(useStore.getState().activeScenarioIds).toEqual(['a', 'c'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Asset CRUD
// ─────────────────────────────────────────────────────────────────────────────

describe('saveAsset', () => {
  test('appends a brand-new asset and auto-selects when no selection', async () => {
    expect(useStore.getState().assets).toEqual([])
    await useStore.getState().saveAsset(makeAsset('new'))
    const s = useStore.getState()
    expect(s.assets).toHaveLength(1)
    expect(s.assets[0].id).toBe('new')
    expect(s.selectedAssetId).toBe('new')
  })

  test('updates existing asset in place (does not duplicate)', async () => {
    useStore.setState({ assets: [makeAsset('keep'), makeAsset('change')] })
    const updated = { ...makeAsset('change'), name: 'Renamed' }
    await useStore.getState().saveAsset(updated)
    const s = useStore.getState()
    expect(s.assets).toHaveLength(2)
    expect(s.assets.find(a => a.id === 'change')?.name).toBe('Renamed')
    expect(s.assets.find(a => a.id === 'keep')?.name).toBe('keep')
  })

  test('preserves existing selection when adding more assets', async () => {
    useStore.setState({ assets: [makeAsset('a')], selectedAssetId: 'a' })
    await useStore.getState().saveAsset(makeAsset('b'))
    expect(useStore.getState().selectedAssetId).toBe('a')
  })
})

describe('deleteAsset', () => {
  test('removes the asset from the list', async () => {
    useStore.setState({
      assets: [makeAsset('a'), makeAsset('b'), makeAsset('c')],
      selectedAssetId: 'b',
    })
    await useStore.getState().deleteAsset('a')
    expect(useStore.getState().assets.map(a => a.id)).toEqual(['b', 'c'])
  })

  test('reassigns selection to the next remaining asset when current is deleted', async () => {
    useStore.setState({
      assets: [makeAsset('a'), makeAsset('b'), makeAsset('c')],
      selectedAssetId: 'b',
    })
    await useStore.getState().deleteAsset('b')
    const s = useStore.getState()
    expect(s.selectedAssetId).not.toBe('b')
    expect(['a', 'c']).toContain(s.selectedAssetId)
  })

  test('selection becomes null when last asset is deleted', async () => {
    useStore.setState({ assets: [makeAsset('only')], selectedAssetId: 'only' })
    await useStore.getState().deleteAsset('only')
    expect(useStore.getState().selectedAssetId).toBeNull()
  })

  test('preserves selection when deleting a different asset', async () => {
    useStore.setState({
      assets: [makeAsset('a'), makeAsset('b')],
      selectedAssetId: 'a',
    })
    await useStore.getState().deleteAsset('b')
    expect(useStore.getState().selectedAssetId).toBe('a')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario CRUD
// ─────────────────────────────────────────────────────────────────────────────

describe('saveScenario', () => {
  test('appends a brand-new scenario', async () => {
    await useStore.getState().saveScenario(makeScenario('s1', 'a'))
    expect(useStore.getState().scenarios).toHaveLength(1)
  })

  test('updates an existing scenario in place', async () => {
    useStore.setState({ scenarios: [makeScenario('s1', 'a', 'old')] })
    await useStore.getState().saveScenario({ ...makeScenario('s1', 'a'), name: 'new' })
    const s = useStore.getState()
    expect(s.scenarios).toHaveLength(1)
    expect(s.scenarios[0].name).toBe('new')
  })
})

describe('deleteScenario', () => {
  test('removes the scenario and de-activates it from activeScenarioIds', async () => {
    useStore.setState({
      scenarios: [makeScenario('s1', 'a'), makeScenario('s2', 'a')],
      activeScenarioIds: ['s1', 's2'],
    })
    await useStore.getState().deleteScenario('s1')
    const s = useStore.getState()
    expect(s.scenarios.map(x => x.id)).toEqual(['s2'])
    expect(s.activeScenarioIds).toEqual(['s2'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Portfolio CRUD
// ─────────────────────────────────────────────────────────────────────────────

describe('savePortfolio', () => {
  test('appends + auto-selects when no selection', async () => {
    await useStore.getState().savePortfolio(makePortfolio('p1', ['a']))
    const s = useStore.getState()
    expect(s.portfolios).toHaveLength(1)
    expect(s.selectedPortfolioId).toBe('p1')
  })

  test('updates existing portfolio in place', async () => {
    useStore.setState({ portfolios: [makePortfolio('p1', ['a'], 'old')] })
    await useStore.getState().savePortfolio({ ...makePortfolio('p1', ['a', 'b']), name: 'new' })
    const s = useStore.getState()
    expect(s.portfolios).toHaveLength(1)
    expect(s.portfolios[0].name).toBe('new')
    expect(s.portfolios[0].asset_ids).toEqual(['a', 'b'])
  })
})

describe('deletePortfolio', () => {
  test('reassigns selectedPortfolioId when current is deleted', async () => {
    useStore.setState({
      portfolios: [makePortfolio('p1', ['a']), makePortfolio('p2', ['b'])],
      selectedPortfolioId: 'p1',
    })
    await useStore.getState().deletePortfolio('p1')
    expect(useStore.getState().selectedPortfolioId).toBe('p2')
  })

  test('selectedPortfolioId becomes null when last portfolio is deleted', async () => {
    useStore.setState({
      portfolios: [makePortfolio('only', ['a'])],
      selectedPortfolioId: 'only',
    })
    await useStore.getState().deletePortfolio('only')
    expect(useStore.getState().selectedPortfolioId).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ECM CRUD
// ─────────────────────────────────────────────────────────────────────────────

describe('saveECM / deleteECM', () => {
  test('appends a new ECM', async () => {
    await useStore.getState().saveECM(makeECM('e1'))
    expect(useStore.getState().ecms).toHaveLength(1)
  })

  test('updates an existing ECM in place', async () => {
    useStore.setState({ ecms: [makeECM('e1', 'old')] })
    await useStore.getState().saveECM({ ...makeECM('e1'), name: 'new' })
    expect(useStore.getState().ecms).toHaveLength(1)
    expect(useStore.getState().ecms[0].name).toBe('new')
  })

  test('removes the ECM', async () => {
    useStore.setState({ ecms: [makeECM('a'), makeECM('b')] })
    await useStore.getState().deleteECM('a')
    expect(useStore.getState().ecms.map(e => e.id)).toEqual(['b'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// View / panel state
// ─────────────────────────────────────────────────────────────────────────────

describe('view + panel', () => {
  test('setView updates the view mode', () => {
    useStore.getState().setView('portfolio')
    expect(useStore.getState().view).toBe('portfolio')
    useStore.getState().setView('usage')
    expect(useStore.getState().view).toBe('usage')
  })

  test('setECMPanelOpen toggles panel visibility', () => {
    useStore.getState().setECMPanelOpen(true)
    expect(useStore.getState().ecmPanelOpen).toBe(true)
    useStore.getState().setECMPanelOpen(false)
    expect(useStore.getState().ecmPanelOpen).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// closeVault — full cleanup
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Undo stack
// ─────────────────────────────────────────────────────────────────────────────

describe('undo', () => {
  test('saveAsset captures pre-state; undo restores it', async () => {
    useStore.setState({ assets: [makeAsset('original')] })
    expect(useStore.getState().undoStack).toHaveLength(0)

    await useStore.getState().saveAsset(makeAsset('new'))
    expect(useStore.getState().assets).toHaveLength(2)
    expect(useStore.getState().undoStack).toHaveLength(1)
    expect(useStore.getState().undoStack[0].label).toMatch(/Save asset.*new/)

    await useStore.getState().undo()
    expect(useStore.getState().assets).toHaveLength(1)
    expect(useStore.getState().assets[0].id).toBe('original')
    expect(useStore.getState().undoStack).toHaveLength(0)
  })

  test('multiple mutations stack; undo pops one at a time (LIFO)', async () => {
    await useStore.getState().saveAsset(makeAsset('a'))
    await useStore.getState().saveAsset(makeAsset('b'))
    await useStore.getState().saveAsset(makeAsset('c'))
    expect(useStore.getState().assets).toHaveLength(3)
    expect(useStore.getState().undoStack).toHaveLength(3)

    await useStore.getState().undo()
    expect(useStore.getState().assets.map(a => a.id)).toEqual(['a', 'b'])
    await useStore.getState().undo()
    expect(useStore.getState().assets.map(a => a.id)).toEqual(['a'])
    await useStore.getState().undo()
    expect(useStore.getState().assets).toEqual([])
  })

  test('undo on empty stack is a no-op', async () => {
    expect(useStore.getState().undoStack).toHaveLength(0)
    await useStore.getState().undo()  // should not throw
    expect(useStore.getState().assets).toEqual([])
  })

  test('stack caps at UNDO_DEPTH (20) — older snapshots fall off', async () => {
    for (let i = 0; i < 25; i++) {
      await useStore.getState().saveAsset(makeAsset(`a${i}`))
    }
    expect(useStore.getState().undoStack.length).toBeLessThanOrEqual(20)
  })

  test('deleteAsset is undoable', async () => {
    useStore.setState({ assets: [makeAsset('victim'), makeAsset('keeper')] })
    await useStore.getState().deleteAsset('victim')
    expect(useStore.getState().assets.map(a => a.id)).toEqual(['keeper'])

    await useStore.getState().undo()
    expect(useStore.getState().assets.map(a => a.id).sort()).toEqual(['keeper', 'victim'])
  })

  test('saveScenario / saveECM / savePortfolio all push undo entries', async () => {
    await useStore.getState().saveScenario(makeScenario('s', 'a'))
    await useStore.getState().saveECM(makeECM('e'))
    await useStore.getState().savePortfolio(makePortfolio('p', ['a']))
    expect(useStore.getState().undoStack).toHaveLength(3)
    expect(useStore.getState().undoStack[0].label).toMatch(/scenario/)
    expect(useStore.getState().undoStack[1].label).toMatch(/ECM/)
    expect(useStore.getState().undoStack[2].label).toMatch(/portfolio/)
  })

  test('closeVault clears the undo stack', async () => {
    await useStore.getState().saveAsset(makeAsset('a'))
    expect(useStore.getState().undoStack).toHaveLength(1)
    useStore.getState().closeVault()
    expect(useStore.getState().undoStack).toHaveLength(0)
  })

  test('undoableLabel returns most recent label or null', async () => {
    expect(useStore.getState().undoableLabel()).toBeNull()
    await useStore.getState().saveAsset(makeAsset('a', 'Alpha'))
    expect(useStore.getState().undoableLabel()).toMatch(/Alpha/)
    await useStore.getState().undo()
    expect(useStore.getState().undoableLabel()).toBeNull()
  })
})

describe('closeVault', () => {
  test('clears every piece of vault state', () => {
    useStore.setState({
      vaultMode: 'sample',
      vaultName: 'Sample Vault',
      assets: [makeAsset('a')],
      scenarios: [makeScenario('s1', 'a')],
      ecms: [makeECM('e1')],
      portfolios: [makePortfolio('p1', ['a'])],
      selectedAssetId: 'a',
      activeScenarioIds: ['s1'],
      selectedPortfolioId: 'p1',
      loadErrors: ['old error'],
    })
    useStore.getState().closeVault()
    const s = useStore.getState()
    expect(s.vaultMode).toBe('none')
    expect(s.vaultName).toBe('')
    expect(s.assets).toEqual([])
    expect(s.scenarios).toEqual([])
    expect(s.ecms).toEqual([])
    expect(s.portfolios).toEqual([])
    expect(s.selectedAssetId).toBeNull()
    expect(s.activeScenarioIds).toEqual([])
    expect(s.selectedPortfolioId).toBeNull()
    expect(s.loadErrors).toEqual([])
  })
})
