import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { api } from '../../api/client'
import { useApi, useApiMutation, useList } from '../../api/hooks'
import type { AuditEntry, Organization } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { useBreadcrumbs } from '../../components/shell/crumbs'
import { Button } from '../../components/ui-kit/button'
import { Card, CardContent, CardHeader } from '../../components/ui-kit/card'
import { ErrorAlert, PageHeader, Skeleton } from '../../components/ui-kit/feedback'
import { Field } from '../../components/ui-kit/field'
import { Input } from '../../components/ui-kit/input'
import { LogoUploader } from '../../components/ui-kit/logo-uploader'
import { Table, TBody, TD, TH, THead, TR } from '../../components/ui-kit/table'
import { toast } from '../../components/ui-kit/toast'
import { titleCase } from '../../lib/format'

const schema = z.object({
  name: z.string().trim().min(1, 'Enter your business name.').max(150),
  contact_phone: z
    .string()
    .trim()
    .refine((v) => v === '' || /^[0-9+\-\s]{8,20}$/.test(v), {
      message: 'Enter a phone number, e.g. 9845000000.',
    }),
})
type Values = z.infer<typeof schema>

function BusinessForm({ org }: { org: Organization }) {
  const { reloadUser } = useAuth()
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: org.name, contact_phone: org.contact_phone ?? '' },
  })
  const save = useApiMutation(
    (b: Values) => api.patch<Organization>('/organizations/current', b),
    ['/organizations/'],
    async () => {
      toast.success('Business details saved')
      await reloadUser()
    },
  )
  const err = form.formState.errors
  return (
    <form noValidate className="grid gap-4" onSubmit={form.handleSubmit((v) => save.mutate(v))}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business name" required error={err.name?.message}>
          <Input {...form.register('name')} />
        </Field>
        <Field label="Business phone" error={err.contact_phone?.message}>
          <Input inputMode="tel" {...form.register('contact_phone')} />
        </Field>
      </div>
      <ErrorAlert error={save.error} fields={['name', 'contact_phone']} />
      <div>
        <Button type="submit" busy={save.isPending}>
          Save
        </Button>
      </div>
    </form>
  )
}

export function SettingsPage() {
  useBreadcrumbs([{ label: 'Settings' }])
  const { can, reloadUser } = useAuth()
  const isOwner = can('business.settings')
  const seesActivity = can('activity.view')
  const queryClient = useQueryClient()
  const org = useApi<Organization>('/organizations/current')
  const audit = useList<AuditEntry>(seesActivity ? '/audit-log/' : null)

  return (
    <>
      <PageHeader title="Settings" description="Your business details, logo and activity." />
      {org.isLoading || !org.data ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Business details" />
            <CardContent>
              {isOwner ? (
                <BusinessForm org={org.data} />
              ) : (
                <p className="text-sm">
                  {org.data.name} · {org.data.contact_phone || 'no phone'}
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader
              title="Business logo"
              description="Shown in the menu and on rent receipts."
            />
            <CardContent>
              <LogoUploader
                path="/organizations/current/logo"
                logoUrl={org.data.logo_url}
                name={org.data.name}
                canEdit={isOwner}
                size="lg"
                onChanged={async () => {
                  await queryClient.invalidateQueries({ queryKey: ['/organizations/current'] })
                  await reloadUser()
                }}
              />
            </CardContent>
          </Card>
        </div>
      )}
      {seesActivity && (
        <Card className="mt-5">
          <CardHeader
            title="Activity log"
            description="Money, checkouts, team changes, documents and verification are recorded here."
          />
          <ErrorAlert error={audit.error} className="mx-5 mb-4" />
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>When</TH>
                <TH>Who</TH>
                <TH>What</TH>
              </TR>
            </THead>
            <TBody>
              {audit.rows.map((a) => (
                <TR key={a.id}>
                  <TD className="text-[13px] whitespace-nowrap text-muted-foreground">
                    {new Date(a.created_at).toLocaleString('en-IN')}
                  </TD>
                  <TD className="text-[13px]">{a.actor ?? '—'}</TD>
                  <TD className="text-[13px]">{titleCase(a.action.replace(/[._]/g, ' '))}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  )
}
