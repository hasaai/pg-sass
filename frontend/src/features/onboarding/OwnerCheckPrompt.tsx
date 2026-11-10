import { Link } from 'react-router'

import { useApi } from '../../api/hooks'
import type { components } from '../../api/schema'
import { useAuth } from '../../auth/AuthContext'
import { Alert } from '../../components/ui-kit/feedback'

type OwnerCheck = components['schemas']['OwnerCheck']

/** A non-blocking nudge for the owner to verify their identity. Hidden once sent or verified. */
export function OwnerCheckPrompt() {
  const { can } = useAuth()
  const allowed = can('owner.verification')
  const { data } = useApi<OwnerCheck>(allowed ? '/onboarding/owner-check' : null)
  if (!data || !['not_started', 'draft', 'more_info'].includes(data.status)) return null
  const more = data.status === 'more_info'
  return (
    <Alert
      tone={more ? 'warn' : 'info'}
      title={more ? 'More information needed for your identity check' : 'Verify your identity'}
      className="mb-5"
    >
      {more
        ? 'The PG Manager team asked for a change. '
        : 'Optional for now: it is needed before your PG can be shown publicly. '}
      <Link to="/app/owner-verification" className="font-medium underline">
        {more ? 'See what is needed' : 'Start'}
      </Link>
    </Alert>
  )
}
