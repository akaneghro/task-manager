// Cycle detection for "blocks" dependencies between tasks.

export interface BlockEdge {
  /** Blocking task. */
  from: string
  /** Blocked task. */
  to: string
}

/**
 * Returns true when adding `from -> to` (from blocks to) would create a cycle,
 * i.e. when `to` already (transitively) blocks `from`, or when from === to.
 */
export function wouldCreateCycle(edges: readonly BlockEdge[], from: string, to: string): boolean {
  if (from === to) return true
  const adjacency = new Map<string, string[]>()
  for (const edge of edges) {
    const list = adjacency.get(edge.from)
    if (list) list.push(edge.to)
    else adjacency.set(edge.from, [edge.to])
  }
  // DFS from `to` following "blocks" edges; reaching `from` means a cycle.
  const stack = [to]
  const seen = new Set<string>()
  while (stack.length > 0) {
    const current = stack.pop()
    if (current === undefined || seen.has(current)) continue
    if (current === from) return true
    seen.add(current)
    for (const next of adjacency.get(current) ?? []) {
      if (!seen.has(next)) stack.push(next)
    }
  }
  return false
}
