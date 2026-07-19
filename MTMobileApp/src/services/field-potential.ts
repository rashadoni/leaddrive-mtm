/**
 * Aggregates the per-brand MtmFieldPotential rows returned inside the
 * organization/contact detail payloads into a single potential-vs-coverage
 * summary (SWM-04). The rows carry no brand names (only external ids), so a
 * readable card shows the summed potential, the summed coverage and the
 * coverage percentage rather than an unlabeled per-brand list.
 *
 * potentialValue / coverageValue arrive as Prisma Decimal — serialized as
 * strings over JSON — so they are coerced with Number().
 */

export interface PotentialSummary {
  potentialValue: number
  coverageValue: number
  coveragePct: number
  count: number
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

export function summarizePotential(rows: unknown): PotentialSummary | null {
  if (!Array.isArray(rows) || rows.length === 0) return null
  let potentialValue = 0
  let coverageValue = 0
  for (const row of rows) {
    const r = row as { potentialValue?: unknown; coverageValue?: unknown }
    potentialValue += num(r?.potentialValue)
    coverageValue += num(r?.coverageValue)
  }
  const coveragePct = potentialValue > 0
    ? Math.round((coverageValue / potentialValue) * 1000) / 10
    : 0
  return {
    potentialValue: Math.round(potentialValue * 100) / 100,
    coverageValue: Math.round(coverageValue * 100) / 100,
    coveragePct,
    count: rows.length,
  }
}
