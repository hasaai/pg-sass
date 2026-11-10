import { Input } from '../../../components/ui-kit/input'
import { ROOM_FEATURES } from '../../../data/seed'
import { Pill } from '../bits'
import type { FeatureState } from './features'

/** "Room has": AC, attached bathroom and room features with optional extra charges. */
export function FeaturePicker({
  ac,
  setAc,
  bath,
  setBath,
  features,
  setFeatures,
  showMoney,
}: {
  ac: boolean
  setAc: (v: boolean) => void
  bath: boolean
  setBath: (v: boolean) => void
  features: FeatureState
  setFeatures: (v: FeatureState) => void
  showMoney: boolean
}) {
  const toggle = (key: string) => {
    const next = { ...features }
    if (key in next) delete next[key]
    else next[key] = ''
    setFeatures(next)
  }
  const chosen = ROOM_FEATURES.filter((f) => f.key in features)
  return (
    <div className="grid gap-2">
      <p className="text-[13px] font-medium">Room has (tap to choose)</p>
      <div className="flex flex-wrap gap-2">
        <Pill dashed on={ac} onClick={() => setAc(!ac)}>
          AC
        </Pill>
        <Pill dashed on={bath} onClick={() => setBath(!bath)}>
          Attached bathroom
        </Pill>
        {ROOM_FEATURES.map((f) => (
          <Pill key={f.key} dashed on={f.key in features} onClick={() => toggle(f.key)}>
            {f.name}
          </Pill>
        ))}
      </div>
      {showMoney && chosen.length > 0 && (
        <div className="mt-2 rounded-lg border bg-secondary/30 p-3">
          <p className="mb-2 text-xs text-muted-foreground">
            Extra charge per month (leave empty when it is included in the rent)
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {chosen.map((f) => (
              <label key={f.key} className="flex items-center gap-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="relative">
                  <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-xs text-muted-foreground">
                    ₹
                  </span>
                  <Input
                    className="h-8 w-32 pl-6"
                    inputMode="numeric"
                    aria-label={`${f.name} extra charge per month`}
                    placeholder="Included"
                    value={features[f.key]}
                    onChange={(e) => setFeatures({ ...features, [f.key]: e.target.value })}
                  />
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
