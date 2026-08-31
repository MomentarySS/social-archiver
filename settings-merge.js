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
  if (patch.scheduler && typeof patch.scheduler === 'object') {
    next.scheduler = { ...(base.scheduler || {}), ...patch.scheduler };
  }
  if (patch.user_schedules && typeof patch.user_schedules === 'object') {
    next.user_schedules = { ...(base.user_schedules || {}), ...patch.user_schedules };
  }
  if (patch.user_last_scheduled && typeof patch.user_last_scheduled === 'object') {
    next.user_last_scheduled = { ...(base.user_last_scheduled || {}), ...patch.user_last_scheduled };
  }
  if (patch.ffmpeg && typeof patch.ffmpeg === 'object') {
    next.ffmpeg = { ...(base.ffmpeg || {}), ...patch.ffmpeg };
  }
  if (patch.notifications && typeof patch.notifications === 'object') {
    next.notifications = { ...(base.notifications || {}), ...patch.notifications };
  }
  return next;
}

module.exports = { mergeCookies, applySettingsPatch };
