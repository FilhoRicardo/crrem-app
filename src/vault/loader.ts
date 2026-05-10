import yaml from 'js-yaml'
import type {
  Asset, Scenario, ECM, Portfolio, Retrofit, ECMImpact, MixedUseSplit, EnergyMap,
} from '../engine/types'

// ────────────────────────────────────────────────────────────────────────────
// Frontmatter
// ────────────────────────────────────────────────────────────────────────────

export function parseFrontmatter(content: string): {
  data: Record<string, unknown>
  body: string
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { data: {}, body: content }
  return {
    data: (yaml.load(match[1]) as Record<string, unknown>) ?? {},
    body: match[2],
  }
}

export function buildFrontmatter(data: Record<string, unknown>, body: string): string {
  const fm = yaml.dump(data, { lineWidth: 120, noRefs: true, quotingType: '"' })
  return `---\n${fm}---\n${body}`
}

// ────────────────────────────────────────────────────────────────────────────
// Vault picker (FSA)
// ────────────────────────────────────────────────────────────────────────────

export function isFSASupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

export async function requestVaultDirectory(): Promise<FileSystemDirectoryHandle> {
  if (!isFSASupported()) {
    throw new Error(
      'File System Access API is not supported in this browser. ' +
      'Please use Chrome or Edge on desktop.',
    )
  }
  return await window.showDirectoryPicker!({ mode: 'readwrite', id: 'crrem-vault' })
}

export async function ensureReadWritePermission(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  const opts = { mode: 'readwrite' as const }
  if (!handle.queryPermission || !handle.requestPermission) return true
  if ((await handle.queryPermission(opts)) === 'granted') return true
  return (await handle.requestPermission(opts)) === 'granted'
}

// ────────────────────────────────────────────────────────────────────────────
// Folder iteration helpers
// ────────────────────────────────────────────────────────────────────────────

async function getOrNullDir(
  vault: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await vault.getDirectoryHandle(name)
  } catch {
    return null
  }
}

async function readMdFiles(
  dir: FileSystemDirectoryHandle | null,
): Promise<Array<{ filename: string; content: string }>> {
  if (!dir) return []
  const out: Array<{ filename: string; content: string }> = []
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind !== 'file' || !name.toLowerCase().endsWith('.md')) continue
    const file = await (handle as FileSystemFileHandle).getFile()
    const content = await file.text()
    out.push({ filename: name, content })
  }
  return out
}

// ────────────────────────────────────────────────────────────────────────────
// Validation + parsing
// ────────────────────────────────────────────────────────────────────────────

class LoadError extends Error {
  constructor(public filename: string, message: string) {
    super(`${filename}: ${message}`)
  }
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function asString(v: unknown, field: string, filename: string): string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new LoadError(filename, `field "${field}" must be a non-empty string`)
  }
  return v
}

function asNumber(v: unknown, field: string, filename: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new LoadError(filename, `field "${field}" must be a number`)
  }
  return v
}

function parseAsset(filename: string, data: Record<string, unknown>, body: string): Asset {
  const required = ['id', 'name', 'country', 'property_type', 'gia_m2', 'reporting_year']
  for (const f of required) {
    if (data[f] === undefined || data[f] === null) {
      throw new LoadError(filename, `missing required field "${f}"`)
    }
  }
  const gia = asNumber(data.gia_m2, 'gia_m2', filename)
  if (gia <= 0) throw new LoadError(filename, `gia_m2 must be > 0`)
  const energy = (isObj(data.energy) ? data.energy : {}) as EnergyMap
  const split = Array.isArray(data.mixed_use_split)
    ? (data.mixed_use_split as Array<Record<string, unknown>>).map((s, i) => ({
        propertyType: asString(s.propertyType ?? s.property_type, `mixed_use_split[${i}].propertyType`, filename),
        fraction: asNumber(s.fraction, `mixed_use_split[${i}].fraction`, filename),
      }))
    : undefined
  return {
    id: asString(data.id, 'id', filename),
    name: asString(data.name, 'name', filename),
    country: asString(data.country, 'country', filename),
    property_type: asString(data.property_type, 'property_type', filename),
    gia_m2: gia,
    reporting_year: asNumber(data.reporting_year, 'reporting_year', filename),
    energy,
    postal_code: typeof data.postal_code === 'string' ? data.postal_code : undefined,
    region: typeof data.region === 'string' ? data.region : undefined,
    mixed_use_split: split,
    utility_prices: isObj(data.utility_prices) ? (data.utility_prices as Asset['utility_prices']) : undefined,
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : undefined,
    body,
  }
}

function parseRetrofit(r: unknown, idx: number, filename: string): Retrofit {
  if (!isObj(r)) throw new LoadError(filename, `retrofits[${idx}] must be an object`)
  const impacts = Array.isArray(r.impacts) ? r.impacts : []
  return {
    id: asString(r.id, `retrofits[${idx}].id`, filename),
    year: asNumber(r.year, `retrofits[${idx}].year`, filename),
    name: asString(r.name, `retrofits[${idx}].name`, filename),
    ecm_id: typeof r.ecm_id === 'string' ? r.ecm_id : undefined,
    impacts: impacts.map((imp, i) => {
      if (!isObj(imp)) throw new LoadError(filename, `retrofits[${idx}].impacts[${i}] must be an object`)
      const op = asString(imp.operation, `retrofits[${idx}].impacts[${i}].operation`, filename)
      const mode = (imp.mode as string) ?? 'absolute'
      return {
        carrier: asString(imp.carrier, `retrofits[${idx}].impacts[${i}].carrier`, filename) as Retrofit['impacts'][number]['carrier'],
        operation: op as 'reduce' | 'remove' | 'add',
        mode: mode as 'percent' | 'absolute',
        value: typeof imp.value === 'number' ? imp.value : 0,
      }
    }),
    cost: isObj(r.cost) ? (r.cost as Retrofit['cost']) : undefined,
  }
}

function parseScenario(filename: string, data: Record<string, unknown>, body: string): Scenario {
  const required = ['id', 'name', 'asset_id']
  for (const f of required) {
    if (data[f] === undefined) throw new LoadError(filename, `missing required field "${f}"`)
  }
  const retrofits = Array.isArray(data.retrofits) ? data.retrofits : []
  return {
    id: asString(data.id, 'id', filename),
    name: asString(data.name, 'name', filename),
    asset_id: asString(data.asset_id, 'asset_id', filename),
    parent_scenario_id: typeof data.parent_scenario_id === 'string' ? data.parent_scenario_id : undefined,
    retrofits: retrofits.map((r, i) => parseRetrofit(r, i, filename)),
    body,
  }
}

function parseECMImpact(imp: unknown, idx: number, filename: string): ECMImpact {
  if (!isObj(imp)) throw new LoadError(filename, `impacts[${idx}] must be an object`)
  const carrier = asString(imp.carrier, `impacts[${idx}].carrier`, filename)
  const operation = asString(imp.operation, `impacts[${idx}].operation`, filename)
  const mode = (imp.mode as string) ?? 'absolute'
  // value_typical is required if not a 'remove'
  let value_typical = 0
  if (typeof imp.value_typical === 'number') value_typical = imp.value_typical
  else if (typeof imp.value === 'number') value_typical = imp.value
  return {
    carrier: carrier as ECMImpact['carrier'],
    operation: operation as ECMImpact['operation'],
    mode: mode as ECMImpact['mode'],
    value_typical,
    value_low: typeof imp.value_low === 'number' ? imp.value_low : undefined,
    value_high: typeof imp.value_high === 'number' ? imp.value_high : undefined,
    note: typeof imp.note === 'string' ? imp.note : undefined,
  }
}

function parseECM(filename: string, data: Record<string, unknown>, body: string): ECM {
  const required = ['id', 'name', 'category']
  for (const f of required) {
    if (data[f] === undefined) throw new LoadError(filename, `missing required field "${f}"`)
  }
  const impacts = Array.isArray(data.impacts) ? data.impacts : []
  const range = Array.isArray(data.payback_years_range) && data.payback_years_range.length === 2
    ? [data.payback_years_range[0] as number, data.payback_years_range[1] as number] as [number, number]
    : undefined
  return {
    id: asString(data.id, 'id', filename),
    name: asString(data.name, 'name', filename),
    category: asString(data.category, 'category', filename),
    version: typeof data.version === 'string' ? data.version : undefined,
    license: typeof data.license === 'string' ? data.license : undefined,
    summary: typeof data.summary === 'string' ? data.summary : undefined,
    applicability: typeof data.applicability === 'string' ? data.applicability : undefined,
    impacts: impacts.map((imp, i) => parseECMImpact(imp, i, filename)),
    cost: isObj(data.cost) ? (data.cost as ECM['cost']) : undefined,
    payback_years_range: range,
    notes: typeof data.notes === 'string' ? data.notes : undefined,
    body,
  }
}

function parsePortfolio(filename: string, data: Record<string, unknown>, body: string): Portfolio {
  const required = ['id', 'name', 'asset_ids']
  for (const f of required) {
    if (data[f] === undefined) throw new LoadError(filename, `missing required field "${f}"`)
  }
  if (!Array.isArray(data.asset_ids)) {
    throw new LoadError(filename, `asset_ids must be an array`)
  }
  return {
    id: asString(data.id, 'id', filename),
    name: asString(data.name, 'name', filename),
    asset_ids: (data.asset_ids as unknown[]).map(s => String(s)),
    weighting: 'gia',
    scenario_overrides: isObj(data.scenario_overrides)
      ? (data.scenario_overrides as Record<string, string>)
      : undefined,
    body,
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Loader API
// ────────────────────────────────────────────────────────────────────────────

export interface LoadResult<T> {
  items: T[]
  errors: string[]
}

async function loadFromDir<T>(
  vault: FileSystemDirectoryHandle,
  subdir: string,
  parse: (filename: string, data: Record<string, unknown>, body: string) => T,
): Promise<LoadResult<T>> {
  const dir = await getOrNullDir(vault, subdir)
  const files = await readMdFiles(dir)
  const items: T[] = []
  const errors: string[] = []
  for (const { filename, content } of files) {
    try {
      const { data, body } = parseFrontmatter(content)
      items.push(parse(filename, data, body))
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }
  return { items, errors }
}

export const loadAssets = (v: FileSystemDirectoryHandle) =>
  loadFromDir<Asset>(v, 'assets', parseAsset)

export const loadScenarios = (v: FileSystemDirectoryHandle) =>
  loadFromDir<Scenario>(v, 'scenarios', parseScenario)

export const loadECMs = (v: FileSystemDirectoryHandle) =>
  loadFromDir<ECM>(v, 'ecms', parseECM)

export const loadPortfolios = (v: FileSystemDirectoryHandle) =>
  loadFromDir<Portfolio>(v, 'portfolios', parsePortfolio)

export interface VaultContents {
  assets: Asset[]
  scenarios: Scenario[]
  ecms: ECM[]
  portfolios: Portfolio[]
  errors: string[]
}

export async function loadVault(vault: FileSystemDirectoryHandle): Promise<VaultContents> {
  const [a, s, e, p] = await Promise.all([
    loadAssets(vault),
    loadScenarios(vault),
    loadECMs(vault),
    loadPortfolios(vault),
  ])
  return {
    assets: a.items,
    scenarios: s.items,
    ecms: e.items,
    portfolios: p.items,
    errors: [...a.errors, ...s.errors, ...e.errors, ...p.errors],
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Write API
// ────────────────────────────────────────────────────────────────────────────

export function assetToMarkdown(a: Asset): string {
  const fm = assetToFrontmatter(a)
  const body = a.body && a.body.trim().length > 0 ? a.body : `\n# ${a.name}\n`
  return buildFrontmatter(fm, body)
}

export function scenarioToMarkdown(s: Scenario): string {
  const fm = scenarioToFrontmatter(s)
  const body = s.body && s.body.trim().length > 0 ? s.body : `\n# ${s.name}\n`
  return buildFrontmatter(fm, body)
}

export function ecmToMarkdown(ecm: ECM): string {
  const fm: Record<string, unknown> = {
    doc_type: 'ecm',
    ecm_schema: '1.0',
    id: ecm.id,
    name: ecm.name,
    category: ecm.category,
  }
  if (ecm.version) fm.version = ecm.version
  if (ecm.license) fm.license = ecm.license
  if (ecm.summary) fm.summary = ecm.summary
  if (ecm.applicability) fm.applicability = ecm.applicability
  fm.impacts = ecm.impacts
  if (ecm.cost) fm.cost = ecm.cost
  if (ecm.payback_years_range) fm.payback_years_range = ecm.payback_years_range
  if (ecm.notes) fm.notes = ecm.notes
  const body = ecm.body && ecm.body.trim().length > 0 ? ecm.body : `\n# ${ecm.name}\n`
  return buildFrontmatter(fm, body)
}

export function portfolioToMarkdown(p: Portfolio): string {
  const fm: Record<string, unknown> = {
    doc_type: 'portfolio',
    portfolio_schema: '1.0',
    id: p.id,
    name: p.name,
    asset_ids: p.asset_ids,
    weighting: p.weighting,
  }
  if (p.scenario_overrides) fm.scenario_overrides = p.scenario_overrides
  const body = p.body && p.body.trim().length > 0 ? p.body : `\n# ${p.name}\n`
  return buildFrontmatter(fm, body)
}

function scenarioToFrontmatter(s: Scenario): Record<string, unknown> {
  const fm: Record<string, unknown> = {
    doc_type: 'scenario',
    scenario_schema: '1.0',
    id: s.id,
    name: s.name,
    asset_id: s.asset_id,
  }
  if (s.parent_scenario_id) fm.parent_scenario_id = s.parent_scenario_id
  fm.retrofits = s.retrofits.map(r => {
    const out: Record<string, unknown> = {
      id: r.id,
      year: r.year,
      name: r.name,
      impacts: r.impacts,
    }
    if (r.ecm_id) out.ecm_id = r.ecm_id
    if (r.cost) out.cost = r.cost
    return out
  })
  return fm
}

export async function writeScenario(
  vault: FileSystemDirectoryHandle,
  scenario: Scenario,
): Promise<void> {
  const dir = await vault.getDirectoryHandle('scenarios', { create: true })
  const fileHandle = await dir.getFileHandle(`${scenario.id}.md`, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(scenarioToMarkdown(scenario))
  await writable.close()
}

export async function writeECM(
  vault: FileSystemDirectoryHandle,
  ecm: ECM,
): Promise<void> {
  const dir = await vault.getDirectoryHandle('ecms', { create: true })
  const fileHandle = await dir.getFileHandle(`${ecm.id}.md`, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(ecmToMarkdown(ecm))
  await writable.close()
}

export async function writePortfolio(
  vault: FileSystemDirectoryHandle,
  portfolio: Portfolio,
): Promise<void> {
  const dir = await vault.getDirectoryHandle('portfolios', { create: true })
  const fileHandle = await dir.getFileHandle(`${portfolio.id}.md`, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(portfolioToMarkdown(portfolio))
  await writable.close()
}

function assetToFrontmatter(a: Asset): Record<string, unknown> {
  const fm: Record<string, unknown> = {
    doc_type: 'asset',
    asset_schema: '1.0',
    id: a.id,
    name: a.name,
    country: a.country,
    property_type: a.property_type,
    gia_m2: a.gia_m2,
    reporting_year: a.reporting_year,
    energy: a.energy,
  }
  if (a.postal_code) fm.postal_code = a.postal_code
  if (a.region) fm.region = a.region
  if (a.mixed_use_split && a.mixed_use_split.length > 0) fm.mixed_use_split = a.mixed_use_split
  if (a.utility_prices) fm.utility_prices = a.utility_prices
  if (a.tags && a.tags.length > 0) fm.tags = a.tags
  return fm
}

export async function writeAsset(
  vault: FileSystemDirectoryHandle,
  asset: Asset,
): Promise<void> {
  const dir = await vault.getDirectoryHandle('assets', { create: true })
  const fileHandle = await dir.getFileHandle(`${asset.id}.md`, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(assetToMarkdown(asset))
  await writable.close()
}

async function softDelete(
  vault: FileSystemDirectoryHandle,
  subdir: string,
  filename: string,
): Promise<void> {
  const sourceDir = await vault.getDirectoryHandle(subdir)
  const trashDir = await vault.getDirectoryHandle('trash', { create: true })
  const trashSubdir = await trashDir.getDirectoryHandle(subdir, { create: true })

  const sourceHandle = await sourceDir.getFileHandle(filename)
  const file = await sourceHandle.getFile()
  const content = await file.text()
  const targetHandle = await trashSubdir.getFileHandle(filename, { create: true })
  const writable = await targetHandle.createWritable()
  await writable.write(content)
  await writable.close()
  await sourceDir.removeEntry(filename)
}

export async function deleteAsset(
  vault: FileSystemDirectoryHandle,
  assetId: string,
): Promise<void> {
  await softDelete(vault, 'assets', `${assetId}.md`)
}

export async function deleteScenario(
  vault: FileSystemDirectoryHandle,
  scenarioId: string,
): Promise<void> {
  // Soft-delete: move to trash/scenarios/<id>.md
  const scenariosDir = await vault.getDirectoryHandle('scenarios')
  const trashDir = await vault.getDirectoryHandle('trash', { create: true })
  const trashScenariosDir = await trashDir.getDirectoryHandle('scenarios', { create: true })

  const sourceHandle = await scenariosDir.getFileHandle(`${scenarioId}.md`)
  const file = await sourceHandle.getFile()
  const content = await file.text()

  const targetHandle = await trashScenariosDir.getFileHandle(`${scenarioId}.md`, { create: true })
  const writable = await targetHandle.createWritable()
  await writable.write(content)
  await writable.close()

  await scenariosDir.removeEntry(`${scenarioId}.md`)
}

// ────────────────────────────────────────────────────────────────────────────
// HTTP-fetched sample vault (read-only demo mode)
// ────────────────────────────────────────────────────────────────────────────

const SAMPLE_FILES = {
  assets: [
    'midtown-tower.md',
    'pacific-plaza-mall.md',
    'northgate-quarter.md',
    'eastfield-logistics-park.md',
  ],
  scenarios: [
    'midtown-do-nothing.md',
    'midtown-led-and-heatpump.md',
    'pacific-plaza-do-nothing.md',
    'northgate-do-nothing.md',
    'eastfield-do-nothing.md',
  ],
  ecms: ['led-lighting-upgrade.md', 'rooftop-pv.md', 'air-source-heat-pump.md'],
  portfolios: ['sample-portfolio.md'],
}

async function fetchSampleEntities<T>(
  basePath: string,
  subdir: keyof typeof SAMPLE_FILES,
  parse: (filename: string, data: Record<string, unknown>, body: string) => T,
): Promise<{ items: T[]; errors: string[] }> {
  const items: T[] = []
  const errors: string[] = []
  for (const filename of SAMPLE_FILES[subdir]) {
    try {
      const url = `${basePath}/${subdir}/${filename}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
      const content = await res.text()
      const { data, body } = parseFrontmatter(content)
      items.push(parse(filename, data, body))
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }
  return { items, errors }
}

export async function loadSampleVault(basePath = '/sample-vault'): Promise<VaultContents> {
  const [a, s, e, p] = await Promise.all([
    fetchSampleEntities(basePath, 'assets', parseAsset),
    fetchSampleEntities(basePath, 'scenarios', parseScenario),
    fetchSampleEntities(basePath, 'ecms', parseECM),
    fetchSampleEntities(basePath, 'portfolios', parsePortfolio),
  ])
  return {
    assets: a.items,
    scenarios: s.items,
    ecms: e.items,
    portfolios: p.items,
    errors: [...a.errors, ...s.errors, ...e.errors, ...p.errors],
  }
}

// ────────────────────────────────────────────────────────────────────────────
// MixedUseSplit helpers
// ────────────────────────────────────────────────────────────────────────────

export function splitForAsset(asset: Asset): MixedUseSplit[] {
  if (asset.mixed_use_split && asset.mixed_use_split.length > 0) {
    return asset.mixed_use_split
  }
  return [{ propertyType: asset.property_type, fraction: 1 }]
}

export function regionForAsset(asset: Asset): string {
  return asset.region ?? asset.country
}
