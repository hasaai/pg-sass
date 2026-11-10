import { ImagePlus, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'

import { api } from '../../api/client'
import { cn } from '../../lib/cn'
import { Button } from './button'
import { ErrorAlert } from './feedback'
import { toast } from './toast'

/**
 * Upload / replace / remove a logo. `path` takes POST (multipart field `image`) and DELETE.
 * Calls `onChanged` after either so the caller can refresh what shows the logo.
 */
export function LogoUploader({
  path,
  logoUrl,
  name,
  canEdit,
  onChanged,
  size = 'md',
}: {
  path: string
  logoUrl: string | null | undefined
  name: string
  canEdit: boolean
  onChanged: () => void | Promise<void>
  size?: 'md' | 'lg'
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const box = size === 'lg' ? 'size-24' : 'size-16'

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await onChanged()
      toast.success(done)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-4">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={`${name} logo`}
            className={cn(box, 'shrink-0 rounded-xl border bg-card object-cover')}
          />
        ) : (
          <span
            className={cn(
              box,
              'flex shrink-0 items-center justify-center rounded-xl border border-dashed bg-secondary text-muted-foreground',
            )}
          >
            <ImagePlus className="size-6" aria-hidden />
          </span>
        )}
        {canEdit && (
          <div className="grid gap-2">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                busy={busy}
                onClick={() => input.current?.click()}
              >
                <ImagePlus /> {logoUrl ? 'Change logo' : 'Upload logo'}
              </Button>
              {logoUrl && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => run(() => api.delete(path), 'Logo removed')}
                >
                  <Trash2 /> Remove
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Square JPG, PNG or WebP, up to 5 MB.</p>
          </div>
        )}
        <input
          ref={input}
          data-slot="input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label={`Logo for ${name}`}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            const body = new FormData()
            body.append('image', file)
            void run(() => api.upload(path, body), 'Logo saved')
          }}
        />
      </div>
      <ErrorAlert error={error} />
    </div>
  )
}
