// In-memory TTL cache for cookies that were confirmed valid recently.
// Lets the renderer and the IG partition-refresh logic skip redundant
// remote `checkCookie` calls when switching between tasks within the
// validity window.

const DEFAULT_TTL_MS = 30 * 60 * 1000;

function shortTag(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return String(hash);
}

class CookieValidationStore {
  constructor(ttlMs = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
    this.entries = [];
  }

  markValid(platform, userId, cookie) {
    if (!platform || !cookie) return;
    this.entries.push({
      platform,
      userId: userId || '',
      cookieHash: shortTag(cookie),
      validAt: Date.now(),
    });
  }

  isFresh(platform, userId, cookie, ttlMs) {
    if (!platform || !cookie) return false;
    const window = typeof ttlMs === 'number' && ttlMs > 0 ? ttlMs : this.ttlMs;
    const threshold = Date.now() - window;
    const u = userId || '';
    const cookieHash = shortTag(cookie);
    for (let i = this.entries.length - 1; i >= 0; i -= 1) {
      const e = this.entries[i];
      if (e.platform !== platform || e.userId !== u || e.cookieHash !== cookieHash) continue;
      if (e.validAt >= threshold) return true;
    }
    return false;
  }

  invalidate(platform, userId) {
    this.entries = this.entries.filter((e) => {
      if (e.platform !== platform) return true;
      if (!userId) return false;
      return e.userId !== userId;
    });
  }

  invalidatePlatform(platform) {
    this.invalidate(platform, null);
  }
}

module.exports = {
  CookieValidationStore,
  DEFAULT_TTL_MS,
};