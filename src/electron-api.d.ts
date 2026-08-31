export interface ElectronAPI {
  startDownload: (params: {
    platform: string
    userId: string
    cookie: string
    outputDir: string
    startDate?: string | null
    endDate?: string | null
    concurrent?: number
    namingTemplate?: string
    deepBacktrack?: boolean
    includeReplies?: boolean
    repliesMediaOnly?: boolean
    includeQuotes?: boolean
    includeQuoted?: boolean
    includeReels?: boolean
    includeStories?: boolean
    includeBookmarks?: boolean
    includeLikes?: boolean
  }) => Promise<{ success: boolean; error?: string }>
  stopDownload: () => Promise<unknown>
  isDownloading: () => Promise<boolean>
  selectOutputDir: () => Promise<string | null>
  getSettings: () => Promise<Settings>
  saveSettings: (settings: Partial<Settings>) => Promise<unknown>
  scanArchives: (outputDir: string) => Promise<UserEntry[]>
  getPosts: (userDir: string) => Promise<Post[]>
  getAllPosts: (outputDir: string) => Promise<Post[]>
  saveHtml: (params: {
    userDir: string
    html: string
    filename?: string
  }) => Promise<{ success: boolean; error?: string }>
  openFolder: (folderPath: string) => Promise<unknown>
  openLocalPath: (filePath: string) => Promise<{ success: boolean; error?: string }>
  assetUrl: (filePath: string) => Promise<string>
  openExternal: (url: string) => Promise<unknown>
  weiboLogin: () => Promise<{ success: boolean; cookie?: string; error?: string }>
  twitterLogin: () => Promise<{ success: boolean; cookie?: string; error?: string }>
  instagramLogin: () => Promise<{ success: boolean; cookie?: string; error?: string }>
  onDownloadEvent: (callback: (data: DownloadEvent) => void) => () => void
  onDownloadLog: (callback: (data: LogEvent) => void) => () => void
  onDownloadError: (callback: (data: ErrorResult) => void) => () => void
  // Batch download
  enqueueBatchDownload: (jobs: BatchJob[]) => Promise<{ success: boolean; queued: number; error?: string }>
  stopBatchDownload: () => Promise<void>
  getBatchStatus: () => Promise<BatchStatus>
  onBatchEvent: (callback: (data: BatchEvent) => void) => () => void
  // Archive management
  deleteArchives: (paths: string[], rootDir?: string) => Promise<{ success: string[]; failed: string[] }>
  getUserLastUpdate: (userDir: string) => Promise<string | null>
  searchArchives: (params: { outputDir: string; query: string; rebuild?: boolean }) => Promise<SearchResult>
  rebuildSearchIndex: (outputDir: string) => Promise<{ success: boolean; count?: number; error?: string }>
  verifyArchives: (params: { outputDir: string; platform?: string; userId?: string }) => Promise<VerifyResult>
  checkCookie: (params: { platform: string; cookie: string }) => Promise<CookieCheckResult>
  getPortableInfo: () => Promise<PortableInfo>
  getUserStats: (userDir: string) => Promise<UserStats | null>
  getArchiveStats: (outputDir: string) => Promise<ArchiveStats>
  exportMarkdown: (params: { userDir: string; destDir?: string }) => Promise<ExportMarkdownResult>
  exportRss: (params: { userDir: string; destPath?: string }) => Promise<ExportRssResult>
  exportJson: (params: { userDir: string; destPath?: string }) => Promise<ExportJsonResult>
  repairWeiboMedia: (params: { outputDir: string; platform?: string; userId?: string }) => Promise<RepairResult>
  probeFfmpeg: () => Promise<FfmpegProbeResult>
  transcodeArchives: (params: { outputDir: string; platform?: string; userId?: string }) => Promise<TranscodeResult>
  generatePosters: (params: { outputDir: string; platform?: string; userId?: string }) => Promise<PosterResult>
}

export interface Settings {
  output_dir?: string
  concurrent?: number
  naming_template?: string
  proxy_url?: string
  last_platform?: string
  cookies?: Record<string, string> & {
    per_user?: Record<string, string>
  }
  scheduler?: SchedulerSettings
  user_schedules?: Record<string, UserScheduleMode>
  user_last_scheduled?: Record<string, string>
  ffmpeg?: FfmpegSettings
  notifications?: NotificationSettings
}

export interface FfmpegSettings {
  enabled?: boolean
}

export interface NotificationSettings {
  enabled?: boolean
}

export type UserScheduleMode = 'manual' | 'daily' | 'weekly'

export interface SchedulerSettings {
  enabled?: boolean
  interval_hours?: number
  run_at?: string
  last_run?: string
}

export interface Pic {
  index?: number
  filename?: string
  date_folder?: string
  abs_path?: string
  original_url?: string
  type?: string
  video_filename?: string
  video_url?: string
  video_abs_path?: string
  playback_filename?: string
  playback_abs_path?: string
  video_playback_filename?: string
  video_playback_abs_path?: string
  poster_filename?: string
  poster_abs_path?: string
}

export interface Post {
  id?: string
  platform?: string
  user_id?: string
  user_name?: string
  screen_name?: string
  text?: string
  created_at?: string
  date?: string
  url?: string
  source?: string
  verified?: boolean
  avatar_path?: string
  likes?: number
  comments?: number
  reposts?: number
  original?: boolean
  kind?: string
  in_reply_to_id?: string
  in_reply_to_user?: string
  quoted_from_id?: string
  quoted_from_user?: string
  pinned?: boolean
  carousel_count?: number
  post_shortcode?: string
  _archiveUserDir?: string
  _archiveUserLabel?: string
  pics?: Pic[]
}

export interface UserEntry {
  name: string
  path: string
  platform?: string
  displayName?: string
  avatar?: string
  lastUpdate?: string
}

// Discriminated union for the download:event IPC channel
export type ProgressEvent = { type: 'progress'; file: string; percent: number; current: number; total: number }
export type DoneResult    = { type: 'done';    count: number; skipped: number; posts: number; fetch_status?: string; output_dir?: string; userDir?: string; cookie?: string }
export type ErrorResult   = { type: 'error';  msg: string }
export type StatusEvent   = { type: 'status'; msg: string }
export type DownloadEvent = ProgressEvent | DoneResult | ErrorResult | StatusEvent

export interface LogEvent {
  msg?: string
}

// Batch download types
export interface BatchJob {
  platform: string
  userId: string
  cookie: string
  outputDir: string
  concurrent: number
  namingTemplate: string
  startDate?: string | null
  endDate?: string | null
  deepBacktrack?: boolean
  includeReplies?: boolean
  repliesMediaOnly?: boolean
  includeQuotes?: boolean
  includeQuoted?: boolean
  includeReels?: boolean
  includeStories?: boolean
}

export interface BatchStatus {
  queued: number
  running: boolean
  currentUserId?: string
  currentPlatform?: string
}

export interface BatchEvent {
  type: 'user-start' | 'user-progress' | 'user-done' | 'user-error' | 'batch-done' | 'batch-stopped' | 'done' | 'error' | 'progress' | 'status'
  userId?: string
  platform?: string
  msg?: string
  file?: string
  percent?: number
  current?: number
  total?: number
  count?: number
  skipped?: number
  posts?: number
  output_dir?: string
  userDir?: string
  queued?: number
}

export interface UserProfile {
  name?: string
  screen_name?: string
  platform?: string
  displayName?: string
  avatar?: string
  lastUpdate?: string
  fetchStatus?: string
  lastSinceId?: string
  lastPage?: number
}

export interface SearchHit {
  userDir: string
  platform: string
  userId: string
  userName: string
  postId: string
  created_at: string
  snippet: string
}

export interface SearchResult {
  hits: SearchHit[]
  total: number
  query?: string
  error?: string
}

export interface VerifyIssue {
  type: 'missing_media' | 'corrupt_media' | 'bad_json'
  post_id?: string
  file?: string
  path?: string
  message?: string
  user_dir?: string
  platform?: string
  user_id?: string
}

export interface VerifySummary {
  type: 'summary'
  user_dir?: string
  post_count?: number
  issue_count?: number
  ok?: boolean
  msg?: string
}

export interface VerifyResult {
  success: boolean
  error?: string
  issues: VerifyIssue[]
  summaries?: VerifySummary[]
  events?: Array<Record<string, unknown>>
}

export interface CookieCheckResult {
  valid: boolean
  message: string
}

export interface PortableInfo {
  portable: boolean
  settingsPath: string
  dataDir: string
}

export interface UserStats {
  userDir: string
  postCount: number
  mediaCount: number
  mediaBytes: number
  earliestDate: string
  latestDate: string
  lastUpdate: string
  fetchStatus?: string
}

export interface ArchiveStats {
  users: UserStats[]
  totalPosts: number
  totalMedia: number
  totalBytes: number
  totalBytesLabel: string
}

export interface ExportMarkdownResult {
  success: boolean
  count?: number
  destDir?: string
  error?: string
}

export interface ExportRssResult {
  success: boolean
  count?: number
  destPath?: string
  error?: string
}

export interface ExportJsonResult {
  success: boolean
  count?: number
  destPath?: string
  error?: string
}

export interface RepairSummary {
  type: 'summary'
  user_dir?: string
  removed_count?: number
  ok?: boolean
  msg?: string
}

export interface RepairResult {
  success: boolean
  error?: string
  events?: Array<Record<string, unknown>>
  summaries?: RepairSummary[]
}

export interface FfmpegProbeResult {
  available: boolean
  path?: string
  version?: string
  error?: string
}

export interface TranscodeSummary {
  type: 'summary'
  user_dir?: string
  output_dir?: string
  target_count?: number
  transcoded?: number
  skipped?: number
  failed?: number
  ok?: boolean
}

export interface TranscodeResult {
  success: boolean
  error?: string
  summaries?: TranscodeSummary[]
  events?: Array<Record<string, unknown>>
}

export interface PosterSummary {
  type: 'summary'
  user_dir?: string
  output_dir?: string
  target_count?: number
  generated?: number
  skipped?: number
  failed?: number
  ok?: boolean
}

export interface PosterResult {
  success: boolean
  error?: string
  summaries?: PosterSummary[]
  events?: Array<Record<string, unknown>>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
