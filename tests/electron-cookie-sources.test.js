import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { applyBrowserCookieImports } = require('../electron/cookie-sources.js')

function createSettingsStore(initial) {
  let settings = structuredClone(initial)
  return {
    readSettings: () => settings,
    async saveSettingsPatch(patch) {
      const { applySettingsPatch } = require('../settings-merge.js')
      settings = applySettingsPatch(settings, patch)
      return settings
    },
  }
}

describe('applyBrowserCookieImports', () => {
  it('updates platform cookie and matching per_user keys', async () => {
    const store = createSettingsStore({
      cookies: {
        instagram: 'sessionid=old',
        per_user: {
          'instagram:ada': 'sessionid=old-user',
          'twitter:bob': 'auth_token=a; ct0=b',
        },
      },
    })

    const result = await applyBrowserCookieImports(store, [{
      platform: 'instagram',
      cookie: 'sessionid=new; csrftoken=x',
    }])

    expect(result.saved).toBe(1)
    expect(result.perUserUpdated).toBe(1)
    const next = store.readSettings()
    expect(next.cookies.instagram).toBe('sessionid=new; csrftoken=x')
    expect(next.cookies.per_user['instagram:ada']).toBe('sessionid=new; csrftoken=x')
    expect(next.cookies.per_user['twitter:bob']).toBe('auth_token=a; ct0=b')
  })
})
