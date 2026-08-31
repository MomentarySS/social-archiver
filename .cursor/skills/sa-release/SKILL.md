---
name: sa-release
description: >-
  Social Archiver local Windows zip release: package.json version as source of
  truth, release:pack / release:check, CHANGELOG and 交接文档 sync, unsigned
  SmartScreen notes. Use when bumping version, shipping a zip/NSIS build,
  editing CHANGELOG.md, RELEASE.md, SIGNING.md, update manifest, or
  electron-builder config.
---

# Local release

Distribution is **local zip**, not GitHub Releases / Actions, unless the user asks. Checklist: `RELEASE.md`.

## Version

Source of truth: `package.json` `version` (keep `package-lock.json` root in sync).

Also update, same number:

- `CHANGELOG.md` (user-facing)
- `交接文档.md` version history + header date
- `README.md` if it hard-codes a version (prefer `<version>` placeholders)
- `scripts/update-manifest.example.json` if the example version is bumped

Do not invent a fourth version in PRODUCT/DESIGN unless the product boundary or visual system changed.

## Commands (PowerShell)

Use `npm.cmd`, not `npm`.

| Goal | Command |
|------|---------|
| Tests + `vue-tsc` + Vite | `npm.cmd run release:check` |
| Check + `electron:build` | `npm.cmd run release:pack` |
| Print version | `npm.cmd run version:print` |

`electron:build` runs `write_icon.py` → `npm run build` → `build_backend.py` → `electron-builder --win`. Need `backend/requirements.txt` and `requirements-build.txt`. Python ≥ 3.9.

## Artifacts

Under `dist-electron/`:

- `SocialArchiver-<version>-win.zip` — preferred share
- `SocialArchiver-<version>-win.exe` — NSIS
- `win-unpacked/` — runnable on this machine

**Never tell anyone to copy only the exe.** Recipients need the whole folder (`resources/backend/backend.exe` + `_internal`). If `win-unpacked` is locked, close the running app first.

Optional: `git tag v<version>` locally. Do not push unless asked. Do not commit unless asked.

## After pack

Smoke: unzip → cache one platform → browse overview → calendar/hashtag → settings update check. Packaged logs must be UTF-8 (`cli.py` + `electron/backend-spawn.js`).

Unsigned builds: SmartScreen path is README (更多信息 → 仍要运行). Signing is optional: `SIGNING.md` (`CSC_LINK` / `CSC_KEY_PASSWORD`). Never commit `.pfx`.

Update check: settings `update_manifest_url` → static JSON (`version`, `zipUrl`, `notesUrl`). No silent auto-upgrade.

## Docs split

| File | Role |
|------|------|
| README | How to run / pack |
| 交接文档 | Implementation + pitfalls |
| CHANGELOG | User-facing delta |
| PRODUCT | Boundaries only (no start commands) |
| DESIGN | Visual system |
| 拓展计划 | Roadmap checkboxes |

Brand: **Social Archiver / 社交存档**. Do not revive Media Harvester.
