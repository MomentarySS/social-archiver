<template>
  <div class="sa-sheet">
    <div class="sa-page">
      <h2>设置</h2>
      <p class="lede">默认目录和下载参数会记住。缓存时仍可临时换目录。</p>

      <label class="sa-field">
        <span>默认下载目录</span>
        <div class="sa-row">
          <input class="sa-input" :value="settings.output_dir" readonly placeholder="选择下载目录" />
          <button class="sa-btn sa-btn-ghost" type="button" @click="selectDir">选择</button>
        </div>
      </label>

      <label class="sa-field">
        <span>并发数</span>
        <input
          class="sa-input"
          type="number"
          min="1"
          max="10"
          v-model.number="settings.concurrent"
        />
      </label>

      <label class="sa-field">
        <span>文件命名</span>
        <input
          class="sa-input"
          v-model="settings.naming_template"
          placeholder="{post_id}_{index}"
        />
        <p class="sa-help">可用 {post_id}、{user_id}、{date}、{index}。默认可避免同日重名。</p>
      </label>

      <button class="sa-btn sa-btn-primary" type="button" :disabled="saving" @click="saveSettings">
        {{ saving ? '保存中…' : '保存设置' }}
      </button>

      <p v-if="portableInfo?.portable" class="sa-help portable-hint">
        便携模式已启用。配置保存在：{{ portableInfo.settingsPath }}
      </p>

      <hr class="sa-rule" />

      <h3 class="section-heading">定时更新</h3>
      <p class="lede section-lede">应用开着时，到点自动批量更新设为「每日 / 每周」的用户。</p>
      <label class="sa-field sa-check">
        <input type="checkbox" v-model="schedulerEnabled" />
        <span>启用定时更新</span>
      </label>
      <label class="sa-field">
        <span>每天运行时刻</span>
        <input class="sa-input" type="time" v-model="schedulerRunAt" />
      </label>
      <p class="sa-help">在浏览页用户管理里为每个账号设置「每日 / 每周 / 手动」。</p>

      <hr class="sa-rule" />

      <h3 class="section-heading">视频转码</h3>
      <p class="lede section-lede">
        微博实况等 HEVC 视频在应用窗口内无法播放。安装 ffmpeg 后可一键转为 H.264，原文件保留，生成 <code>{原名}_h264.mp4</code>。
      </p>
      <p class="sa-help ffmpeg-status" :class="ffmpegProbe?.available ? 'ok' : 'warn'">
        {{ ffmpegStatusText }}
      </p>
      <label class="sa-field sa-check">
        <input type="checkbox" v-model="ffmpegEnabled" :disabled="!ffmpegProbe?.available" />
        <span>启用视频转码功能</span>
      </label>
      <div class="sa-row">
        <button
          class="sa-btn sa-btn-ghost"
          type="button"
          :disabled="probingFfmpeg"
          @click="refreshFfmpegProbe"
        >
          {{ probingFfmpeg ? '检测中…' : '重新检测 ffmpeg' }}
        </button>
        <button
          class="sa-btn sa-btn-ghost"
          type="button"
          :disabled="transcoding || !ffmpegProbe?.available || !settings.output_dir"
          @click="runTranscode"
        >
          {{ transcoding ? '转码中…' : '转码无法播放的视频' }}
        </button>
        <button
          class="sa-btn sa-btn-ghost"
          type="button"
          :disabled="generatingPosters || !ffmpegProbe?.available || !settings.output_dir"
          @click="runGeneratePosters"
        >
          {{ generatingPosters ? '生成中…' : '生成视频封面' }}
        </button>
      </div>
      <p v-if="transcodeSummary" class="verify-summary" :class="transcodeSummary.ok ? 'ok' : 'warn'">
        {{ transcodeSummary.text }}
      </p>
      <p v-if="posterSummary" class="verify-summary" :class="posterSummary.ok ? 'ok' : 'warn'">
        {{ posterSummary.text }}
      </p>

      <hr class="sa-rule" />

      <h3 class="section-heading">存档校验</h3>
      <p class="lede section-lede">检查帖子 JSON 引用的媒体是否缺失或损坏。</p>
      <div class="sa-row">
        <button class="sa-btn sa-btn-ghost" type="button" :disabled="verifying" @click="runVerify">
          {{ verifying ? '校验中…' : '校验全部存档' }}
        </button>
        <button class="sa-btn sa-btn-ghost" type="button" :disabled="rebuildingIndex" @click="rebuildIndex">
          {{ rebuildingIndex ? '重建中…' : '重建搜索索引' }}
        </button>
      </div>
      <p v-if="verifySummary" class="verify-summary" :class="verifySummary.ok ? 'ok' : 'warn'">
        {{ verifySummary.text }}
      </p>
      <ul v-if="verifyIssues.length" class="verify-issues">
        <li v-for="(issue, idx) in verifyIssues.slice(0, 20)" :key="idx" class="verify-issue-row">
          <span class="verify-issue-text">{{ issueLabel(issue) }}</span>
          <span class="verify-issue-actions">
            <button
              v-if="issue.user_dir && issue.post_id"
              class="sa-btn sa-btn-ghost"
              type="button"
              @click="openIssuePost(issue)"
            >查看</button>
            <button
              v-if="issue.platform && issue.user_id"
              class="sa-btn sa-btn-ghost"
              type="button"
              @click="updateIssueUser(issue)"
            >更新用户</button>
          </span>
        </li>
        <li v-if="verifyIssues.length > 20">…还有 {{ verifyIssues.length - 20 }} 项</li>
      </ul>

      <hr class="sa-rule" />

      <h3 class="section-heading">微博实况修复</h3>
      <p class="lede section-lede">检测并删除损坏的实况 mp4（过小或无 ftyp），之后到浏览页点「更新」可重新拉取。</p>
      <div class="sa-row">
        <button class="sa-btn sa-btn-ghost" type="button" :disabled="repairing" @click="runRepairWeibo">
          {{ repairing ? '修复中…' : '修复微博损坏实况' }}
        </button>
      </div>
      <p v-if="repairSummary" class="verify-summary" :class="repairSummary.ok ? 'ok' : 'warn'">
        {{ repairSummary.text }}
      </p>

      <hr class="sa-rule" />

      <h3 class="section-heading">通知</h3>
      <label class="sa-field sa-check">
        <input type="checkbox" v-model="notificationsEnabled" />
        <span>缓存完成时显示系统通知（批量完成 / 单用户完成）</span>
      </label>
      <p class="sa-help">更新记录写入存档目录 <code>update-log.jsonl</code>。</p>

      <hr class="sa-rule" />

      <h3 class="cookie-heading">登录 Cookie</h3>
      <p class="lede cookie-lede">只留本机。过期后点重新登录，不必回到缓存页。</p>
      <div class="sa-row cookie-check-row">
        <button class="sa-btn sa-btn-ghost" type="button" :disabled="checkingCookies" @click="checkAllCookies">
          {{ checkingCookies ? '检测中…' : '检测全部 Cookie' }}
        </button>
      </div>

      <div v-for="row in platformRows" :key="row.key" class="cookie-row">
        <div class="cookie-meta">
          <span class="cookie-name">{{ row.label }}</span>
          <span class="cookie-mask" :class="cookieStatusClass(row.platform)">
            {{ cookieStatusText(row) }}
          </span>
        </div>
        <div class="cookie-actions">
          <button
            class="sa-btn sa-btn-ghost"
            type="button"
            :disabled="loggingKey === row.key"
            @click="reloginPlatform(row.platform)"
          >{{ loggingKey === row.key ? '登录中…' : '重新登录' }}</button>
          <button
            class="sa-btn sa-btn-danger"
            type="button"
            :disabled="!row.value"
            @click="clearPlatform(row.platform)"
          >清除</button>
        </div>
      </div>

      <div v-if="userRows.length" class="cookie-users">
        <p class="sa-help">按用户保存的 Cookie</p>
        <div v-for="row in userRows" :key="row.key" class="cookie-row">
          <div class="cookie-meta">
            <span class="cookie-name">{{ row.label }}</span>
            <span class="cookie-mask ok">{{ maskCookie(row.value) }}</span>
          </div>
          <div class="cookie-actions">
            <button class="sa-btn sa-btn-danger" type="button" @click="clearUser(row.platform, row.userId)">
              清除
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useToast } from '../composables/useToast'
import {
  cookieInventory,
  clearPlatformCookie,
  clearUserCookie,
  maskCookie,
  savePlatformCookie,
} from '../utils/session.js'
import type { CookieCheckResult, FfmpegProbeResult, PortableInfo, RepairResult, Settings, VerifyIssue } from '../electron-api.d.ts'
import { requestOpenPost } from '../utils/navBus.ts'
import { cookieForUser, hasUsableCookie } from '../utils/session.js'

const settings = ref<Settings>({
  output_dir: '',
  concurrent: 3,
  naming_template: '{post_id}_{index}',
  scheduler: { enabled: false, run_at: '03:00' },
  ffmpeg: { enabled: false },
  notifications: { enabled: true },
})
const saving = ref(false)
const loggingKey = ref('')
const verifying = ref(false)
const rebuildingIndex = ref(false)
const checkingCookies = ref(false)
const probingFfmpeg = ref(false)
const transcoding = ref(false)
const generatingPosters = ref(false)
const portableInfo = ref<PortableInfo | null>(null)
const ffmpegProbe = ref<FfmpegProbeResult | null>(null)
const transcodeSummary = ref<{ ok: boolean; text: string } | null>(null)
const posterSummary = ref<{ ok: boolean; text: string } | null>(null)
const verifyIssues = ref<VerifyIssue[]>([])
const verifySummary = ref<{ ok: boolean; text: string } | null>(null)
const repairing = ref(false)
const repairSummary = ref<{ ok: boolean; text: string } | null>(null)
const cookieStatus = ref<Record<string, CookieCheckResult>>({})
const toast = useToast()

const platformRows = computed(() => cookieInventory(settings.value).platformRows)
const userRows = computed(() => cookieInventory(settings.value).userRows)
const schedulerEnabled = computed({
  get: () => Boolean(settings.value.scheduler?.enabled),
  set: (value: boolean) => {
    settings.value.scheduler = { ...(settings.value.scheduler || {}), enabled: value }
  },
})
const schedulerRunAt = computed({
  get: () => settings.value.scheduler?.run_at || '03:00',
  set: (value: string) => {
    settings.value.scheduler = { ...(settings.value.scheduler || {}), run_at: value || '03:00' }
  },
})
const ffmpegEnabled = computed({
  get: () => Boolean(settings.value.ffmpeg?.enabled),
  set: (value: boolean) => {
    settings.value.ffmpeg = { ...(settings.value.ffmpeg || {}), enabled: value }
  },
})
const notificationsEnabled = computed({
  get: () => settings.value.notifications?.enabled !== false,
  set: (value: boolean) => {
    settings.value.notifications = { ...(settings.value.notifications || {}), enabled: value }
  },
})
const ffmpegStatusText = computed(() => {
  if (!ffmpegProbe.value) return '尚未检测 ffmpeg'
  if (ffmpegProbe.value.available) {
    return `已检测到 ffmpeg：${ffmpegProbe.value.version || ffmpegProbe.value.path || '可用'}`
  }
  return ffmpegProbe.value.error || '未检测到 ffmpeg，请安装后将其加入系统 PATH'
})

onMounted(async () => {
  await loadSettings()
  if (window.electronAPI) {
    portableInfo.value = await window.electronAPI.getPortableInfo()
    await refreshFfmpegProbe()
  }
})

async function loadSettings() {
  try {
    if (window.electronAPI) {
      const s = await window.electronAPI.getSettings()
      settings.value = {
        ...settings.value,
        ...s,
        scheduler: {
          enabled: false,
          run_at: '03:00',
          ...(s.scheduler || {}),
        },
        ffmpeg: {
          enabled: false,
          ...(s.ffmpeg || {}),
        },
        notifications: {
          enabled: true,
          ...(s.notifications || {}),
        },
      }
    }
  } catch (e) {
    console.error('加载设置失败:', e)
  }
}

async function selectDir() {
  try {
    if (window.electronAPI) {
      const selected = await window.electronAPI.selectOutputDir()
      if (selected) {
        settings.value.output_dir = selected
      }
    }
  } catch (e) {
    console.error('选择目录失败:', e)
    toast.error('打开目录选择器失败')
  }
}

async function saveSettings() {
  saving.value = true
  try {
    if (window.electronAPI) {
      await window.electronAPI.saveSettings({
        output_dir: settings.value.output_dir,
        concurrent: settings.value.concurrent,
        naming_template: settings.value.naming_template,
        scheduler: settings.value.scheduler,
        ffmpeg: settings.value.ffmpeg,
        notifications: settings.value.notifications,
      })
      toast.success('设置已保存')
    }
  } catch (e) {
    toast.error('保存设置失败')
  } finally {
    saving.value = false
  }
}

async function reloginPlatform(platform: string) {
  if (!window.electronAPI) return
  loggingKey.value = platform
  try {
    let res
    if (platform === 'twitter') res = await window.electronAPI.twitterLogin()
    else if (platform === 'instagram') res = await window.electronAPI.instagramLogin()
    else res = await window.electronAPI.weiboLogin()
    if (!res.success || !res.cookie) {
      toast.error(res.error || '登录失败')
      return
    }
    await savePlatformCookie(platform, res.cookie)
    await loadSettings()
    toast.success('Cookie 已更新')
  } catch (e) {
    toast.error('登录失败')
  } finally {
    loggingKey.value = ''
  }
}

async function clearPlatform(platform: string) {
  await clearPlatformCookie(platform)
  await loadSettings()
  toast.success('已清除')
}

async function clearUser(platform: string, userId: string) {
  await clearUserCookie(platform, userId)
  await loadSettings()
  toast.success('已清除')
}

function cookieStatusClass(platform: string) {
  const status = cookieStatus.value[platform]
  if (!status) return 'miss'
  return status.valid ? 'ok' : 'warn'
}

function cookieStatusText(row: { platform: string; value?: string }) {
  const status = cookieStatus.value[row.platform]
  if (status) return status.message
  if (row.value) return maskCookie(row.value)
  return '未保存'
}

async function checkAllCookies() {
  if (!window.electronAPI) return
  checkingCookies.value = true
  const next: Record<string, CookieCheckResult> = {}
  try {
    for (const row of platformRows.value) {
      if (!row.value) {
        next[row.platform] = { valid: false, message: '未保存' }
        continue
      }
      next[row.platform] = await window.electronAPI.checkCookie({
        platform: row.platform,
        cookie: row.value,
      })
    }
    cookieStatus.value = next
    const bad = Object.values(next).filter((item) => !item.valid).length
    if (bad) toast.warning(`有 ${bad} 个平台 Cookie 需要更新`)
    else toast.success('全部 Cookie 有效')
  } catch (e) {
    toast.error('Cookie 检测失败')
  } finally {
    checkingCookies.value = false
  }
}

async function refreshFfmpegProbe() {
  if (!window.electronAPI) return
  probingFfmpeg.value = true
  try {
    ffmpegProbe.value = await window.electronAPI.probeFfmpeg()
  } catch (e) {
    ffmpegProbe.value = { available: false, error: '检测失败' }
  } finally {
    probingFfmpeg.value = false
  }
}

async function runTranscode() {
  if (!window.electronAPI || !settings.value.output_dir) {
    toast.warning('请先选择默认下载目录')
    return
  }
  transcoding.value = true
  transcodeSummary.value = null
  try {
    const result = await window.electronAPI.transcodeArchives({
      outputDir: settings.value.output_dir,
    })
    const summaries = result.summaries || []
    const transcoded = summaries.reduce((sum, item) => sum + Number(item.transcoded || 0), 0)
    const failed = summaries.reduce((sum, item) => sum + Number(item.failed || 0), 0)
    const skipped = summaries.reduce((sum, item) => sum + Number(item.skipped || 0), 0)
    if (!result.success) {
      transcodeSummary.value = {
        ok: false,
        text: result.error || `转码完成，但有 ${failed} 个失败（成功 ${transcoded}，跳过 ${skipped}）`,
      }
      toast.error(result.error || '部分视频转码失败')
      return
    }
    transcodeSummary.value = {
      ok: true,
      text: `转码完成：成功 ${transcoded}，跳过 ${skipped}`,
    }
    toast.success('转码完成')
  } catch (e) {
    transcodeSummary.value = { ok: false, text: '转码失败' }
    toast.error('转码失败')
  } finally {
    transcoding.value = false
  }
}

async function runGeneratePosters() {
  if (!window.electronAPI || !settings.value.output_dir) {
    toast.warning('请先选择默认下载目录')
    return
  }
  generatingPosters.value = true
  posterSummary.value = null
  try {
    const result = await window.electronAPI.generatePosters({
      outputDir: settings.value.output_dir,
    })
    const summaries = result.summaries || []
    const generated = summaries.reduce((sum, item) => sum + Number(item.generated || 0), 0)
    const failed = summaries.reduce((sum, item) => sum + Number(item.failed || 0), 0)
    const skipped = summaries.reduce((sum, item) => sum + Number(item.skipped || 0), 0)
    if (!result.success) {
      posterSummary.value = {
        ok: false,
        text: result.error || `封面生成完成，但有 ${failed} 个失败（成功 ${generated}，跳过 ${skipped}）`,
      }
      toast.error(result.error || '部分视频封面生成失败')
      return
    }
    posterSummary.value = {
      ok: true,
      text: `封面生成完成：成功 ${generated}，跳过 ${skipped}`,
    }
    toast.success('封面生成完成')
  } catch (e) {
    posterSummary.value = { ok: false, text: '封面生成失败' }
    toast.error('封面生成失败')
  } finally {
    generatingPosters.value = false
  }
}

async function runVerify() {
  if (!window.electronAPI || !settings.value.output_dir) {
    toast.warning('请先设置默认下载目录')
    return
  }
  verifying.value = true
  verifyIssues.value = []
  verifySummary.value = null
  try {
    const res = await window.electronAPI.verifyArchives({ outputDir: settings.value.output_dir })
    verifyIssues.value = res.issues || []
    const totalIssues = verifyIssues.value.length
    const summaries = res.summaries || []
    const postCount = summaries.reduce((sum, item) => sum + (item.post_count || 0), 0)
    if (!res.success && res.error) {
      verifySummary.value = { ok: false, text: res.error }
      toast.error(res.error)
      return
    }
    verifySummary.value = {
      ok: totalIssues === 0,
      text: totalIssues
        ? `共检查 ${postCount} 帖，发现 ${totalIssues} 个问题`
        : `共检查 ${postCount} 帖，未发现缺失或损坏媒体`,
    }
    if (totalIssues === 0) toast.success('校验通过')
    else toast.warning(`发现 ${totalIssues} 个问题`)
  } catch (e) {
    toast.error('校验失败')
  } finally {
    verifying.value = false
  }
}

function issueLabel(issue: VerifyIssue) {
  const who = issue.user_id ? `${issue.platform || '存档'}/${issue.user_id}` : '存档'
  return `${who} · ${issue.post_id || '?'} · ${issue.file || issue.message || issue.type}`
}

function openIssuePost(issue: VerifyIssue) {
  if (!issue.user_dir || !issue.post_id) return
  requestOpenPost({ userDir: issue.user_dir, postId: issue.post_id })
}

async function updateIssueUser(issue: VerifyIssue) {
  if (!window.electronAPI || !issue.platform || !issue.user_id || !settings.value.output_dir) return
  const cookie = cookieForUser(settings.value, issue.platform, issue.user_id)
  if (!hasUsableCookie(issue.platform, cookie)) {
    toast.warning('该用户缺少 Cookie，请先在下方登录')
    return
  }
  if (await window.electronAPI.isDownloading()) {
    toast.warning('已有缓存任务进行中')
    return
  }
  const res = await window.electronAPI.startDownload({
    platform: issue.platform,
    userId: issue.user_id,
    cookie,
    outputDir: settings.value.output_dir,
    concurrent: settings.value.concurrent,
    namingTemplate: settings.value.naming_template,
  })
  if (res.success) toast.info(`已开始更新 ${issue.platform}/${issue.user_id}`)
  else toast.error(res.error || '无法开始更新')
}

async function runRepairWeibo() {
  if (!window.electronAPI || !settings.value.output_dir) {
    toast.warning('请先设置默认下载目录')
    return
  }
  repairing.value = true
  repairSummary.value = null
  try {
    const result: RepairResult = await window.electronAPI.repairWeiboMedia({
      outputDir: settings.value.output_dir,
    })
    const removed = (result.summaries || []).reduce(
      (sum, item) => sum + Number(item.removed_count || 0),
      0,
    )
    if (!result.success) {
      repairSummary.value = {
        ok: false,
        text: result.error || `修复失败（已删除 ${removed} 个文件）`,
      }
      toast.error(result.error || '修复失败')
      return
    }
    repairSummary.value = {
      ok: true,
      text: removed
        ? `已删除 ${removed} 个损坏实况 mp4，请到浏览页更新对应用户`
        : '未发现需要删除的损坏实况 mp4',
    }
    toast.success(removed ? `已删除 ${removed} 个损坏文件` : '没有损坏文件')
  } catch (e) {
    repairSummary.value = { ok: false, text: '修复失败' }
    toast.error('修复失败')
  } finally {
    repairing.value = false
  }
}

async function rebuildIndex() {
  if (!window.electronAPI || !settings.value.output_dir) {
    toast.warning('请先设置默认下载目录')
    return
  }
  rebuildingIndex.value = true
  try {
    const res = await window.electronAPI.rebuildSearchIndex(settings.value.output_dir)
    if (res.success) toast.success(`搜索索引已重建（${res.count || 0} 帖）`)
    else toast.error(res.error || '重建失败')
  } catch (e) {
    toast.error('重建失败')
  } finally {
    rebuildingIndex.value = false
  }
}
</script>

<style scoped>
.cookie-heading,
.section-heading {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 700;
}

.section-lede {
  margin-bottom: 12px;
}

.cookie-check-row {
  margin-bottom: 8px;
}

.verify-summary {
  margin-top: 10px;
  font-size: 13px;
}

.verify-summary.ok {
  color: var(--sa-ok);
}

.verify-summary.warn {
  color: var(--sa-danger);
}

.ffmpeg-status.ok {
  color: var(--sa-ok);
}

.ffmpeg-status.warn {
  color: var(--sa-danger);
}

.verify-issues {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 12px;
  color: var(--sa-muted);
  line-height: 1.6;
}

.verify-issue-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
  list-style: none;
  margin-left: -18px;
}

.verify-issue-text {
  min-width: 0;
  flex: 1;
}

.verify-issue-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.verify-issue-actions .sa-btn {
  height: 28px;
  padding: 0 10px;
  font-size: 12px;
}

.cookie-mask.warn {
  color: var(--sa-danger);
}

.sa-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.portable-hint {
  margin-top: 10px;
  word-break: break-all;
}

.cookie-lede {
  margin-bottom: 12px;
}

.cookie-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--sa-hairline);
}

.cookie-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cookie-name {
  font-size: 13px;
  font-weight: 700;
}

.cookie-mask {
  font-size: 12px;
  font-family: ui-monospace, Consolas, monospace;
  color: var(--sa-muted);
}

.cookie-mask.ok {
  color: var(--sa-ok);
}

.cookie-mask.miss {
  color: var(--sa-muted);
}

.cookie-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.cookie-users {
  margin-top: 8px;
}
</style>
