import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'

const __filename = fileURLToPath(import.meta.url)
const ROOT = dirname(dirname(__filename))
const REF = join(ROOT, 'references')

const wb = XLSX.read(readFileSync(join(REF, 'hdd-cdd-eu-v2.05.xlsx')), { type: 'buffer' })
const sheet = wb.Sheets['HDD CDD Zip Code Matching 2024']
const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true })

// Find UK rows + check if there's an aggregate (null ZIP) row anywhere
let firstUk = -1, ukAggregate = -1
for (let r = 1; r < rows.length; r++) {
  const country = rows[r]?.[1]
  if (country === 'United Kingdom') {
    if (firstUk < 0) firstUk = r
    if (rows[r]?.[0] === null && ukAggregate < 0) ukAggregate = r
  }
}
console.log('First UK row:', firstUk)
console.log('UK aggregate row (null ZIP):', ukAggregate)
if (firstUk >= 0) {
  console.log('Row at firstUk:', JSON.stringify(rows[firstUk]?.slice(0, 13)))
}
console.log()

// Check all aggregate rows
const aggregates = []
for (let r = 1; r < rows.length; r++) {
  if (rows[r]?.[0] === null && rows[r]?.[1]) aggregates.push(rows[r]?.[1])
}
console.log(`${aggregates.length} aggregate rows total:`, aggregates)
