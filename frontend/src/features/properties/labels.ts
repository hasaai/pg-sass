/** Plain words for codes the API returns (the API also sends *_label; these cover forms). */
export const PROPERTY_STATUS_TONE = {
  draft: 'warn',
  active: 'good',
  inactive: 'neutral',
  archived: 'neutral',
} as const

export const VERIFICATION_TONE = {
  unverified: 'neutral',
  submitted: 'info',
  verified: 'good',
  changes_requested: 'warn',
  rejected: 'bad',
} as const

export const BED_STATUS_TONE = {
  vacant: 'good',
  reserved: 'warn',
  occupied: 'info',
  blocked: 'neutral',
} as const

export const GENDER_OPTIONS = [
  { value: 'men', label: 'Men only' },
  { value: 'women', label: 'Women only' },
  { value: 'coed', label: 'Anyone (co-ed)' },
] as const

export const ROOM_TYPE_OPTIONS = [
  { value: 'private', label: 'Private room' },
  { value: 'shared', label: 'Shared room' },
  { value: 'dormitory', label: 'Dormitory' },
] as const

export const UNIT_TYPE_OPTIONS = [
  { value: '1rk', label: '1 RK' },
  { value: '1bhk', label: '1 BHK' },
  { value: '2bhk', label: '2 BHK' },
  { value: '3bhk', label: '3 BHK' },
  { value: '4bhk', label: '4 BHK or more' },
  { value: 'studio', label: 'Studio' },
  { value: 'portion', label: 'Portion of a house' },
  { value: 'whole_house', label: 'Whole house' },
  { value: 'other', label: 'Other' },
] as const

export const FURNISHING_OPTIONS = [
  { value: '', label: 'Not specified' },
  { value: 'unfurnished', label: 'Unfurnished' },
  { value: 'semi', label: 'Semi-furnished' },
  { value: 'fully', label: 'Fully furnished' },
] as const

export const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Open' },
  { value: 'draft', label: 'Not finished' },
  { value: 'inactive', label: 'Closed' },
  { value: 'archived', label: 'Removed' },
] as const

export const SORT_OPTIONS = [
  { value: 'name', label: 'Name (A–Z)' },
  { value: '-name', label: 'Name (Z–A)' },
  { value: '-updated_at', label: 'Recently updated' },
  { value: '-created_at', label: 'Newest first' },
  { value: 'locality', label: 'Locality' },
] as const

export function floorName(n: number): string {
  if (n === 0) return 'Ground floor'
  if (n < 0) return `Basement ${-n}`
  const mod100 = n % 100
  const suffix =
    mod100 >= 10 && mod100 <= 20 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th')
  return `${n}${suffix} floor`
}

export const MAX_PROPERTY_PHOTOS = 20

/** Kinds of private property documents (same words as the API's kind_label). */
export const DOCUMENT_KINDS = [
  { value: 'ownership_proof', label: 'Ownership proof (sale deed, khata)', proof: true },
  { value: 'rental_agreement', label: 'Rental or lease agreement with the owner', proof: true },
  { value: 'management_authorization', label: 'Letter allowing you to manage it', proof: true },
  { value: 'property_tax', label: 'Property tax receipt', proof: false },
  { value: 'trade_license', label: 'Trade licence', proof: false },
  { value: 'fire_noc', label: 'Fire safety NOC', proof: false },
  { value: 'building_approval', label: 'Building plan / occupancy certificate', proof: false },
  { value: 'electricity_bill', label: 'Electricity bill', proof: false },
  { value: 'water_bill', label: 'Water bill', proof: false },
  { value: 'insurance', label: 'Insurance', proof: false },
  { value: 'other', label: 'Other', proof: false },
] as const

export const EXPIRY_TONE = {
  expired: 'bad',
  expiring: 'warn',
  valid: 'good',
  no_expiry: 'neutral',
} as const

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
