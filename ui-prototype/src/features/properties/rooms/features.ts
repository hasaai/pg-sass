import { ROOM_FEATURES } from '../../../data/seed'
import type { Room } from '../../../data/types'
import { paiseToRupeesInput, rupeesToPaise } from '../../../lib/format'

/** key → extra charge typed in rupees ('' = included in rent). */
export type FeatureState = Record<string, string>

export function featuresToState(list: Room['features']): FeatureState {
  return Object.fromEntries(list.map((f) => [f.key, f.extra ? paiseToRupeesInput(f.extra) : '']))
}

export function stateToFeatures(s: FeatureState): Room['features'] | string {
  const out: Room['features'] = []
  for (const f of ROOM_FEATURES) {
    if (!(f.key in s)) continue
    const raw = s[f.key]!.trim()
    if (raw) {
      const p = rupeesToPaise(raw)
      if (p === null) return `Extra charge for ${f.name} must be an amount in rupees, e.g. 300.`
      out.push({ key: f.key, name: f.name, extra: p || undefined })
    } else out.push({ key: f.key, name: f.name })
  }
  return out
}
