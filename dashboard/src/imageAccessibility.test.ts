import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC_DIR = join(__dirname)

function collectSourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(full))
    } else if (/\.(tsx|jsx)$/.test(name) && !name.endsWith('.test.tsx')) {
      files.push(full)
    }
  }
  return files
}

describe('image accessibility', () => {
  it('every <img> tag in source has an alt attribute (empty alt is fine for decorative images)', () => {
    const offenders: string[] = []
    for (const file of collectSourceFiles(SRC_DIR)) {
      const content = readFileSync(file, 'utf-8')
      const imgTags = content.match(/<img\b[^>]*>/g) ?? []
      for (const tag of imgTags) {
        if (!/\balt\s*=/.test(tag)) {
          offenders.push(`${file}: ${tag}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
