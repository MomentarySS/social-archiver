---
name: sa-electron-ipc
description: >-
  Social Archiver Electron main process: IPC modules, cookie temp files,
  settings merge writes, social-archiver:// protocol, CSP, backend spawn.
  Use when changing electron/, electron-main.js, preload.js, settings-merge.js,
  json-lines.js, electron-archives.js, protocol, or renderer Electron API.
---

# Electron main process

`electron-main.js` is the thin entry (window, GPU off, scheduler). IPC lives under `electron/ipc/`. Changes to `electron-main.js`, `electron/**`, or `preload.js` need an app restart (no HMR).

Register IPC in `electron/ipc/index.js`. Do not add `ipcMain.handle` in the renderer or in Vue.

## Cookie on the command line

Never pass Cookie as a spawn argv string. `electron/backend-spawn.js` writes a 0600 temp file and passes `--cookie-file`. Delete the file on process `close` / `error`. Backend reads it in `backend/cli.py`.

## Settings writes

Always `saveSettingsPatch` → `applySettingsPatch` in `settings-merge.js`. Nested merge for `cookies` (including `per_user`), `scheduler`, `ffmpeg`, `notifications`, `batch_retry`. Empty platform Cookie in a patch **deletes** that key. Serialize with `ctx.settingsWrite` so concurrent saves cannot drop Cookie keys.

Job-end Cookie: `persistJobCookie` only if `hasUsableCookie` passes. Weibo `done.cookie` and X refreshed `ct0` both go through this.

## Local media protocol

- Register `social-archiver` as privileged (`standard` + `stream`) **before** `app.whenReady`.
- Renderer builds URLs with `src/utils/assetUrl.js`: `social-archiver://asset/?path=` + `encodeURIComponent`. Do not IPC per image.
- Windows: keep the drive letter (`searchParams.get('path')` first). See `electron/protocol.js`.
- Allow only paths under known archive roots (`electron/asset-access.js`). Windows compare case-insensitively. `delete-archives` must not delete the root itself (`isPathInsideRoot` is false for the root).
- `.mov` served as `video/mp4`. Files ≤100MB: whole-file Buffer + HTTP Range `206`. Do not use `Readable.toWeb(fs.createReadStream)` for `<video>` seeking.
- HEVC in-window failure is expected (GPU disabled). Offer `openLocalPath` / system player.

## Security

- `contextIsolation: true`, `nodeIntegration: false`.
- Packaged CSP in `electron/security.js`. Dev may disable the CSP warning (Vite HMR needs eval); do not weaken production CSP.
- Proxy env: X / Instagram only. Strip proxy for Weibo (`stripProxyEnv`).

## Backend spawn

Packaged: `resources/backend/backend.exe`. Missing exe → throw; do not fall back into ASAR. Dev: `python backend/cli.py`. Force UTF-8 (`PYTHONIOENCODING` / `PYTHONUTF8`). Parse stdout with `json-lines.js` line buffer so a split `done` cannot hang the UI.

Send to renderer with `webContents.send` optional-chaining; the window may already be gone.

## Tests

`tests/electron-archives.test.js` (fixture scan → get-posts), `tests/electron-cookie-validation.test.js` (TTL), `tests/electron-cookie-sources.test.js` (Edge import does not overwrite `per_user`), `tests/update-check.test.js`. Cookie merge: `src/utils/jsonLines.test.ts` / settings-merge coverage. Do not log raw Cookie.
