const { session } = require('electron');

const INSTAGRAM_LOGIN_PARTITION = 'persist:instagram-login';

function cookieMapToString(byName) {
  return Array.from(byName.entries()).map(([name, value]) => `${name}=${value}`).join('; ');
}

function platformCookieKey(platform) {
  if (platform === 'weibo' || platform === 'instagram') return platform;
  return 'twitter';
}

async function readInstagramSessionFromPartition() {
  try {
    const ses = session.fromPartition(INSTAGRAM_LOGIN_PARTITION);
    const buckets = await Promise.all([
      ses.cookies.get({ domain: '.instagram.com' }),
      ses.cookies.get({ domain: 'instagram.com' }),
      ses.cookies.get({}),
    ]);
    const byName = new Map();
    for (const cookie of buckets.flat()) {
      if (!cookie?.name || !cookie?.value) continue;
      if (!String(cookie.domain || '').includes('instagram.com')) continue;
      byName.set(cookie.name, cookie.value);
    }
    const sessionid = byName.get('sessionid');
    if (!sessionid) {
      return {
        success: false,
        cookie: '',
        message: '应用内登录分区没有 sessionid。请先点「应用内登录 Instagram」。',
      };
    }
    return {
      success: true,
      cookie: cookieMapToString(byName),
      message: '已从应用内登录分区读取 Instagram Cookie',
    };
  } catch (error) {
    return {
      success: false,
      cookie: '',
      message: error?.message || String(error),
    };
  }
}

async function refreshInstagramCookie(settingsStore, userId) {
  const partition = await readInstagramSessionFromPartition();
  if (!partition.success || !partition.cookie) {
    return { refreshed: false, cookie: '', message: partition.message };
  }

  const patch = {
    cookies: {
      [platformCookieKey('instagram')]: partition.cookie,
    },
  };
  if (userId) {
    patch.cookies.per_user = { [`instagram:${userId}`]: partition.cookie };
  }
  await settingsStore.saveSettingsPatch(patch);
  return {
    refreshed: true,
    cookie: partition.cookie,
    message: partition.message,
  };
}

async function applyBrowserCookieImports(settingsStore, imports) {
  const settings = settingsStore.readSettings();
  const patch = { cookies: {} };
  const perUserPatch = {};
  let saved = 0;

  for (const item of imports || []) {
    if (!item?.cookie || !item?.platform) continue;
    const platform = item.platform;
    const key = platformCookieKey(platform);
    patch.cookies[key] = item.cookie;
    const prefix = `${platform}:`;
    for (const userKey of Object.keys(settings?.cookies?.per_user || {})) {
      if (userKey.startsWith(prefix)) {
        perUserPatch[userKey] = item.cookie;
      }
    }
    saved += 1;
  }

  if (!saved) return { saved: 0, perUserUpdated: 0 };

  if (Object.keys(perUserPatch).length) {
    patch.cookies.per_user = perUserPatch;
  }
  await settingsStore.saveSettingsPatch(patch);
  return { saved, perUserUpdated: Object.keys(perUserPatch).length };
}

module.exports = {
  INSTAGRAM_LOGIN_PARTITION,
  readInstagramSessionFromPartition,
  refreshInstagramCookie,
  applyBrowserCookieImports,
  platformCookieKey,
};
