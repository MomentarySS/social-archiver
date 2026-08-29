const SCHEDULE_MS = 60 * 1000;

function parseRunAt(value) {
  const match = String(value || '03:00').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return { hour: 3, minute: 0 };
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function shouldRunNow(scheduler, now = new Date()) {
  if (!scheduler?.enabled) return false;
  const { hour, minute } = parseRunAt(scheduler.run_at);
  const lastRun = scheduler.last_run ? new Date(scheduler.last_run) : null;
  const todayKey = now.toISOString().slice(0, 10);
  const lastKey = lastRun && !Number.isNaN(lastRun.getTime()) ? lastRun.toISOString().slice(0, 10) : '';
  if (lastKey === todayKey) return false;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const targetMinutes = hour * 60 + minute;
  return currentMinutes >= targetMinutes;
}

function userScheduleKey(platform, userId) {
  return `${platform}:${userId}`;
}

function isUserDue(schedule, lastScheduledAt, now = new Date()) {
  const mode = schedule || 'manual';
  if (mode === 'manual') return false;
  if (!lastScheduledAt) return true;
  const last = new Date(lastScheduledAt);
  if (Number.isNaN(last.getTime())) return true;
  const diffHours = (now.getTime() - last.getTime()) / (1000 * 60 * 60);
  if (mode === 'daily') return diffHours >= 20;
  if (mode === 'weekly') return diffHours >= 24 * 7 - 1;
  return false;
}

function createScheduler({ readSettings, saveSettingsPatch, buildScheduledJobs, enqueueBatchDownload, isDownloading }) {
  let timer = null;
  let running = false;

  async function tick() {
    if (running) return;
    const settings = readSettings();
    if (!settings?.scheduler?.enabled) return;
    if (!shouldRunNow(settings.scheduler)) return;
    if (await isDownloading()) return;
    running = true;
    try {
      const jobs = await buildScheduledJobs(settings);
      if (!jobs.length) {
        await saveSettingsPatch({
          scheduler: {
            ...settings.scheduler,
            last_run: new Date().toISOString(),
          },
        });
        return;
      }
      const result = await enqueueBatchDownload(jobs);
      if (result?.success) {
        const nextLastScheduled = { ...(settings.user_last_scheduled || {}) };
        for (const job of jobs) {
          nextLastScheduled[userScheduleKey(job.platform, job.userId)] = new Date().toISOString();
        }
        await saveSettingsPatch({
          scheduler: {
            ...settings.scheduler,
            last_run: new Date().toISOString(),
          },
          user_last_scheduled: nextLastScheduled,
        });
      }
    } finally {
      running = false;
    }
  }

  function start() {
    stop();
    timer = setInterval(() => {
      tick().catch(() => {});
    }, SCHEDULE_MS);
    tick().catch(() => {});
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { start, stop, tick, shouldRunNow, isUserDue, userScheduleKey };
}

module.exports = {
  createScheduler,
  shouldRunNow,
  isUserDue,
  userScheduleKey,
};
