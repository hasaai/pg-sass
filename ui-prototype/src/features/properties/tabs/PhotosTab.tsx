import { ArrowLeft, ArrowRight, Check, ImagePlus, Images, Pencil, Star, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { PhotoTile } from '../../../components/common'
import { Badge } from '../../../components/ui-kit/badge'
import { Button } from '../../../components/ui-kit/button'
import { ConfirmDialog } from '../../../components/ui-kit/confirm'
import { EmptyState } from '../../../components/ui-kit/feedback'
import { Input } from '../../../components/ui-kit/input'
import { toast } from '../../../components/ui-kit/toast'
import { newId } from '../../../data/store'
import type { Property } from '../../../data/types'
import { useSession } from '../../../demo/session'
import { plural } from '../../../lib/format'
import { patchProperty } from '../actions'

type Photo = Property['photos'][number]
const IDEAS = ['Room', 'Bathroom', 'Dining area', 'Common area', 'Terrace', 'Entrance']

export function PhotosTab({ property }: { property: Property }) {
  const { can } = useSession()
  const manage = can('properties.manage')
  const photos = property.photos
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [removing, setRemoving] = useState<Photo | null>(null)

  const save = (next: Photo[], log?: string) => patchProperty(property.id, { photos: next }, log)

  function move(i: number, d: number) {
    const next = [...photos]
    const [p] = next.splice(i, 1)
    next.splice(i + d, 0, p!)
    save(next)
    toast.success(i + d === 0 ? 'Cover photo changed' : 'Photo moved')
  }

  function upload() {
    const n = 3
    const added = Array.from({ length: n }, (_, i) => ({
      id: newId('ph'),
      caption: IDEAS[(photos.length + i) % IDEAS.length]!,
      hue: Math.floor(Math.random() * 360),
    }))
    save([...photos, ...added], `Added ${plural(n, 'photo')}`)
    toast.success(`${plural(n, 'photo')} uploaded`)
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground">
          {plural(photos.length, 'photo')}. The first photo is the cover shown on cards and your
          listing.
        </p>
        {manage && (
          <Button onClick={upload}>
            <ImagePlus /> Upload photos
          </Button>
        )}
      </div>
      {photos.length === 0 && !manage ? (
        <EmptyState icon={<Images />} title="No photos yet" />
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {photos.map((ph, i) => (
            <figure key={ph.id} className="overflow-hidden rounded-xl border bg-card shadow-xs">
              <div className="relative">
                <PhotoTile hue={ph.hue} className="rounded-none" />
                {i === 0 && (
                  <Badge tone="good" className="absolute top-2 left-2 shadow-sm">
                    <Star /> Cover
                  </Badge>
                )}
              </div>
              <figcaption className="grid gap-2 p-2.5">
                {editing === ph.id ? (
                  <form
                    className="flex gap-1"
                    onSubmit={(e) => {
                      e.preventDefault()
                      save(
                        photos.map((p) => (p.id === ph.id ? { ...p, caption: draft.trim() } : p)),
                      )
                      setEditing(null)
                      toast.success('Caption saved')
                    }}
                  >
                    <Input
                      autoFocus
                      aria-label="Caption"
                      className="h-8 text-[13px]"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                    />
                    <Button type="submit" size="icon-sm" aria-label="Save caption">
                      <Check />
                    </Button>
                  </form>
                ) : (
                  <p className="truncate text-[13px] font-medium">
                    {ph.caption || <span className="text-muted-foreground">No caption</span>}
                  </p>
                )}
                {manage && (
                  <div className="flex flex-wrap items-center gap-0.5">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="size-7"
                      aria-label="Move left"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowLeft />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="size-7"
                      aria-label="Move right"
                      disabled={i === photos.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowRight />
                    </Button>
                    <span className="flex-1" />
                    {i !== 0 && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="size-7"
                        aria-label="Set as cover"
                        title="Set as cover"
                        onClick={() => {
                          save(
                            [ph, ...photos.filter((p) => p.id !== ph.id)],
                            'Changed the cover photo',
                          )
                          toast.success('Cover photo changed')
                        }}
                      >
                        <Star />
                      </Button>
                    )}
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="size-7"
                      aria-label="Edit caption"
                      onClick={() => {
                        setEditing(ph.id)
                        setDraft(ph.caption)
                      }}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="size-7 text-destructive"
                      aria-label="Delete photo"
                      onClick={() => setRemoving(ph)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </figcaption>
            </figure>
          ))}
          {manage && (
            <button
              type="button"
              onClick={upload}
              className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent hover:text-primary"
            >
              <ImagePlus className="size-7" />
              <span className="text-sm font-medium">Upload photos</span>
              <span className="text-xs">JPG or PNG, up to 10 MB each</span>
            </button>
          )}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Delete this photo?"
        confirmLabel="Delete photo"
        destructive
        onConfirm={() => {
          if (!removing) return
          save(
            photos.filter((p) => p.id !== removing.id),
            'Deleted a photo',
          )
          toast.success('Photo deleted')
          setRemoving(null)
        }}
      >
        <p>“{removing?.caption || 'Photo'}” will be removed from this property and your listing.</p>
      </ConfirmDialog>
    </div>
  )
}
