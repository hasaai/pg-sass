/** Where a signed-in user lands when nothing asked for a specific page. */
export function homeFor(hasMembership: boolean, isPlatformAdmin = false): string {
  if (isPlatformAdmin && !hasMembership) return '/platform'
  return '/app'
}

/** Only same-site paths, so a crafted link cannot send people elsewhere after login. */
export function safeReturnPath(from: unknown): string | null {
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : null
}
