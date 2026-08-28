export function localAssetUrl(filePath) {
  if (!filePath) return ''
  return `social-archiver://asset/?path=${encodeURIComponent(filePath)}`
}
