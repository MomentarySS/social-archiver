const path = require('path');

function isAssetAllowed(filePath, ctx, readSettings) {
  if (!filePath) return false;
  const target = path.resolve(filePath);
  const roots = [];
  for (const root of ctx.assetRoots) roots.push(root);
  const settings = readSettings();
  if (settings.output_dir) roots.push(path.resolve(settings.output_dir));
  const targetCmp = process.platform === 'win32' ? target.toLowerCase() : target;
  return roots.some((root) => {
    const rootCmp = process.platform === 'win32' ? String(root).toLowerCase() : String(root);
    const prefix = rootCmp.endsWith(path.sep) ? rootCmp : `${rootCmp}${path.sep}`;
    return targetCmp.startsWith(prefix);
  });
}

function isPathInsideRoot(userPath, rootDir) {
  const root = path.resolve(rootDir);
  const target = path.resolve(userPath);
  const rootCmp = process.platform === 'win32' ? root.toLowerCase() : root;
  const targetCmp = process.platform === 'win32' ? target.toLowerCase() : target;
  if (targetCmp === rootCmp) return false;
  const prefix = rootCmp.endsWith(path.sep) ? rootCmp : `${rootCmp}${path.sep}`;
  return targetCmp.startsWith(prefix);
}

module.exports = { isAssetAllowed, isPathInsideRoot };
