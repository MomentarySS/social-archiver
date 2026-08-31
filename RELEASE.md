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
- [ ] 浏览：存档概览 → 进入用户 → 返回概览
- [ ] 设置：保存、Cookie 检测或校验入口可打开

## 可选

```bat
git tag v<version>
```

本地 tag 即可，无需 push。
