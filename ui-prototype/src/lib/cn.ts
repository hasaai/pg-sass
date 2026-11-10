import { clsx } from 'clsx'
import type { ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Join class names; later Tailwind classes override earlier ones ("px-2" + "px-4" → "px-4"). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
