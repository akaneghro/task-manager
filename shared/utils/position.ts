// Fractional ordering for kanban columns and checklists.

export const POSITION_STEP = 1024
/** Below this gap between neighbours the column should be rebalanced. */
export const MIN_POSITION_GAP = 1e-6

/**
 * Position for an item placed between `before` (above) and `after` (below).
 * Either neighbour may be missing (top / bottom of the list / empty list).
 */
export function positionBetween(before: number | null | undefined, after: number | null | undefined): number {
  const hasBefore = typeof before === 'number' && Number.isFinite(before)
  const hasAfter = typeof after === 'number' && Number.isFinite(after)
  if (hasBefore && hasAfter) return (before + after) / 2
  if (hasBefore) return before + POSITION_STEP
  if (hasAfter) return after - POSITION_STEP
  return POSITION_STEP
}

export function needsRebalance(before: number | null | undefined, after: number | null | undefined): boolean {
  return typeof before === 'number' && typeof after === 'number' && Math.abs(after - before) < MIN_POSITION_GAP
}

/** Evenly spaced positions for `count` items (1024, 2048, ...). */
export function rebalancedPositions(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * POSITION_STEP)
}
