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
  }) => Promise<{ success: boolean; error?: string }>
  stopDownload: () => Promise<unknown>
  isDownloading: () => Promise<boolean>
  selectOutputDir: () => Promise<string | null>
  getSettings: () => Promise<Settings>
  saveSettings: (settings: Partial<Settings>) => Promise<unknown>
  scanArchives: (outputDir: string) => Promise<UserEntry[]>
  getPosts: (userDir: string) => Promise<Post[]>
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
  onDownloadDone: (callback: (data: DoneResult) => void) => () => void
  onShortcut: (callback: (tab: string) => void) => () => void
  // Batch download
  enqueueBatchDownload: (jobs: BatchJob[]) => Promise<{ success: boolean; queued: number; error?: string }>
  stopBatchDownload: () => Promise<void>
  getBatchStatus: () => Promise<BatchStatus>
  onBatchEvent: (callback: (data: BatchEvent) => void) => () => void
  // Archive management
  deleteArchives: (paths: string[], rootDir?: string) => Promise<{ success: string[]; failed: string[] }>
  getUserLastUpdate: (userDir: string) => Promise<string | null>
}

export interface Settings {
  output_dir?: string
  concurrent?: number
  naming_template?: string
  last_platform?: string
  cookies?: Record<string, string> & {
    per_user?: Record<string, string>
  }
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
export type DoneResult    = { type: 'done';    count: number; skipped: number; posts: number; output_dir?: string; userDir?: string }
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
}

export interface BatchStatus {
  queued: number
  running: boolean
  currentUserId?: string
  currentPlatform?: string
}

export interface BatchEvent {
  type: 'user-start' | 'user-progress' | 'user-done' | 'user-error' | 'batch-done'
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
}

export interface UserProfile {
  name?: string
  screen_name?: string
  platform?: string
  displayName?: string
  avatar?: string
  lastUpdate?: string
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
