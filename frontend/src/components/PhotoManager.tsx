import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { api } from '../api/client'
import { useApiMutation } from '../api/hooks'
import { ErrorBanner } from './ui'

export interface ManagedPhoto {
  id: string
  url: string
  caption?: string
}

/**
 * Upload, caption and remove photos of a property or a listing.
 * `uploadPath` takes one multipart file field `image`; `itemPath(id)` takes PATCH/DELETE.
 */
export function PhotoManager({
  photos,
  uploadPath,
  itemPath,
  invalidate,
  max,
  canEdit = true,
  hint,
}: {
  photos: ManagedPhoto[]
  uploadPath: string
  itemPath: (id: string) => string
  invalidate: string[]
  max: number
  canEdit?: boolean
  hint?: string
}) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const remove = useApiMutation((id: string) => api.delete(itemPath(id)), invalidate)
  const caption = useApiMutation(
    (b: { id: string; caption: string }) => api.patch(itemPath(b.id), { caption: b.caption }),
    invalidate,
  )

  async function upload(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    setError(null)
    try {
      // One request per photo, so one bad file doesn't lose the others.
      for (const file of Array.from(files).slice(0, max - photos.length)) {
        const form = new FormData()
        form.append('image', file)
        await api.upload(uploadPath, form)
      }
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
      // Prefix match, like useApiMutation: '/properties/' also refreshes '/properties/p1/'.
      await queryClient.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey[0] === 'string' &&
          invalidate.some((prefix) => (q.queryKey[0] as string).startsWith(prefix)),
      })
    }
  }

  return (
    <div className="form">
      {hint && <p className="muted">{hint}</p>}
      <ErrorBanner error={error ?? remove.error ?? caption.error} />
      {photos.length === 0 ? (
        <p className="muted">No photos yet.</p>
      ) : (
        <ul className="photo-grid">
          {photos.map((p, i) => (
            <li key={p.id}>
              <img src={p.url} alt={p.caption || `Photo ${i + 1}`} />
              {canEdit ? (
                <>
                  <input
                    aria-label={`Caption for photo ${i + 1}`}
                    placeholder="Caption, e.g. Double room"
                    defaultValue={p.caption ?? ''}
                    onBlur={(e) => {
                      if (e.target.value !== (p.caption ?? ''))
                        caption.mutate({ id: p.id, caption: e.target.value })
                    }}
                  />
                  <button type="button" className="link danger" onClick={() => remove.mutate(p.id)}>
                    Remove
                  </button>
                </>
              ) : (
                p.caption && <span className="muted small">{p.caption}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && photos.length < max && (
        <label className="btn btn-secondary file-btn">
          {busy ? 'Uploading…' : 'Add photos'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={busy}
            onChange={(e) => {
              void upload(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
      )}
    </div>
  )
}
