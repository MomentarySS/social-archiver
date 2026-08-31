/** Shared cookie usability rules for Electron scheduling and job prep. */

function hasUsableCookie(platform, cookie) {
  const value = String(cookie || '').trim();
  if (!value) return false;
  if (platform === 'weibo') {
    return /\bSUB=/.test(value) || (!value.includes('=') && !value.includes(';'));
  }
  if (platform === 'twitter') {
    return /(?:^|;\s*)auth_token=/i.test(value) && /(?:^|;\s*)ct0=/i.test(value);
  }
  if (platform === 'instagram') {
    return /(?:^|;\s*)sessionid=/i.test(value) || (!value.includes('=') && !value.includes(';'));
  }
  return true;
}

function extractCookieValue(cookie, name) {
  const re = new RegExp(`(?:^|;\\s*)${name}=([^;]*)`, 'i');
  const match = String(cookie || '').match(re);
  return match ? match[1].trim() : '';
}

module.exports = {
  hasUsableCookie,
  extractCookieValue,
};
