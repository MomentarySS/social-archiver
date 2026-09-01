# Social Archiver / 社交存档

本机缓存微博、X 和 Instagram 的**原创**帖子（文字 + 图片/视频/实况），按源站时间线浏览，同一目录可增量更新。

统一浅色/深色阅读主题（默认浅色），帖子布局仍按平台区分。缓存页为**左表单、右日志**双栏；设置页**左常规配置、右维护与 Cookie**。浏览页默认进入「存档概览」；界面壳层采用分组面板与统一交互反馈。浏览页支持批量管理已存档用户；缓存成功会写 `{platform}/{user_id}/index.html`。顶栏可切换深色/浅色，离线页同步支持。窗口聚焦时 `Ctrl+1/2/3` 切换缓存 / 浏览 / 设置。

## 打开开发版

没有单独的开发版 exe。在项目目录执行：

```bat
cd /d D:\AI\work\social-archiver
npm.cmd install
pip install -r backend\requirements.txt
npm.cmd run electron:dev
```

PowerShell 必须用 `npm.cmd`，不要用 `npm`。成功后弹出标题为 **Social Archiver** 的窗口。关掉窗口只关界面；终端里 Ctrl+C 才停掉进程。

改 `electron-main.js`、`electron/**` 或 `preload.js` 后要重启这个窗口。改 Vue 或 `backend/*.py` 不用为了热更新去重装。`electron:dev` 会在启动前释放 5173 端口，避免连到旧 Vite 进程。

## 打成 zip 发给别人

**推荐**：先读 [RELEASE.md](RELEASE.md)，再跑一键发版（测试 + 前端构建 + 打包）：

```bat
pip install -r backend\requirements.txt
pip install -r backend\requirements-build.txt
npm.cmd run release:pack
```

仅自检、不打 zip：`npm.cmd run release:check`（`npm test` + `npm run build`）。

手动分步（与 `release:pack` 等价）：

```bat
npm.cmd run electron:build
```

产物（版本号见 `package.json` 的 `version`，当前 **1.2.2**）：

- `dist-electron\SocialArchiver-<version>-win.zip` — 便携 zip，解压即用
- `dist-electron\SocialArchiver-<version>-win.exe` — NSIS 安装包（开始菜单 + 卸载入口）
- `dist-electron\win-unpacked\` — 同上，开发机可直接跑这一份，不必每次解压 zip

**不要只拷贝 exe**：必须保留整个 `win-unpacked` 目录（含 `resources\backend\backend.exe` 和 `_internal`）。打包版缓存日志已是 UTF-8 中文，不再乱码。

里面已经带了冻结后的 `backend.exe`（微博 + gallery-dl），对方不用装 Python。

### Windows SmartScreen（未签名）

当前安装包与便携版**未做代码签名**。首次运行若出现「Windows 已保护你的电脑」：

1. 点 **更多信息**
2. 点 **仍要运行**

若需长期在企业环境部署，可向 CA 购买 Authenticode 证书后对 `electron-builder` 配置签名；详见 [SIGNING.md](SIGNING.md)。本仓库暂不捆绑证书。也可在组策略中为该 exe 添加路径排除项（需管理员权限）。

开发仍用 `npm.cmd run electron:dev`，不要用 zip 里的 exe 做日常改代码。

改完代码可跑 `npm.cmd test`（Vitest + Python unittest）和 `npm.cmd run build`（`vue-tsc` + Vite）做快速自检。

**浏览页（v1.1+）：** 默认进入「存档概览」（纯文字统计，不显示帖子缩略图），点选用户后才加载时间线；切 tab 回浏览也会回到概览。顶栏可按日期筛选帖子；进入用户后侧边栏有**月历导航**（按发帖日跳转）；顶栏 **#话题** 从正文提取并过滤。搜索命中会高亮；可导出 JSON / RSS / Markdown。设置页校验结果可跳转帖子；可修复微博损坏实况 mp4；缓存完成会写入 `update-log.jsonl`（可选系统通知）。**设置页可填代理地址**（如 `http://127.0.0.1:7890`），供 X / Instagram 缓存与应用内登录使用；留空则走系统代理。

**v1.2.0：** 设置页显示版本号并支持**检查更新**（可选 `update_manifest_url`，见 `scripts/update-manifest.example.json`）。批量缓存失败时**指数退避自动重试**（设置页可关）。打包版注入 Content-Security-Policy。

**v1.2.1：** 修复 X 换用户时仍用过期 `ct0`；失败日志显示真实退出码。Instagram 浏览卡分栏布局；Edge 一键导入 Cookie；IG/X 用户名规范化；离线 HTML 轮播修复。

**v1.2.2：** 切换任务不再因远端 Cookie 校验抖动重弹登录。进程内 30 分钟 Cookie 验证 TTL，缓存成功后免校验。Instagram 应用内登录分区不再盲覆盖已缓存的 `sessionid`；Edge 导入不再破坏同平台下其它账号的 per_user Cookie。

## 文档

| 文件 | 看什么 |
|------|--------|
| [交接文档.md](交接文档.md) | 开发说明、已测范围、微博/X 怎么拉、别踩的坑。人和 agent 都读这个。 |
| [CHANGELOG.md](CHANGELOG.md) | 用户向版本变更 |
| [RELEASE.md](RELEASE.md) | 本地发 zip 清单与 `release:pack` |
| [SIGNING.md](SIGNING.md) | 可选 Windows 代码签名 |
| [PRODUCT.md](PRODUCT.md) | 产品边界（给设计工具用，不要当启动手册） |
| [DESIGN.md](DESIGN.md) | 浅色/深色阅读主题与平台帖子布局规则（改界面时看） |
