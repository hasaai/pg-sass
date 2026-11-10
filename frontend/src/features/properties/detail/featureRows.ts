/** Helpers for room features: rows typed in the form <-> API body. */
import { useApi } from '../../../api/hooks'
import type { components } from '../../../api/schema'
import { paiseToRupeesInput, rupeesToPaise } from '../../../lib/format'

export type Choice = components['schemas']['RoomFeatureChoice']
export type Saved = components['schemas']['RoomFeature']

/** One feature as typed in the form: the amount is rupees text. */
export interface FeatureRow {
  amenity: string
  charge: 'included' | 'extra'
  amount: string
}

export function featureRowsFrom(saved: Saved[] | undefined): FeatureRow[] {
  return (saved ?? []).map((f) => ({
    amenity: f.amenity,
    charge: f.charge,
    amount: f.charge_amount ? paiseToRupeesInput(f.charge_amount) : '',
  }))
}

/** API body for the features, or an error message naming the first bad row. */
export function featuresBody(
  rows: FeatureRow[],
  names: Record<string, string>,
):
  | { ok: true; body: { amenity: string; charge: string; charge_amount: number | null }[] }
  | { ok: false; message: string } {
  const body = []
  for (const r of rows) {
    if (r.charge === 'extra') {
      const paise = rupeesToPaise(r.amount)
      if (!paise)
        return {
          ok: false,
          message: `${names[r.amenity] ?? 'Feature'}: enter the extra charge per month, e.g. 500.`,
        }
      body.push({ amenity: r.amenity, charge: 'extra', charge_amount: paise })
    } else body.push({ amenity: r.amenity, charge: 'included', charge_amount: null })
  }
  return { ok: true, body }
}

export function useFeatureChoices() {
  return useApi<Choice[]>('/rooms/feature-choices/')
}
