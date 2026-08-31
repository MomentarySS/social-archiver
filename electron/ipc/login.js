const { ipcMain, BrowserWindow, session } = require('electron');
const { debugLog } = require('../debug');

async function applySessionProxy(sess, getProxyUrl) {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl || !sess?.setProxy) return;
  await sess.setProxy({ proxyRules: proxyUrl });
}

async function validateWeiboLoginCookie(cookieStr) {
  if (!cookieStr) return false;
  try {
    const resp = await fetch('https://m.weibo.cn/api/config', {
      headers: {
        'User-Agent': (
          'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) '
          + 'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 '
          + 'Mobile/15E148 Safari/604.1'
        ),
        Cookie: cookieStr,
        Referer: 'https://m.weibo.cn/',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    const data = await resp.json();
    return Boolean(data?.data?.login);
  } catch (_) {
    return false;
  }
}

async function loginCookieReady(opts, cookieStr) {
  if (!cookieStr) return false;
  if (opts.requiredName === 'SUB') {
    return validateWeiboLoginCookie(cookieStr);
  }
  return true;
}

async function collectCookies(ses, domains) {
  const buckets = await Promise.all(domains.map((domain) => ses.cookies.get({ domain })));
  const byName = new Map();
  for (const cookie of buckets.flat()) {
    if (cookie && cookie.name && cookie.value) {
      byName.set(cookie.name, cookie.value);
    }
  }
  return byName;
}

function cookieMapToString(byName) {
  return Array.from(byName.entries()).map(([name, value]) => `${name}=${value}`).join('; ');
}

function registerLoginIpc(ctx, settingsStore) {
  const { getProxyUrl } = settingsStore;

  async function tryCookieLogin(opts) {
    const base = String(opts.partition || 'login').replace(/^persist:/, '');
    const partitionName = `${base}-${Date.now()}`;
    const loginSession = session.fromPartition(partitionName);
    const loginWindow = new BrowserWindow({
      width: opts.width || 480,
      height: opts.height || 760,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        partition: partitionName,
        webgl: false,
        backgroundThrottling: false,
      },
    });

    debugLog(`Login window created, id=${loginWindow.id}`);

    let outerResolve = null;
    const outerPromise = new Promise((r) => { outerResolve = r; });
    let timeoutHandle = null;
    let intervalHandle = null;
    let resolved = false;

    const cleanup = () => {
      if (timeoutHandle) { clearTimeout(timeoutHandle); timeoutHandle = null; }
      if (intervalHandle) { clearInterval(intervalHandle); intervalHandle = null; }
    };

    const resolveWith = (cookie, error, retryable = false) => {
      debugLog(`resolveWith called, cookie=${cookie ? 'yes' : 'no'} error=${error || ''} retryable=${retryable}`);
      if (resolved) return { cookie, error, retryable };
      resolved = true;
      cleanup();
      try {
        if (!loginWindow.isDestroyed()) {
          loginWindow.close();
        }
      } catch (e) { debugLog(`close error: ${e.message}`); }
      const result = { cookie: cookie || null, error: cookie ? null : (error || '登录已取消或超时'), retryable };
      if (outerResolve) { outerResolve(result); }
      return result;
    };

    loginWindow.webContents.on('render-process-gone', (_e, details) => {
      debugLog(`render-process-gone: ${JSON.stringify(details)}`);
      resolveWith(null, opts.crashHint, true);
    });

    loginWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
      debugLog(`did-fail-load: ${errorCode} ${errorDescription} ${validatedURL}`);
      if (!isMainFrame || errorCode === -3) return;
      const reason = `登录页加载失败（${errorDescription}）。请检查网络，或改为手动粘贴 Cookie。`;
      resolveWith(null, reason, true);
    });

    loginWindow.on('closed', () => {
      resolveWith(null, '登录已取消');
    });

    try {
      if (opts.userAgent) {
        loginWindow.webContents.setUserAgent(opts.userAgent);
      }
      await applySessionProxy(loginSession, getProxyUrl);
      loginWindow.show();
      try {
        await loginWindow.loadURL(opts.url);
      } catch (e) {
        return resolveWith(null, `无法打开登录页：${e.message}`, true);
      }

      timeoutHandle = setTimeout(() => {
        resolveWith(null, opts.timeoutHint);
      }, 300000);

      intervalHandle = setInterval(async () => {
        try {
          if (resolved) return;
          if (!loginWindow || loginWindow.isDestroyed()) {
            resolveWith(null, '登录窗口已关闭');
            return;
          }
          const byName = await collectCookies(loginSession, opts.domains);
          if (resolved) return;
          if (byName.get(opts.requiredName)) {
            const cookieStr = cookieMapToString(byName);
            if (await loginCookieReady(opts, cookieStr)) {
              resolveWith(cookieStr, null);
            }
          }
        } catch (e) {
          debugLog(`Cookie check error: ${e.message}`);
        }
      }, 1000);

      return await outerPromise;
    } catch (e) {
      return resolveWith(null, e.message || String(e), true);
    }
  }

  async function startCookieLogin(opts) {
    if (!ctx.mainWindow || ctx.mainWindow.isDestroyed()) {
      return { cookie: null, error: '主窗口不可用' };
    }

    const maxAttempts = 1 + (opts.retries || 0);
    let lastResult = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1) {
        debugLog(`login-capture retry ${attempt}/${maxAttempts}`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      lastResult = await tryCookieLogin(opts);
      if (lastResult && lastResult.cookie) {
        debugLog(`login-capture success on attempt ${attempt}`);
        return lastResult;
      }

      const isRetryable =
        (lastResult && lastResult.retryable)
        || (lastResult && lastResult.error && /崩溃|加载失败|render-process-gone|did-fail-load/.test(lastResult.error));

      if (!isRetryable || attempt === maxAttempts) {
        debugLog(`login-capture failed on attempt ${attempt}: ${lastResult && lastResult.error}`);
        return lastResult;
      }

      debugLog(`login-capture will retry after attempt ${attempt}`);
    }

    return lastResult || { cookie: null, error: opts.timeoutHint };
  }

  async function runLoginCapture(opts) {
    debugLog(`login-capture start ${opts.url}`);
    try {
      const result = await startCookieLogin(opts);
      if (result && result.cookie) {
        return { success: true, cookie: result.cookie };
      }
      return { success: false, error: (result && result.error) || opts.timeoutHint };
    } catch (e) {
      debugLog(`login-capture exception: ${e.message || String(e)}`);
      return { success: false, error: `登录过程出错: ${e.message || String(e)}` };
    }
  }

  ipcMain.handle('weibo-login', async () => runLoginCapture({
    partition: 'persist:weibo-login',
    url: 'https://m.weibo.cn',
    domains: ['.weibo.cn', 'm.weibo.cn', '.weibo.com', 'weibo.com'],
    requiredName: 'SUB',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    crashHint: '登录页崩溃。请改用系统浏览器打开 m.weibo.cn，登录后粘贴 Cookie。',
    timeoutHint: '登录超时。请改用系统浏览器打开 m.weibo.cn，登录后粘贴 Cookie。',
    width: 420,
    height: 760,
    retries: 1,
  }));

  ipcMain.handle('twitter-login', async () => runLoginCapture({
    partition: 'persist:twitter-login',
    url: 'https://x.com/i/flow/login',
    domains: ['.x.com', 'x.com', '.twitter.com', 'twitter.com'],
    requiredName: 'auth_token',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    crashHint: 'X 登录页崩溃。请在 Edge 打开 x.com，F12 → 应用 → Cookie，复制 auth_token 和 ct0。',
    timeoutHint: '登录超时。现代 Edge/Chrome 无法被直接读取 Cookie，请在此窗口登录，或手动粘贴 auth_token。',
    width: 520,
    height: 780,
    retries: 1,
  }));

  ipcMain.handle('instagram-login', async () => runLoginCapture({
    partition: 'persist:instagram-login',
    url: 'https://www.instagram.com/accounts/login/',
    domains: ['.instagram.com', 'www.instagram.com'],
    requiredName: 'sessionid',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    crashHint: 'Instagram 登录页崩溃。请打开 instagram.com，F12 → 应用 → Cookie，复制 sessionid。',
    timeoutHint: '登录超时。现代 Edge/Chrome 无法被直接读取 Cookie，请在此窗口登录，或手动粘贴 sessionid。',
    width: 420,
    height: 760,
    retries: 1,
  }));
}

module.exports = { registerLoginIpc };
