import { useState } from 'react'

import { api } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { Alert } from '../../components/ui-kit/feedback'
import { Button } from '../../components/ui-kit/button'

/** A gentle, non-blocking reminder to confirm the email. Hidden once confirmed. */
export function EmailReminder() {
  const { user } = useAuth()
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  if (!user?.email || user.email_verified) return null

  async function resend() {
    setState('sending')
    try {
      const reply = await api.post<{ sent: boolean }>('/auth/email/send', {})
      setState(reply.sent ? 'sent' : 'failed')
    } catch {
      setState('failed')
    }
  }

  return (
    <Alert tone="info" title="Confirm your email" className="mb-5">
      <span>
        We sent a link to {user.email}. Open it to confirm; everything works in the meantime.{' '}
      </span>
      {state === 'sent' ? (
        <span>New link sent.</span>
      ) : (
        <Button size="sm" variant="link" busy={state === 'sending'} onClick={() => void resend()}>
          {state === 'failed' ? 'Could not send. Try again' : 'Send the link again'}
        </Button>
      )}
    </Alert>
  )
}
