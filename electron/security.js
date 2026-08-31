const { session } = require('electron');

function isDevMode(app) {
  return process.env.NODE_ENV === 'development' || !app.isPackaged;
}

function configureDevSecurityWarnings(app) {
  // Vite dev server needs eval for HMR; Electron warns about missing/weak CSP in dev only.
  if (isDevMode(app)) {
    process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
  }
}

function configureProductionCsp(app) {
  if (isDevMode(app)) return;

  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' social-archiver: data: blob:",
    "media-src 'self' social-archiver: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy],
      },
    });
  });
}

module.exports = {
  configureDevSecurityWarnings,
  configureProductionCsp,
};
