import data from '../src/engine/crrem-data.json' with { type: 'json' }
type P = Record<string, Record<string, { years: number[]; carbon: number[]; eui: number[] }>>
const pathways = data.pathways as P

const ausRegs = Object.keys(pathways).filter(k => /AUS|Australia|NSW|Vic|QLD/i.test(k))
console.log('Australia-flavoured regions:', ausRegs)
for (const r of ausRegs) {
  console.log(' ', r, '→', Object.keys(pathways[r]).slice(0, 5).join(', '))
}
