/**
 * Opens the payment window of the chosen gateway. The gateway's own script is loaded only
 * when the owner presses Pay (no npm package; Razorpay and Cashfree publish these scripts).
 * The server checks every payment before the plan changes; nothing here is trusted.
 */

const SCRIPTS = {
  razorpay: 'https://checkout.razorpay.com/v1/checkout.js',
  cashfree: 'https://sdk.cashfree.com/js/v3/cashfree.js',
} as const

const loading = new Map<string, Promise<void>>()

export function loadScript(src: string): Promise<void> {
  const known = loading.get(src)
  if (known) return known
  const promise = new Promise<void>((resolve, reject) => {
    const tag = document.createElement('script')
    tag.src = src
    tag.async = true
    tag.onload = () => resolve()
    tag.onerror = () => {
      loading.delete(src)
      reject(new Error('Could not open the payment window. Check your internet and try again.'))
    }
    document.head.appendChild(tag)
  })
  loading.set(src, promise)
  return promise
}

type Checkout = Record<string, unknown>

interface RazorpayResult {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

interface RazorpayWindow {
  open(): void
  on(event: string, handler: (response: { error?: { description?: string } }) => void): void
}

type RazorpayCtor = new (options: Record<string, unknown>) => RazorpayWindow
type CashfreeFactory = (options: { mode: string }) => {
  checkout(options: { paymentSessionId: string; redirectTarget: string }): Promise<unknown>
}

export type PayOutcome =
  | { kind: 'paid'; result: Record<string, unknown> }
  | { kind: 'closed' }
  | { kind: 'failed'; message: string }
  | { kind: 'redirecting' }

/** Razorpay: a pop-up on this page; resolves when the owner pays or closes it. */
export async function payWithRazorpay(checkout: Checkout): Promise<PayOutcome> {
  await loadScript(SCRIPTS.razorpay)
  const Razorpay = (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay
  if (!Razorpay) return { kind: 'failed', message: 'The Razorpay window did not load.' }
  return new Promise<PayOutcome>((resolve) => {
    const rzp = new Razorpay({
      key: checkout.key_id,
      order_id: checkout.order_id,
      amount: checkout.amount,
      currency: checkout.currency,
      name: checkout.name,
      description: checkout.description,
      prefill: checkout.prefill,
      theme: { color: '#2563eb' },
      handler: (result: RazorpayResult) => resolve({ kind: 'paid', result: { ...result } }),
      modal: { ondismiss: () => resolve({ kind: 'closed' }) },
    })
    rzp.on('payment.failed', (r) =>
      resolve({
        kind: 'failed',
        message: r.error?.description || 'The payment did not go through.',
      }),
    )
    rzp.open()
  })
}

/** Cashfree: moves to Cashfree's page, which sends the owner back to /app/plan?payment=<id>. */
export async function payWithCashfree(checkout: Checkout): Promise<PayOutcome> {
  await loadScript(SCRIPTS.cashfree)
  const Cashfree = (window as unknown as { Cashfree?: CashfreeFactory }).Cashfree
  if (!Cashfree) return { kind: 'failed', message: 'The Cashfree window did not load.' }
  await Cashfree({ mode: String(checkout.mode) }).checkout({
    paymentSessionId: String(checkout.payment_session_id),
    redirectTarget: '_self',
  })
  return { kind: 'redirecting' }
}

export function openPaymentWindow(gateway: string, checkout: Checkout): Promise<PayOutcome> {
  if (gateway === 'razorpay') return payWithRazorpay(checkout)
  if (gateway === 'cashfree') return payWithCashfree(checkout)
  return Promise.resolve({ kind: 'failed', message: 'This payment method is not available.' })
}
