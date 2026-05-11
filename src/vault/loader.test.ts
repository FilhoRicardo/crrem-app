import { describe, test, expect } from 'vitest'
import {
  parseFrontmatter, buildFrontmatter,
  assetToMarkdown, scenarioToMarkdown, ecmToMarkdown, portfolioToMarkdown,
  importAssetFile, importScenarioFile, importECMFile, importPortfolioFile,
  regionForAsset,
} from './loader'
import type { Asset, Scenario, ECM, Portfolio } from '../engine/types'

// ────────────────────────────────────────────────────────────────────────────
// parseFrontmatter — the foundation everyone else stands on
// ────────────────────────────────────────────────────────────────────────────

describe('parseFrontmatter', () => {
  test('parses a basic frontmatter block', () => {
    const input = `---\nid: foo\nname: Foo Bar\n---\n# heading\n\nbody text`
    const { data, body } = parseFrontmatter(input)
    expect(data).toEqual({ id: 'foo', name: 'Foo Bar' })
    expect(body).toContain('# heading')
    expect(body).toContain('body text')
  })

  test('returns whole content as body when no frontmatter delimiters', () => {
    const input = `# just a heading\n\nplain markdown`
    const { data, body } = parseFrontmatter(input)
    expect(data).toEqual({})
    expect(body).toBe(input)
  })

  test('handles CRLF line endings', () => {
    const input = `---\r\nid: x\r\nname: X\r\n---\r\nbody`
    const { data, body } = parseFrontmatter(input)
    expect(data).toEqual({ id: 'x', name: 'X' })
    expect(body).toBe('body')
  })

  test('handles nested objects + arrays in frontmatter', () => {
    const input = `---\nimpacts:\n  - carrier: Elec_Grid\n    operation: reduce\n    value: 18\nnested:\n  a: 1\n  b: 2\n---\n`
    const { data } = parseFrontmatter(input)
    expect(data).toEqual({
      impacts: [{ carrier: 'Elec_Grid', operation: 'reduce', value: 18 }],
      nested: { a: 1, b: 2 },
    })
  })
})

// ────────────────────────────────────────────────────────────────────────────
// buildFrontmatter — round-trip with parseFrontmatter
// ────────────────────────────────────────────────────────────────────────────

describe('buildFrontmatter', () => {
  test('round-trips simple key/value pairs', () => {
    const md = buildFrontmatter({ id: 'a', name: 'Alpha', n: 42 }, 'body')
    const { data, body } = parseFrontmatter(md)
    expect(data).toEqual({ id: 'a', name: 'Alpha', n: 42 })
    expect(body.trim()).toBe('body')
  })

  test('round-trips arrays + nested objects', () => {
    const original = {
      arr: [1, 2, 3],
      tags: ['x', 'y'],
      nested: { a: 1, b: { c: 2 } },
    }
    const md = buildFrontmatter(original, '')
    const { data } = parseFrontmatter(md)
    expect(data).toEqual(original)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Asset round-trip
// ────────────────────────────────────────────────────────────────────────────

describe('Asset round-trip (assetToMarkdown → importAssetFile)', () => {
  const fullAsset: Asset = {
    id: 'midtown',
    name: 'Midtown Tower',
    country: 'USA',
    postal_code: '10005',
    property_type: 'Office',
    gia_m2: 7500,
    reporting_year: 2024,
    energy: {
      Elec_Grid: 850000,
      District_Heating: 680000,
    },
    utility_prices: {
      Elec_Grid: 0.18,
      District_Heating: 0.06,
      currency: 'USD',
      escalation_pct_per_year: 2.5,
    },
    actuals: [
      {
        year: 2024,
        monthly: {
          Elec_Grid: [70000, 65000, 72000, 68000, 75000, 80000, 82000, 81000, 75000, 70000, 65000, 70000],
        },
        notes: 'first full year',
      },
      {
        year: 2025,
        annual: { Elec_Grid: 870000 },
      },
    ],
    renewable_degradation_pct_per_year: 0.5,
    tags: ['sample', 'office'],
    body: '\n# Midtown Tower\n\nNotes here.\n',
  }

  test('full asset survives the round trip exactly', async () => {
    const md = assetToMarkdown(fullAsset)
    const file = new File([md], 'midtown.md', { type: 'text/markdown' })
    const parsed = await importAssetFile(file)

    expect(parsed.id).toBe(fullAsset.id)
    expect(parsed.name).toBe(fullAsset.name)
    expect(parsed.country).toBe(fullAsset.country)
    expect(parsed.postal_code).toBe(fullAsset.postal_code)
    expect(parsed.property_type).toBe(fullAsset.property_type)
    expect(parsed.gia_m2).toBe(fullAsset.gia_m2)
    expect(parsed.reporting_year).toBe(fullAsset.reporting_year)
    expect(parsed.energy).toEqual(fullAsset.energy)
    expect(parsed.utility_prices).toEqual(fullAsset.utility_prices)
    expect(parsed.tags).toEqual(fullAsset.tags)
    expect(parsed.renewable_degradation_pct_per_year).toBe(0.5)

    expect(parsed.actuals).toHaveLength(2)
    expect(parsed.actuals![0].year).toBe(2024)
    expect(parsed.actuals![0].monthly?.Elec_Grid).toEqual(fullAsset.actuals![0].monthly!.Elec_Grid)
    expect(parsed.actuals![0].notes).toBe('first full year')
    expect(parsed.actuals![1].year).toBe(2025)
    expect(parsed.actuals![1].annual).toEqual({ Elec_Grid: 870000 })

    expect(parsed.body?.trim()).toContain('# Midtown Tower')
  })

  test('minimal asset (no optional fields) round-trips', async () => {
    const minimal: Asset = {
      id: 'min',
      name: 'Minimal',
      country: 'Germany',
      property_type: 'Office',
      gia_m2: 1000,
      reporting_year: 2024,
      energy: { Elec_Grid: 100000 },
    }
    const md = assetToMarkdown(minimal)
    const file = new File([md], 'min.md')
    const parsed = await importAssetFile(file)
    expect(parsed.id).toBe('min')
    expect(parsed.energy).toEqual({ Elec_Grid: 100000 })
    expect(parsed.actuals).toBeUndefined()
    expect(parsed.utility_prices).toBeUndefined()
    expect(parsed.tags).toBeUndefined()
  })

  test('mixed-use split survives round-trip with both fractions intact', async () => {
    const mixed: Asset = {
      id: 'mu',
      name: 'Mixed Use',
      country: 'United Kingdom',
      property_type: 'Mixed Use',
      gia_m2: 12000,
      reporting_year: 2024,
      energy: { Elec_Grid: 1100000 },
      mixed_use_split: [
        { propertyType: 'Office', fraction: 0.65 },
        { propertyType: 'Retail High Street', fraction: 0.35 },
      ],
    }
    const md = assetToMarkdown(mixed)
    const file = new File([md], 'mu.md')
    const parsed = await importAssetFile(file)
    expect(parsed.mixed_use_split).toEqual(mixed.mixed_use_split)
  })

  test('rejects invalid asset (negative GIA)', async () => {
    const md = `---\nid: bad\nname: Bad\ncountry: USA\nproperty_type: Office\ngia_m2: -100\nreporting_year: 2024\nenergy: {}\n---\n`
    const file = new File([md], 'bad.md')
    await expect(importAssetFile(file)).rejects.toThrow(/gia_m2/)
  })

  test('rejects asset missing a required field', async () => {
    const md = `---\nid: bad\ncountry: USA\nproperty_type: Office\ngia_m2: 100\nreporting_year: 2024\nenergy: {}\n---\n`
    const file = new File([md], 'bad.md')
    await expect(importAssetFile(file)).rejects.toThrow(/name/)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Scenario / ECM / Portfolio round-trips
// ────────────────────────────────────────────────────────────────────────────

describe('Scenario round-trip', () => {
  test('multi-retrofit scenario survives round-trip', async () => {
    const sc: Scenario = {
      id: 'led-and-hp',
      name: 'LED + Heat Pump',
      asset_id: 'midtown',
      parent_scenario_id: 'do-nothing',
      retrofits: [
        {
          id: 'r-led',
          year: 2026,
          name: 'LED retrofit',
          ecm_id: 'led-lighting-upgrade',
          impacts: [{ carrier: 'Elec_Grid', operation: 'reduce', mode: 'percent', value: 18 }],
          cost: { capex_total: 450000, currency: 'USD' },
        },
        {
          id: 'r-hp',
          year: 2028,
          name: 'Heat pump',
          impacts: [
            { carrier: 'District_Heating', operation: 'remove', mode: 'absolute', value: 0 },
            { carrier: 'Elec_Grid', operation: 'add', mode: 'absolute', value: 200000 },
          ],
        },
      ],
    }
    const md = scenarioToMarkdown(sc)
    const parsed = await importScenarioFile(new File([md], 'sc.md'))
    expect(parsed.id).toBe(sc.id)
    expect(parsed.parent_scenario_id).toBe(sc.parent_scenario_id)
    expect(parsed.retrofits).toHaveLength(2)
    expect(parsed.retrofits[0].ecm_id).toBe('led-lighting-upgrade')
    expect(parsed.retrofits[0].cost?.capex_total).toBe(450000)
    expect(parsed.retrofits[1].impacts).toHaveLength(2)
  })
})

describe('ECM round-trip', () => {
  test('multi-impact ECM with low/typical/high survives round-trip', async () => {
    const ecm: ECM = {
      id: 'pv',
      name: 'Rooftop PV',
      category: 'Renewables',
      version: '1.0',
      license: 'CC-BY-4.0',
      summary: 'On-site solar.',
      impacts: [
        { carrier: 'Renew_Consumed', operation: 'add', mode: 'absolute', value_low: 30, value_typical: 60, value_high: 100 },
        { carrier: 'Renew_Exported', operation: 'add', mode: 'absolute', value_typical: 15 },
      ],
      payback_years_range: [8, 15],
    }
    const md = ecmToMarkdown(ecm)
    const parsed = await importECMFile(new File([md], 'ecm.md'))
    expect(parsed.impacts[0].value_low).toBe(30)
    expect(parsed.impacts[0].value_typical).toBe(60)
    expect(parsed.impacts[0].value_high).toBe(100)
    expect(parsed.payback_years_range).toEqual([8, 15])
  })
})

describe('Portfolio round-trip', () => {
  test('preserves asset_ids order + scenario_overrides', async () => {
    const p: Portfolio = {
      id: 'core',
      name: 'Core Portfolio',
      asset_ids: ['midtown', 'pacific-plaza', 'northgate'],
      weighting: 'gia',
      scenario_overrides: { midtown: 'led-and-hp', northgate: 'do-nothing' },
    }
    const md = portfolioToMarkdown(p)
    const parsed = await importPortfolioFile(new File([md], 'p.md'))
    expect(parsed.asset_ids).toEqual(p.asset_ids)
    expect(parsed.scenario_overrides).toEqual(p.scenario_overrides)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// regionForAsset — postal-code resolution + override priority
// ────────────────────────────────────────────────────────────────────────────

describe('regionForAsset', () => {
  test('explicit region wins over postal lookup', () => {
    const a = { country: 'USA', postal_code: '10005', region: 'CUSTOM_REGION' } as Asset
    expect(regionForAsset(a)).toBe('CUSTOM_REGION')
  })

  test('postal code resolves to CRREM sub-national region (USA)', () => {
    const a = { country: 'USA', postal_code: '10005' } as Asset
    expect(regionForAsset(a)).toBe('NYSTc_Mixed mild_4A')
  })

  test('postal code resolves to CRREM sub-national region (Australia)', () => {
    const a = { country: 'Australia', postal_code: '2170' } as Asset
    expect(regionForAsset(a)).toBe('AUS6')
  })

  test('canonicalises country aliases (UK → United Kingdom)', () => {
    const a = { country: 'UK' } as Asset
    expect(regionForAsset(a)).toBe('United Kingdom')
  })

  test('falls back to canonical country when no postal match', () => {
    const a = { country: 'Germany', postal_code: 'XYZ' } as Asset
    expect(regionForAsset(a)).toBe('Germany')
  })
})
