import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { compareVersion, normalizeManifest } = require('../electron/update-check.js')

describe('update-check', () => {
  it('compareVersion orders semver tuples', () => {
    expect(compareVersion('1.2.0', '1.1.9')).toBeGreaterThan(0)
    expect(compareVersion('1.2.0', '1.2.0')).toBe(0)
    expect(compareVersion('v1.0.1', '1.0.2')).toBeLessThan(0)
  })

  it('normalizeManifest accepts snake_case fields', () => {
    expect(normalizeManifest({
      version: '1.2.0',
      notes_url: 'https://example.com/notes',
      zipUrl: 'https://example.com/app.zip',
    })).toEqual({
      version: '1.2.0',
      notesUrl: 'https://example.com/notes',
      downloadUrl: 'https://example.com/app.zip',
      releaseNotes: '',
    })
  })
})
