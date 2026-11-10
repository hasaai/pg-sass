/** Business modules the platform team can switch off (mirrors backend core/features.py). */
const PATH_FEATURES: [string, string][] = [
  ['/app/billing/reminders', 'reminders'],
  ['/app/finance', 'finance'],
  ['/app/staff', 'staff'],
  ['/app/complaints', 'complaints'],
  ['/app/notices', 'notices'],
  ['/app/listings', 'marketplace'],
  ['/app/applications', 'marketplace'],
  ['/app/enquiries', 'marketplace'],
]

export function featureOfPath(pathname: string): string | null {
  return PATH_FEATURES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? null
}

export function isFeatureOn(feature: string, disabled: readonly string[]): boolean {
  return !disabled.includes(feature)
}
