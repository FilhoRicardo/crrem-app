import data from '../src/engine/crrem-data.json' with { type: 'json' }
const climate = (data as { climate?: Record<string, unknown> }).climate ?? {}
console.log('Climate countries:')
console.log(Object.keys(climate).sort().map(s => JSON.stringify(s)).join(', '))
