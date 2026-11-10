import { useCallback, useState } from 'react'
import type { ChangeEvent } from 'react'

import { ApiError } from '../api/client'

type Values = Record<string, string | boolean>

/**
 * Minimal controlled-form helper: values, onChange binders, and field errors
 * taken from the server's validation response (the server is the source of truth).
 */
export function useForm<T extends Values>(initial: T) {
  const [values, setValues] = useState<T>(initial)
  const [error, setError] = useState<unknown>(null)

  const bind = useCallback(
    (name: keyof T & string) => ({
      name,
      value: values[name] as string,
      onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        setValues((v) => ({ ...v, [name]: e.target.value })),
    }),
    [values],
  )

  const bindCheck = useCallback(
    (name: keyof T & string) => ({
      name,
      checked: Boolean(values[name]),
      onChange: (e: ChangeEvent<HTMLInputElement>) =>
        setValues((v) => ({ ...v, [name]: e.target.checked })),
    }),
    [values],
  )

  const fieldError = useCallback(
    (name: string) => (error instanceof ApiError ? error.fieldError(name) : undefined),
    [error],
  )

  return {
    values,
    setValues,
    set: (name: keyof T & string, value: string | boolean) =>
      setValues((v) => ({ ...v, [name]: value })),
    bind,
    bindCheck,
    error,
    setError,
    fieldError,
    reset: () => {
      setValues(initial)
      setError(null)
    },
  }
}
