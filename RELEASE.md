# 发版清单（本地 zip）

发给他人前按顺序勾选。版本号以 [`package.json`](package.json) 的 `version` 为准。

## 发版前

- [ ] 已更新 `package.json` 的 `version`，且 [`package-lock.json`](package-lock.json) 根项目版本一致
- [ ] 已更新 [`CHANGELOG.md`](CHANGELOG.md) 与 [`交接文档.md`](交接文档.md) 版本历史

## 构建

在项目根目录执行：

```bat
npm.cmd run release:pack
```

等价于：`release:check`（`npm test` + `npm run build`）通过后执行 `electron:build`。

`electron:build` 复用 `node_modules/electron/dist`，不重复从 GitHub 下 Electron；NSIS 等工具走 npmmirror 镜像（见 `scripts/electron-build.ps1`）。需先 `npm install` 装好 dev 依赖。

仅做自检、不打 zip：

```bat
npm.cmd run release:check
```

查看当前版本号：

```bat
npm.cmd run version:print
```

## 产物

`dist-electron/` 下：

- `SocialArchiver-<version>-win.zip` — 便携版（推荐分发）
- `SocialArchiver-<version>-win.exe` — NSIS 安装包
- `win-unpacked/` — 本机可直接运行（勿只拷贝 exe）

## 冒烟（建议）

- [ ] 解压 zip，运行 `Social Archiver.exe`
- [ ] 缓存：至少测一个平台（建议微博 + X 各一次）
- [ ] 浏览：存档概览 → 进入用户 → 月历 / 话题筛选
- [ ] 设置：检查更新、Cookie 检测或校验入口可打开

## 检查更新（路线 2）

应用内：**设置 → 关于与更新**。可填 `update_manifest_url` 指向静态 JSON（示例 [`scripts/update-manifest.example.json`](scripts/update-manifest.example.json)）：

```json
{
  "version": "1.2.2",
  "notesUrl": "https://你的站点/CHANGELOG.html",
  "zipUrl": "https://你的站点/SocialArchiver-1.2.2-win.zip"
}
```

发 zip 后把 manifest 里的 `version` / `zipUrl` 一并更新即可；无需 GitHub Releases。

## 代码签名（可选）

有 Authenticode 证书时见 [SIGNING.md](SIGNING.md)。无证书可继续发未签名 zip。

## 可选

```bat
git tag v<version>
```

本地 tag 即可，无需 push。
