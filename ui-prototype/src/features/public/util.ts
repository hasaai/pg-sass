/** Helpers for the sign-in and sign-up screens. */
import { useEffect, useState } from 'react'

/** Seconds left before "Resend code" is allowed again. */
export function useCountdown(start: number) {
  const [left, setLeft] = useState(start)
  useEffect(() => {
    if (left <= 0) return
    const t = window.setTimeout(() => setLeft((v) => v - 1), 1000)
    return () => window.clearTimeout(t)
  }, [left])
  return { left, restart: () => setLeft(start) }
}

/** "98450 12345" → "98xxxxx345" */
export function maskMobile(mobile: string) {
  const d = mobile.replace(/\D/g, '').slice(-10)
  if (d.length < 10) return mobile
  return `${d.slice(0, 2)}xxxxx${d.slice(7)}`
}

/** Indian mobile: 10 digits starting 6–9. Returns an error or ''. */
export function mobileError(mobile: string) {
  const d = mobile.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '')
  if (!d) return 'Enter your mobile number'
  if (!/^[6-9]\d{9}$/.test(d)) return 'Enter a 10-digit Indian mobile number, like 98450 12345'
  return ''
}
