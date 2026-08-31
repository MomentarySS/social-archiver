const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { protocol } = require('electron');
const { debugLog } = require('./debug');
const { isAssetAllowed } = require('./asset-access');

function mimeForAsset(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();
  return {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.mov': 'video/mp4',
    '.webm': 'video/webm',
  }[ext] || '';
}

function localPathFromAssetUrl(requestUrl) {
  const parsed = new URL(requestUrl);
  const fromQuery = parsed.searchParams.get('path');
  if (fromQuery) return fromQuery;
  let raw = decodeURIComponent((parsed.pathname || '').replace(/^\/+/, ''));
  if (raw.toLowerCase().startsWith('local/')) raw = raw.slice(6);
  if (/^\/[A-Za-z]:/.test(raw)) raw = raw.slice(1);
  if (/^[A-Za-z]:/.test(raw)) {
    const drive = raw.slice(0, 2);
    const rest = path.normalize(raw.slice(2).replace(/\//g, '\\'));
    return drive + rest;
  }
  return path.normalize(raw);
}

function byteRange(size, header) {
  if (!header || !String(header).startsWith('bytes=') || size <= 0) return null;
  const spec = String(header).slice(6).split(',')[0].trim();
  const dash = spec.indexOf('-');
  if (dash < 0) return null;
  const left = spec.slice(0, dash);
  const right = spec.slice(dash + 1);
  let start;
  let end;
  if (!left) {
    const suffix = Number(right);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(left);
    end = right ? Number(right) : size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size) return null;
  end = Math.min(Math.max(end, start), size - 1);
  return { start, end };
}

function fileResponse(filePath, request) {
  const stat = fs.statSync(filePath);
  const mime = mimeForAsset(filePath) || 'application/octet-stream';
  const etag = `"${stat.size}-${Math.trunc(stat.mtimeMs)}"`;
  const headers = {
    'Content-Type': mime,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable',
    ETag: etag,
    'Access-Control-Allow-Origin': '*',
  };
  if (request.headers.get('If-None-Match') === etag && !request.headers.get('Range')) {
    return new Response(null, { status: 304, headers });
  }
  const maxBuffer = 100 * 1024 * 1024;
  const data = stat.size <= maxBuffer ? fs.readFileSync(filePath) : null;
  const range = byteRange(stat.size, request.headers.get('Range'));
  if (data) {
    if (!range) {
      headers['Content-Length'] = String(data.byteLength);
      return new Response(data, { status: 200, headers });
    }
    const slice = data.subarray(range.start, range.end + 1);
    headers['Content-Length'] = String(slice.byteLength);
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${data.byteLength}`;
    return new Response(slice, { status: 206, headers });
  }
  if (!range) {
    headers['Content-Length'] = String(stat.size);
    return new Response(Readable.toWeb(fs.createReadStream(filePath)), { status: 200, headers });
  }
  headers['Content-Length'] = String(range.end - range.start + 1);
  headers['Content-Range'] = `bytes ${range.start}-${range.end}/${stat.size}`;
  return new Response(
    Readable.toWeb(fs.createReadStream(filePath, { start: range.start, end: range.end })),
    { status: 206, headers },
  );
}

function registerProtocolSchemes() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'social-archiver',
      privileges: {
        standard: true,
        secure: true,
        stream: true,
        supportFetchAPI: true,
        corsEnabled: true,
        bypassCSP: true,
      },
    },
  ]);
}

function registerAssetProtocol(ctx, readSettings) {
  protocol.handle('social-archiver', (request) => {
    try {
      const filePath = localPathFromAssetUrl(request.url);
      if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        return new Response('Not Found', { status: 404 });
      }
      if (!isAssetAllowed(filePath, ctx, readSettings)) {
        return new Response('Forbidden', { status: 403 });
      }
      return fileResponse(filePath, request);
    } catch (e) {
      debugLog(`ASSET_PROTOCOL: ${e && e.message ? e.message : String(e)}`);
      return new Response('Error', { status: 500 });
    }
  });
}

module.exports = {
  registerProtocolSchemes,
  registerAssetProtocol,
};
