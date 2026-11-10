import type { components } from '../../api/schema'

export type AccessChoices = components['schemas']['AccessChoices']
export type RoleChoice = components['schemas']['RoleChoice']
export type PermissionChoice = components['schemas']['PermissionChoice']

/** The ticks grouped by area, in the order the server lists them. */
export function groupByArea(permissions: readonly PermissionChoice[]) {
  const groups: { area: string; items: PermissionChoice[] }[] = []
  for (const p of permissions) {
    let group = groups.find((g) => g.area === p.area)
    if (!group) {
      group = { area: p.area, items: [] }
      groups.push(group)
    }
    group.items.push(p)
  }
  return groups
}

/** How a person's ticks differ from their role's. */
export function tickChanges(roleDefaults: readonly string[], ticks: readonly string[]) {
  const base = new Set(roleDefaults)
  const mine = new Set(ticks)
  return {
    added: ticks.filter((t) => !base.has(t)),
    removed: roleDefaults.filter((t) => !mine.has(t)),
  }
}

/** One line for the team table: "Same as role", "+1 added, 2 removed". */
export function accessSummary(extra: readonly string[], removed: readonly string[]): string {
  const parts: string[] = []
  if (extra.length) parts.push(`${extra.length} added`)
  if (removed.length) parts.push(`${removed.length} removed`)
  return parts.length ? parts.join(', ') : 'Same as role'
}

/** "All properties", "Koramangala PG", "Koramangala PG + 2 more". */
export function propertiesSummary(
  ids: readonly string[],
  names: ReadonlyMap<string, string>,
): string {
  if (ids.length === 0) return 'All properties'
  const first = names.get(ids[0]!) ?? '1 property'
  return ids.length === 1 ? first : `${first} + ${ids.length - 1} more`
}
