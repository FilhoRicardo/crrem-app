import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'

const __filename = fileURLToPath(import.meta.url)
const ROOT = dirname(dirname(__filename))
const REF = join(ROOT, 'references')

function dump(file: string, sheetName: string, startRow: number, nRows: number, nCols: number) {
  const wb = XLSX.read(readFileSync(join(REF, file)), { type: 'buffer' })
  const sheet = wb.Sheets[sheetName]
  if (!sheet) { console.log(`No sheet "${sheetName}"`); return }
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true })
  console.log(`\n=== ${file} :: ${sheetName} (${rows.length} total rows; showing ${startRow}-${startRow + nRows - 1}) ===`)
  for (let r = startRow; r < Math.min(startRow + nRows, rows.length); r++) {
    const row = (rows[r] ?? []).slice(0, nCols)
    console.log(`r${r}:`, JSON.stringify(row))
  }
}

// Check geographic spread + last data rows
dump('pathways-v2.05.xlsx', 'CO2 Pathways (sqm)', 200, 5, 8)
dump('pathways-v2.05.xlsx', 'CO2 Pathways (sqm)', 700, 5, 8)
dump('pathways-v2.05.xlsx', 'CO2 Pathways (sqm)', 1100, 5, 8)
dump('pathways-v2.05.xlsx', 'CO2 Pathways (sqm)', 1490, 12, 8)

// And the EF sheet — find where grid EF table ends + static EFs begin
dump('emission-factors-v2.05.xlsx', 'Emission Factors', 50, 35, 12)
