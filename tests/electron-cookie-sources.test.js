import { describe, expect, it, vi } from 'vitest'
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
  it('updates only the platform cookie and leaves per_user entries untouched', async () => {
    const store = createSettingsStore({
      cookies: {
        instagram: 'sessionid=old',
        per_user: {
          'instagram:ada': 'sessionid=old-user',
          'twitter:bob': 'auth_token=a; ct0=b',
        },
      },
    })
    const cookieValidation = { invalidatePlatform: vi.fn() }

    const result = await applyBrowserCookieImports(store, [{
      platform: 'instagram',
      cookie: 'sessionid=new; csrftoken=x',
    }], cookieValidation)

    expect(result.saved).toBe(1)
    expect(result.perUserUpdated).toBe(0)
    expect(cookieValidation.invalidatePlatform).toHaveBeenCalledWith('instagram')
    const next = store.readSettings()
    expect(next.cookies.instagram).toBe('sessionid=new; csrftoken=x')
    expect(next.cookies.per_user['instagram:ada']).toBe('sessionid=old-user')
    expect(next.cookies.per_user['twitter:bob']).toBe('auth_token=a; ct0=b')
  })

  it('skips invalidates when no cookieValidation store is provided', async () => {
    const store = createSettingsStore({
      cookies: { instagram: 'sessionid=old', per_user: {} },
    })

    const result = await applyBrowserCookieImports(store, [{
      platform: 'instagram',
      cookie: 'sessionid=new',
    }])

    expect(result.saved).toBe(1)
    expect(result.perUserUpdated).toBe(0)
    expect(store.readSettings().cookies.instagram).toBe('sessionid=new')
  })
})
