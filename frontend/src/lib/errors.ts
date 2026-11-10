import { ApiError } from '../api/client'

function flatten(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(flatten).filter(Boolean).join(' ')
  if (value && typeof value === 'object')
    return Object.values(value as Record<string, unknown>)
      .map(flatten)
      .join(' ')
  return ''
}

/**
 * One readable message for an API or network error. Messages for `shownFields` are left
 * out because the form shows them next to those fields; any others are listed here.
 */
export function errorMessage(error: unknown, shownFields: string[] = []): string | null {
  if (!error) return null
  if (error instanceof ApiError) {
    if (error.code === 'throttled')
      return 'Too many tries in a short time. Please wait a minute and try again.'
    if (error.code !== 'validation_error') return error.message
    const other = Object.entries(error.fields)
      .filter(([name]) => !shownFields.includes(name))
      .map(([, value]) => flatten(value))
      .filter(Boolean)
    if (other.length) return other.join(' ')
    return 'Please check the highlighted fields.'
  }
  if (error instanceof Error) return error.message
  return String(error)
}
