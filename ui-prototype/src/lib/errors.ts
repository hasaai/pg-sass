/** The prototype has no server; errors are plain messages. */
export function errorMessage(error: unknown, _shownFields: string[] = []): string | null {
  if (!error) return null
  if (error instanceof Error) return error.message
  return String(error)
}
