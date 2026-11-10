/** Small helpers shared by React Hook Form + Zod forms. */
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form'
import { z } from 'zod'

import { ApiError } from '../api/client'
import { rupeesToPaise } from './format'

/** A rupee amount typed by a person ("8500", "8,500.50"); empty is allowed unless required. */
export const rupeesField = (label: string, required = false) =>
  z
    .string()
    .trim()
    .refine((v) => (v === '' ? !required : rupeesToPaise(v) !== null), {
      message: required
        ? `Enter ${label} in rupees, e.g. 8500.`
        : `${label}: enter rupees, e.g. 8500.`,
    })

export const toPaiseOrNull = (v: string) => (v.trim() === '' ? null : rupeesToPaise(v))

/** Copy the server's field errors onto the form fields with the same (or renamed) names. */
export function applyServerErrors<T extends FieldValues>(
  form: UseFormReturn<T>,
  err: unknown,
  rename: Record<string, string> = {},
): void {
  if (!(err instanceof ApiError) || err.code !== 'validation_error') return
  for (const [field, value] of Object.entries(err.fields)) {
    const name = (rename[field] ?? field) as Path<T>
    if (name in form.getValues())
      form.setError(name, {
        type: 'server',
        message: Array.isArray(value) ? String(value[0]) : String(value),
      })
  }
}
