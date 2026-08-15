#!/usr/bin/env node
// Runs automatically after `npm run build` (npm's postbuild convention).
// Warns — doesn't fail the build — if public/.well-known/assetlinks.json
// still has its placeholder values, since shipping the placeholder is the
// documented first step in docs/google-play-twa.md (real values aren't
// known until a signing key exists). This is the only thing that would
// otherwise catch "step 3 of the runbook was forgotten."
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const assetlinksPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../dist/.well-known/assetlinks.json',
)

let contents
try {
  contents = readFileSync(assetlinksPath, 'utf-8')
} catch {
  console.warn('[postbuild] Could not read dist/.well-known/assetlinks.json — skipping placeholder check.')
  process.exit(0)
}

if (contents.includes('REPLACE_WITH_')) {
  console.warn(
    '\n⚠️  dist/.well-known/assetlinks.json still has placeholder values.\n' +
      '   The published TWA will fall back to a visible browser URL bar\n' +
      '   instead of opening chrome-free until the real Android package ID\n' +
      '   and SHA256 fingerprint are filled in. See docs/google-play-twa.md, step 3.\n',
  )
}
