/** Amenities grouped by category, marking shared/private, included and paid extras. */
import type { AmenityView } from '../lib/amenities'

export function AmenityGroups({ items }: { items: AmenityView[] }) {
  const available = items.filter((i) => !i.unavailable)
  const missing = items.filter((i) => i.unavailable)
  const groups = new Map<string, { name: string; items: AmenityView[] }>()
  for (const item of available) {
    const g = groups.get(item.category) ?? { name: item.category_name, items: [] }
    g.items.push(item)
    groups.set(item.category, g)
  }
  if (items.length === 0) return <p className="muted">No amenities listed yet.</p>
  return (
    <div className="amenity-groups">
      <p className="amenity-legend muted small">
        <span className="badge badge-info">Shared</span>{' '}
        <span className="badge badge-neutral">Private</span>{' '}
        <span className="badge badge-good">Included in rent</span>{' '}
        <span className="badge badge-warn">Extra charge</span>
      </p>
      {[...groups.entries()].map(([key, g]) => (
        <section key={key}>
          <h3>{g.name}</h3>
          <ul className="amenity-items">
            {g.items.map((i) => (
              <li key={i.key}>
                <span className="amenity-name">{i.name}</span>
                {i.sharing === 'shared' && <span className="badge badge-info">Shared</span>}
                {i.sharing === 'private' && <span className="badge badge-neutral">Private</span>}
                {i.charge === 'included' && (
                  <span className="badge badge-good">Included in rent</span>
                )}
                {i.charge === 'extra' && (
                  <span className="badge badge-warn">Extra: {i.charge_label}</span>
                )}
                {(i.detail_labels.length > 0 || i.where || i.note) && (
                  <span className="muted small amenity-meta">
                    {[i.where, ...i.detail_labels, i.note].filter(Boolean).join(' · ')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {missing.length > 0 && (
        <p className="muted small">
          <strong>Not available:</strong> {missing.map((m) => m.name).join(', ')}
        </p>
      )}
    </div>
  )
}
