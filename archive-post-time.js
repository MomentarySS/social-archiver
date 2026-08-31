const MONTHS = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function isXPost(post) {
  const platform = String((post && post.platform) || '').toLowerCase();
  if (platform === 'twitter' || platform === 'x') return true;
  return /x\.com|twitter\.com/i.test(String((post && post.url) || ''));
}

function twitterSnowflakeMs(id) {
  try {
    const n = BigInt(String(id || ''));
    if (n < 2n ** 32n) return 0;
    return Number((n >> 22n) + 1288834974657n);
  } catch {
    return 0;
  }
}

function hasClockTime(raw) {
  return /^\d{10,13}$/.test(raw) || /T\d{2}:/.test(raw) || /\d{2}:\d{2}(:\d{2})?/.test(raw);
}

function parseTimestamp(raw) {
  if (!raw) return 0;
  if (/^\d{10}$/.test(raw)) return Number(raw) * 1000;
  if (/^\d{13}$/.test(raw)) return Number(raw);
  const weibo = raw.match(
    /^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+([+-]\d{4})\s+(\d{4})$/,
  );
  if (weibo) {
    const mon = weibo[1];
    const month = MONTHS[mon];
    if (month == null) return 0;
    const offset = weibo[6];
    const sign = offset[0] === '-' ? -1 : 1;
    const tzMin = sign * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(3, 5)));
    const utc = Date.UTC(
      Number(weibo[7]), month, Number(weibo[2]),
      Number(weibo[3]), Number(weibo[4]), Number(weibo[5]),
    ) - tzMin * 60000;
    return Number.isNaN(utc) ? 0 : utc;
  }
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) return parsed;
  const day = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (day) {
    const t = Date.parse(`${day[1]}T00:00:00`);
    return Number.isNaN(t) ? 0 : t;
  }
  return 0;
}

function postTimeMs(post) {
  const created = String((post && post.created_at) || '').trim();
  const dated = String((post && post.date) || '').trim();
  let parsed = parseTimestamp(created);
  if (!parsed) parsed = parseTimestamp(dated);
  if (isXPost(post) && !hasClockTime(created) && !hasClockTime(dated)) {
    const flake = twitterSnowflakeMs(post.id);
    if (flake) return flake;
  }
  return parsed;
}

function sortPostsByTime(posts) {
  return [...posts].sort((a, b) => {
    const pinDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
    if (pinDiff) return pinDiff;
    const diff = postTimeMs(b) - postTimeMs(a);
    if (diff) return diff;
    return String(b.id || '').localeCompare(String(a.id || ''), undefined, { numeric: true });
  });
}

module.exports = {
  postTimeMs,
  sortPostsByTime,
};
