/**
 * Permission codes from backend/core/access.py (the only real list; the server checks
 * every request). This type only stops typos in `can('…')`.
 */
export type Permission =
  | 'dashboard.view'
  | 'properties.view'
  | 'properties.manage'
  | 'properties.documents'
  | 'tenants.view'
  | 'tenants.manage'
  | 'tenants.id_documents'
  | 'rent.view'
  | 'rent.collect'
  | 'rent.adjust'
  | 'expenses.view'
  | 'expenses.manage'
  | 'salaries.manage'
  | 'reports.download'
  | 'complaints.manage'
  | 'complaints.delete'
  | 'notices.manage'
  | 'listings.manage'
  | 'team.view'
  | 'team.manage'
  | 'business.settings'
  | 'plan.view'
  | 'plan.billing'
  | 'activity.view'
  | 'owner.verification'

/** What one person may do: an owner always everything, others their list from /auth/me. */
export function makeCan(
  membership: { role: string; permissions?: readonly string[] } | null,
): (perm: Permission) => boolean {
  if (!membership) return () => false
  if (membership.role === 'owner') return () => true
  const granted = new Set(membership.permissions ?? [])
  return (perm) => granted.has(perm)
}

/** PG Manager team permission codes from backend/apps/platform/access.py. */
export type PlatformPermission =
  | 'p.overview.view'
  | 'p.businesses.view'
  | 'p.businesses.suspend'
  | 'p.businesses.features'
  | 'p.business_data.view'
  | 'p.business_data.edit'
  | 'p.plans.manage'
  | 'p.subscriptions.assign'
  | 'p.payments.view'
  | 'p.gateways.manage'
  | 'p.verification.review'
  | 'p.documents.download'
  | 'p.users.view'
  | 'p.users.help'
  | 'p.users.deactivate'
  | 'p.activity.view'
  | 'p.catalog.manage'
  | 'p.sms.manage'
  | 'p.staff.manage'

export function makePlatformCan(
  user: { platform_permissions?: readonly string[] } | null,
): (perm: PlatformPermission | readonly PlatformPermission[]) => boolean {
  const granted = new Set(user?.platform_permissions ?? [])
  return (perm) => (typeof perm === 'string' ? granted.has(perm) : perm.some((p) => granted.has(p)))
}
