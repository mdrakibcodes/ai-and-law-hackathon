// Explicit navigation preference: recognize a profile URL, not its owner/content.
const RESERVED_PATHS = new Set([
  'about', 'accounts', 'ads', 'api', 'business', 'challenge', 'developer',
  'developers', 'direct', 'directory', 'emails', 'explore', 'graphql', 'legal',
  'nametag', 'oauth', 'p', 'privacy', 'professional_accounts', 'reel', 'reels',
  'settings', 'share', 'static', 'stories', 'terms', 'tv', 'web',
])
const TRACKING_KEYS = new Set(['igsh', 'igshid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'])

export function instagramProfileLink(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash) return null
    if (!['instagram.com', 'www.instagram.com'].includes(url.hostname)) return null
    const match = /^\/([a-zA-Z0-9._]{1,30})\/?$/.exec(url.pathname)
    if (!match) return null
    const username = match[1]
    if (username.startsWith('.') || username.endsWith('.') || username.includes('..') || RESERVED_PATHS.has(username.toLowerCase())) return null
    if ([...url.searchParams.keys()].some(key => !TRACKING_KEYS.has(key))) return null
    // Remove tracking parameters and reconstruct the destination from fixed parts.
    return { username, url: `https://www.instagram.com/${username}/` }
  } catch { return null }
}
