## 批量多用户管理面板 — 完整实现计划

### 核心功能

1. **用户管理列表**：显示目录下所有已存档用户，显示平台图标、上次更新时间、存档路径
2. **新增用户**：在列表里直接填用户 ID、选平台、粘贴 Cookie，添加后立即开始缓存
3. **选择性批量更新**：勾选多个用户，一键批量缓存（串行队列）
4. **删除存档**：勾选删除本地存档目录
5. **按用户独立存储 Cookie**：不再只有全局 per-platform Cookie，改为 per-(platform+userId) Cookie

---

### 实现方案

#### 1. 新增 `UserManager` 组件（`src/components/UserManager.vue`）

放在 BrowseView 左侧或顶部，作为一个可折叠面板：

```
┌─ 用户管理 ──────────────────────────── [添加用户]
│ ☑ weibo/123456  张三        2小时前   [更新] [删除]
│ ☑ twitter/amd   AMD         昨天     [更新] [删除]
│ ☐ instagram/jane  Jane       3天前    [更新] [删除]
│ ─────────────────────────────────────
│ 已选择 2 个  [批量更新]  [批量删除]
└──────────────────────────────────────
```

- 列表数据来自 `scanArchives()` 结果，追加 `_profile.json` 里的 `lastUpdate` 时间戳
- 每个用户独立存储 Cookie（在 `settings.json` 里按 `cookies.{platform}.{userId}` 存取）
- 添加用户：表单含 platform selector + userId input + cookie textarea，提交后立即 startDownload

#### 2. `settings.json` 扩展：按用户的 Cookie

```json
{
  "output_dir": "D:/archives",
  "concurrent": 3,
  "last_platform": "twitter",
  "cookies": {
    "weibo": { "global": "..." },           // 现有：全局微博 Cookie
    "twitter": { "global": "..." },         // 现有：全局 X Cookie
    "instagram": { "global": "..." },       // 现有：全局 IG Cookie
    "per_user": {                             // 新增：按用户的 Cookie
      "weibo:123456": "...",
      "twitter:amd": "...",
      "instagram:jane": "..."
    }
  }
}
```

#### 3. `session.js` 新增 `userCookieKey()` 函数

```javascript
export function userCookieKey(platform, userId) {
  return `${platform}:${userId}`
}

export function cookieForUser(settings, platform, userId) {
  const perUser = settings.cookies?.per_user?.[userCookieKey(platform, userId)]
  if (perUser) return perUser
  return cookieForPlatform(settings, platform) // 回退到全局 Cookie
}
```

#### 4. 新增 IPC 通道

| 通道 | 用途 |
|------|------|
| `enqueue-batch-download` | 将多个用户加入下载队列 |
| `stop-batch-download` | 停止队列 |
| `get-batch-status` | 查询队列状态（排队数、当前用户） |
| `delete-archives` | 删除指定用户的存档目录 |
| `get-user-cookie` | 读取指定用户的 Cookie |
| `save-user-cookie` | 保存指定用户的 Cookie |
| `get-user-lastupdate` | 读取用户最后更新时间 |

#### 5. `BrowseView.vue` 改造

- 左侧/顶部放 `UserManager` 组件（默认展开）
- 右侧保留现有 post 时间线
- `selectedUser` 仍控制右侧显示哪个用户的帖子（点击列表某行可切换）
- 批量更新时右侧时间线保持显示当前选中用户，不切换

#### 6. 批量队列（`electron-main.js`）

```
downloadQueue: [{ platform, userId, cookie, outputDir, concurrent, namingTemplate }, ...]
currentDownload: null | { userId, process }
isQueueRunning: boolean
```

- `enqueue-batch-download` 将用户加入队列，若未在运行则调用 `processQueue()`
- `processQueue()` 串行执行，stdout/stderr 事件透传到 `batch:event`
- 每个用户完成时调用 `refreshCurrentArchive(userDir)` 更新存档
- 所有用户完成后发送 `batch:done`

#### 7. `_profile.json` 增加 `lastUpdate` 字段

在 backend 的 `done` 事件后，由 electron-main 在 `batch:event { type: 'user-done' }` 时写入 `_profile.json`：

```json
{
  "name": "someuser",
  "platform": "instagram",
  "lastUpdate": "2026-08-27T15:30:00+08:00"
}
```

---

### 修改文件清单

| 文件 | 改动量 |
|------|--------|
| `src/components/UserManager.vue` | 新增（~300行） |
| `src/views/BrowseView.vue` | 中等改动：整合 UserManager、批量事件监听 |
| `src/utils/session.js` | 新增 `userCookieKey()`、`cookieForUser()` |
| `src/electron-api.d.ts` | 新增 `UserManager` 类型、`onBatchEvent` 等 |
| `electron-main.js` | 新增队列状态、6个 IPC handlers |
| `preload.js` | 暴露新 IPC 通道 |
| `backend/metadata.py` | `_profile.json` 追加 `lastUpdate` 字段 |

---

### 不包含在本次（scope 外）

- 并行下载多个用户（始终串行，避免 IP 限流）
- 定时自动批量更新
- 多选后的"移动到其他目录"等高级管理
