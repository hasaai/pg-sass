/**
 * The tenant app's own small state (language, notification choices, which notices were read).
 * Tenant data itself (bills, complaints, notice to move out) lives in data/store.ts.
 */
import { useSyncExternalStore } from 'react'

export type Lang = 'en' | 'kn' | 'hi'

export interface TenantPrefs {
  lang: Lang
  notify: { rent: boolean; notices: boolean; complaints: boolean; whatsapp: boolean }
  readNotices: string[]
}

let state: TenantPrefs = {
  lang: 'en',
  notify: { rent: true, notices: true, complaints: true, whatsapp: true },
  readNotices: ['n3'],
}
const listeners = new Set<() => void>()

export function usePrefs<T>(select: (p: TenantPrefs) => T): T {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => select(state),
  )
}

export function updatePrefs(change: (draft: TenantPrefs) => void) {
  const draft = structuredClone(state)
  change(draft)
  state = draft
  listeners.forEach((fn) => fn())
}

/** A few words on the main screens in the tenant's language. */
const WORDS = {
  morning: { en: 'Good morning', kn: 'ಶುಭೋದಯ', hi: 'सुप्रभात' },
  rentThisMonth: { en: 'Rent this month', kn: 'ಈ ತಿಂಗಳ ಬಾಡಿಗೆ', hi: 'इस महीने का किराया' },
  payBy: { en: 'by UPI', kn: 'UPI ಮೂಲಕ', hi: 'UPI से' },
  pay: { en: 'Pay', kn: 'ಪಾವತಿಸಿ', hi: 'भरें' },
  quick: { en: 'Quick actions', kn: 'ತ್ವರಿತ ಕ್ರಿಯೆಗಳು', hi: 'जल्दी करें' },
  complaint: { en: 'Raise complaint', kn: 'ದೂರು ನೀಡಿ', hi: 'शिकायत करें' },
  food: { en: 'Food menu', kn: 'ಊಟದ ಪಟ್ಟಿ', hi: 'खाने का मेन्यू' },
  notice: { en: 'Give notice', kn: 'ನೋಟಿಸ್ ನೀಡಿ', hi: 'नोटिस दें' },
  invite: { en: 'Invite a friend', kn: 'ಸ್ನೇಹಿತರನ್ನು ಆಹ್ವಾನಿಸಿ', hi: 'दोस्त को बुलाएँ' },
  myRoom: { en: 'My room', kn: 'ನನ್ನ ಕೊಠಡಿ', hi: 'मेरा कमरा' },
  latest: { en: 'Latest notice', kn: 'ಇತ್ತೀಚಿನ ಸೂಚನೆ', hi: 'नई सूचना' },
} as const

export function useWords() {
  const lang = usePrefs((p) => p.lang)
  return (key: keyof typeof WORDS) => WORDS[key][lang]
}

export const WIFI = { name: 'Sunrise_PG_5G', password: 'sunrise@2026', floorNetwork: 'Sunrise_1F' }

export const ME_ID = 't1'
