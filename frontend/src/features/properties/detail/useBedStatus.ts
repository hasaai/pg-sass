import { api } from '../../../api/client'
import { useApiMutation } from '../../../api/hooks'
import type { Room } from '../../../api/types'
import { toast } from '../../../components/ui-kit/toast'
import { PROPERTY_QUERIES } from '../api'
import { BED_STATE } from './roomStats'

type Bed = Room['beds'][number]

/** Change one bed's status (vacant ↔ reserved ↔ under maintenance). Occupied beds change only at checkout. */
export function useBedStatus(bed: Bed) {
  const update = useApiMutation(
    (body: Record<string, unknown>) => api.patch(`/beds/${bed.id}/`, body),
    PROPERTY_QUERIES,
  )
  return (status: 'vacant' | 'reserved' | 'blocked') =>
    update.mutate(
      { status },
      {
        onSuccess: () =>
          toast.success(
            `Bed ${bed.label}: ${status === 'blocked' ? 'under maintenance' : BED_STATE[status].label.toLowerCase()}`,
          ),
        onError: (e) => toast.error(e.message),
      },
    )
}
