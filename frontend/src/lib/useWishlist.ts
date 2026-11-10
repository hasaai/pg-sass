import { api } from '../api/client'
import { useApi, useApiMutation } from '../api/hooks'
import type { PublicListing } from '../api/types'
import { useAuth } from '../auth/AuthContext'

/** Slugs the signed-in visitor has saved, plus a toggle. Anonymous visitors get an empty set. */
export function useWishlist() {
  const { status } = useAuth()
  const signedIn = status === 'authenticated'
  const saved = useApi<PublicListing[]>(signedIn ? '/me/wishlist/' : null)
  const slugs = new Set((saved.data ?? []).map((l) => l.slug))
  const toggle = useApiMutation(
    (slug: string) =>
      slugs.has(slug)
        ? api.delete(`/me/wishlist/${slug}/`)
        : api.post('/me/wishlist/', { listing: slug }),
    ['/me/wishlist/'],
  )
  return { signedIn, slugs, listings: saved.data ?? [], isLoading: saved.isLoading, toggle }
}

export type Wishlist = ReturnType<typeof useWishlist>
