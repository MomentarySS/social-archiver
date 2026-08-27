export function isLivephotoUrl(url) {
  return /livephoto/i.test(String(url || ''))
}

export function groupLiveMedia(pics) {
  const list = pics || []
  const grouped = []
  for (let i = 0; i < list.length; i += 1) {
    const pic = list[i]
    if ((pic.type || '') === 'livephoto') {
      grouped.push(pic)
      continue
    }
    const next = list[i + 1]
    const nextIsMotion = next && (
      next.type === 'video'
      || /\.(mp4|mov|webm)$/i.test(next.filename || '')
    )
    if (
      pic.type !== 'video'
      && nextIsMotion
      && isLivephotoUrl(next.original_url || next.video_url || '')
    ) {
      grouped.push({
        ...pic,
        type: 'livephoto',
        video_filename: next.filename,
        video_url: next.original_url || next.video_url,
        video_abs_path: next.abs_path || next.video_abs_path,
      })
      i += 1
      continue
    }
    grouped.push(pic)
  }
  return grouped
}
