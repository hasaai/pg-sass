/** Pure helpers for the public marketplace (kept apart from components for fast refresh and tests). */
import { rupeesToPaise, titleCase } from './format'

export const BOUNDS = ['min_lat', 'max_lat', 'min_lng', 'max_lng'] as const

export function genderLabel(gender: string): string {
  return gender === 'coed' ? 'Anyone' : titleCase(gender)
}

/** Turn the page's URL parameters into the API's query. Exported for tests. */
export function searchQuery(params: URLSearchParams) {
  const budget = params.get('budget')
  const hasBounds = BOUNDS.every((b) => params.get(b))
  return {
    locality: params.get('locality'),
    gender: params.get('gender'),
    sharing: params.get('sharing'),
    q: params.get('q'),
    max_rent: budget ? rupeesToPaise(budget) : null,
    food: params.get('food') === '1' ? true : null,
    available: params.get('available') === '1' ? true : null,
    amenities: params.get('amenities'),
    ...(hasBounds ? Object.fromEntries(BOUNDS.map((b) => [b, params.get(b)])) : {}),
    page_size: 50,
  }
}
