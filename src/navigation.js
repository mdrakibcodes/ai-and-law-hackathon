export function safeDestination(url, scan, analysis) {
  if (analysis?.verdict !== 'safe' || scan?.malicious === true || !scan?.finalDomain) return null
  try {
    const target = new URL(url)
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) return null
    if (target.href !== new URL(scan.scannedUrl).href) return null
    return target.href
  } catch { return null }
}
