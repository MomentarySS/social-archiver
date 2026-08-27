# Social Archiver / 社交存档

本机缓存微博、X 和 Instagram 的**原创**帖子（文字 + 图片/视频/实况），按源站时间线浏览，同一目录可增量更新。

微博浅色、X 深色、Instagram 浅色。浏览页像源站时间线，支持批量管理已存档用户；缓存成功会写 `{platform}/{user_id}/index.html`。窗口里播不了的视频可以调系统播放器打开。`Ctrl+1/2/3` 切换缓存 / 浏览 / 设置。

## 打开开发版

没有单独的开发版 exe。在项目目录执行：

```bat
cd /d D:\AI\work\social-archiver
npm.cmd install
pip install -r backend\requirements.txt
npm.cmd run electron:dev
```

PowerShell 必须用 `npm.cmd`，不要用 `npm`。成功后弹出标题为 **Social Archiver** 的窗口。关掉窗口只关界面；终端里 Ctrl+C 才停掉进程。

改 `electron-main.js` 或 `preload.js` 后要重启这个窗口。改 Vue 或 `backend/*.py` 不用为了热更新去重装。

## 打成 zip 发给别人

本机先有 Python，并装过运行依赖和打包依赖：

```bat
pip install -r backend\requirements.txt
pip install -r backend\requirements-build.txt
npm.cmd run electron:build
```

产物：

- `dist-electron\SocialArchiver-0.5.0-win.zip` — 解压后运行 `Social Archiver.exe`
- `dist-electron\win-unpacked\` — 同上，开发机可直接跑这一份，不必每次解压 zip

**不要只拷贝 exe**：必须保留整个 `win-unpacked` 目录（含 `resources\backend\backend.exe` 和 `_internal`）。打包版缓存日志已是 UTF-8 中文，不再乱码。

里面已经带了冻结后的 `backend.exe`（微博 + gallery-dl），对方不用装 Python。未签名 exe 可能触发 SmartScreen，选「仍要运行」即可。

开发仍用 `npm.cmd run electron:dev`，不要用 zip 里的 exe 做日常改代码。

改完代码可跑 `npm.cmd test`（28 个 Vitest 用例）和 `npm.cmd run build`（`vue-tsc` + Vite）做快速自检。

## 文档

| 文件 | 看什么 |
|------|--------|
| [交接文档.md](交接文档.md) | 开发说明、已测范围、微博/X 怎么拉、别踩的坑。人和 agent 都读这个。 |
| [PRODUCT.md](PRODUCT.md) | 产品边界（给设计工具用，不要当启动手册） |
| [DESIGN.md](DESIGN.md) | 微博浅色 / X 深色 / Instagram 浅色视觉规则（改界面时看） |
