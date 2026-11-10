/** "0:59" for the resend timer. */
export function countdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** What the platform SMS gateways page says for a gateway. */
export function gatewayStatus(g: { configured: boolean; is_enabled?: boolean }): {
  label: string
  tone: 'good' | 'warn' | 'neutral'
} {
  if (!g.configured) return { label: 'Not set up', tone: 'warn' }
  return g.is_enabled ? { label: 'On', tone: 'good' } : { label: 'Off', tone: 'neutral' }
}
