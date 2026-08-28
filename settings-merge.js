const PLATFORM_COOKIE_KEYS = ['twitter', 'weibo', 'instagram'];

function mergeCookies(current, patch) {
  const cur = current && typeof current === 'object' ? current : {};
  const inc = patch && typeof patch === 'object' ? patch : {};
  const next = { ...cur, ...inc };
  const perUser = { ...(cur.per_user || {}) };
  if (inc.per_user && typeof inc.per_user === 'object') {
    for (const [key, value] of Object.entries(inc.per_user)) {
      if (value == null || value === '') delete perUser[key];
      else perUser[key] = value;
    }
  }
  next.per_user = perUser;
  for (const key of PLATFORM_COOKIE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(inc, key) && !inc[key]) {
      delete next[key];
    }
  }
  return next;
}

function applySettingsPatch(current, patch) {
  const base = current && typeof current === 'object' ? current : {};
  if (!patch || typeof patch !== 'object') return { ...base };
  const next = { ...base, ...patch };
  if (patch.cookies) {
    next.cookies = mergeCookies(base.cookies || {}, patch.cookies);
  } else {
    next.cookies = base.cookies || {};
  }
  return next;
}

module.exports = { mergeCookies, applySettingsPatch };
