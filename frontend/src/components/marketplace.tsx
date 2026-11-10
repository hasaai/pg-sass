/** Building blocks shared by the public search, listing and wishlist pages. */
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'

import type { PublicListing, PublicPhoto } from '../api/types'
import { formatMoney, plural } from '../lib/format'
import { genderLabel } from '../lib/marketplace'
import type { Wishlist } from '../lib/useWishlist'

export function VerifiedBadge() {
  return (
    <span className="badge badge-good verified" title="Checked by the PG Manager team">
      ✓ Verified
    </span>
  )
}

export function WishlistButton({ slug, wishlist }: { slug: string; wishlist: Wishlist }) {
  const navigate = useNavigate()
  const location = useLocation()
  const saved = wishlist.slugs.has(slug)
  return (
    <button
      type="button"
      className={`heart ${saved ? 'on' : ''}`}
      aria-pressed={saved}
      aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
      disabled={wishlist.toggle.isPending}
      onClick={(e) => {
        // Cards are links; the heart must not open the listing.
        e.preventDefault()
        e.stopPropagation()
        if (!wishlist.signedIn) {
          navigate('/login', { state: { from: location.pathname + location.search } })
          return
        }
        wishlist.toggle.mutate(slug)
      }}
    >
      {saved ? '♥' : '♡'}
    </button>
  )
}

export function ListingCard({
  listing: l,
  wishlist,
  layout = 'grid',
}: {
  listing: PublicListing
  wishlist: Wishlist
  layout?: 'grid' | 'list'
}) {
  const cover = l.photos[0]
  return (
    <Link to={`/pg/${l.slug}`} className={`card card-link listing-card listing-${layout}`}>
      <div className="listing-cover">
        {cover ? (
          <img src={cover.url} alt={cover.caption || l.headline} loading="lazy" />
        ) : (
          <div className="cover-placeholder" aria-hidden="true">
            {l.name.slice(0, 1)}
          </div>
        )}
        <WishlistButton slug={l.slug} wishlist={wishlist} />
      </div>
      <div className="listing-body">
        <h2>{l.headline}</h2>
        <p className="muted">
          {l.locality}
          {l.landmark ? ` · ${l.landmark}` : ''} · For {genderLabel(l.gender)}
        </p>
        <p className="price">
          From {formatMoney(l.starting_rent)}
          <span className="muted"> / month</span>
        </p>
        <p className="badges">
          {l.is_verified && <VerifiedBadge />}
          {l.vacant_beds > 0 ? (
            <span className="badge badge-good">{plural(l.vacant_beds, 'bed')} available</span>
          ) : (
            <span className="badge badge-neutral">Full right now</span>
          )}
          {l.food_included && <span className="badge badge-info">Food included</span>}
        </p>
        <p className="muted small">
          {l.amenity_details
            .slice(0, 5)
            .map((a) => a.name)
            .join(' · ')}
        </p>
      </div>
    </Link>
  )
}

/** Big photo with thumbnails underneath; arrow keys and buttons move between photos. */
export function PhotoGallery({ photos, title }: { photos: PublicPhoto[]; title: string }) {
  const [index, setIndex] = useState(0)
  if (photos.length === 0) return null
  const current = photos[Math.min(index, photos.length - 1)]!
  const go = (step: number) => setIndex((i) => (i + step + photos.length) % photos.length)
  return (
    <section
      className="gallery"
      aria-label={`Photos of ${title}`}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(1)
        if (e.key === 'ArrowLeft') go(-1)
      }}
    >
      <figure className="gallery-main">
        <img src={current.url} alt={current.caption || title} />
        {photos.length > 1 && (
          <>
            <button
              type="button"
              className="gallery-nav prev"
              aria-label="Previous photo"
              onClick={() => go(-1)}
            >
              ‹
            </button>
            <button
              type="button"
              className="gallery-nav next"
              aria-label="Next photo"
              onClick={() => go(1)}
            >
              ›
            </button>
          </>
        )}
        <figcaption>
          {current.caption && <span>{current.caption} · </span>}
          {index + 1} of {photos.length}
        </figcaption>
      </figure>
      {photos.length > 1 && (
        <ul className="gallery-thumbs">
          {photos.map((p, i) => (
            <li key={p.url}>
              <button
                type="button"
                aria-label={`Show photo ${i + 1}`}
                aria-current={i === index || undefined}
                onClick={() => setIndex(i)}
              >
                <img src={p.url} alt="" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
