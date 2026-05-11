/**
 * Investment-finance helpers used alongside the cost engine.
 *
 * Conventions:
 * - Cashflows are an array indexed by **year offset**: index 0 = today (t=0),
 *   index n = end of year n. Negative values are outflows (capex/expense).
 * - Discount + IRR rates are in **percent** (e.g. 8 = 8%/yr) for UI consistency.
 *
 * Pure functions, no side effects, no dependencies. Used by cost.ts and
 * surfaced in CostSummaryCard alongside payback period.
 */

/**
 * Net Present Value at a given annual discount rate (%).
 *
 * NPV = Σ CF_t / (1 + r)^t  for t = 0..n
 *
 * Index 0 is treated as t=0 (no discount). To represent an upfront capex,
 * pass it as cashflows[0] (negative). Year-1 savings go in cashflows[1], etc.
 */
export function computeNPV(cashflows: number[], discountPct: number): number {
  const r = discountPct / 100
  let npv = 0
  for (let t = 0; t < cashflows.length; t++) {
    npv += cashflows[t] / Math.pow(1 + r, t)
  }
  return npv
}

/**
 * Internal Rate of Return — the discount rate at which NPV = 0.
 *
 * Returns null when the cashflow stream has no sign change (NPV is monotonic →
 * no root exists), or when the bisection fails to converge in a sensible range.
 *
 * Implementation: bisection over [-99%, 1000%]. Robust at the cost of being
 * slower than Newton-Raphson, but cashflow streams here are small (≤30 yrs)
 * so it's still <1 ms.
 */
export function computeIRR(cashflows: number[]): number | null {
  // Need both positive and negative entries — otherwise no root.
  let hasPos = false, hasNeg = false
  for (const cf of cashflows) {
    if (cf > 0) hasPos = true
    if (cf < 0) hasNeg = true
  }
  if (!hasPos || !hasNeg) return null

  let lo = -99 // %
  let hi = 1000 // %
  let npvLo = computeNPV(cashflows, lo)
  let npvHi = computeNPV(cashflows, hi)
  // If both ends have the same sign there's no root in this bracket.
  if (Math.sign(npvLo) === Math.sign(npvHi)) return null

  // Bisect to convergence
  for (let iter = 0; iter < 200; iter++) {
    const mid = (lo + hi) / 2
    const npvMid = computeNPV(cashflows, mid)
    if (Math.abs(npvMid) < 1e-7 || (hi - lo) < 1e-6) return mid
    if (Math.sign(npvMid) === Math.sign(npvLo)) {
      lo = mid; npvLo = npvMid
    } else {
      hi = mid; npvHi = npvMid
    }
  }
  return (lo + hi) / 2
}

/**
 * Simple (undiscounted) payback period.
 *
 * Returns the year (with linear interpolation across the year of recovery)
 * in which cumulative annual savings first equal capex. Returns null when
 * cumulative savings never reach capex within the supplied stream.
 *
 * `annualSavings[i]` is savings in year i+1 (year 0 is the install year).
 */
export function computePaybackYears(capex: number, annualSavings: number[]): number | null {
  if (capex <= 0) return null
  let cum = 0
  for (let i = 0; i < annualSavings.length; i++) {
    const next = cum + annualSavings[i]
    if (next >= capex) {
      const remaining = capex - cum
      const fraction = annualSavings[i] > 0 ? remaining / annualSavings[i] : 0
      return i + fraction
    }
    cum = next
  }
  return null
}

/**
 * Build a cashflow stream for a single retrofit:
 *   - year 0: capex outflow
 *   - years 1..horizon: annualSavings escalated at `escalationPctPerYear`
 *
 * Used by both NPV and IRR + the discounted-payback variant.
 */
export function buildCashflows(
  capex: number,
  annualSavings: number,
  horizonYears: number,
  escalationPctPerYear = 0,
): number[] {
  const out: number[] = [-capex]
  for (let t = 1; t <= horizonYears; t++) {
    const escalated = annualSavings * Math.pow(1 + escalationPctPerYear / 100, t - 1)
    out.push(escalated)
  }
  return out
}
