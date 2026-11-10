import { readdirSync, statSync } from 'node:fs'
import { join, parse } from 'node:path'
import { describe, expect, it } from 'vitest'

/** Windows and macOS ignore letter case, so `Foo.tsx` and `foo.ts` break imports there. */
function clashes(dir: string): string[] {
  const seen = new Map<string, string>()
  const found: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      found.push(...clashes(path))
      continue
    }
    const key = parse(name)
      .name.replace(/\.test$/, '.test')
      .toLowerCase()
    const other = seen.get(key)
    if (other && other !== name) found.push(`${join(dir, other)} / ${name}`)
    seen.set(key, name)
  }
  return found
}

describe('file names', () => {
  it('no two files differ only by letter case or extension', () => {
    expect(clashes(join(__dirname, '..'))).toEqual([])
  })
})
