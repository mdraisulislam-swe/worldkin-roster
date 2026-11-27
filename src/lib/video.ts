/** Video source parsing for the VideoPlayer. Pure and unit-tested. */
export type VideoSource =
  | { kind: 'youtube'; id: string; embed: string; thumb: string }
  | { kind: 'file'; src: string }
  | { kind: 'none' }
  | { kind: 'invalid' }

export function parseVideoUrl(raw: string | null | undefined): VideoSource {
  const s = (raw ?? '').trim()
  if (!s) return { kind: 'none' }
  let u: URL
  try { u = new URL(s) } catch { return { kind: 'invalid' } }
  if (u.protocol !== 'https:') return { kind: 'invalid' }
  const host = u.hostname.replace(/^www\.|^m\./, '')
  let id = ''
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0]
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v') ?? ''
    else { const m = u.pathname.match(/^\/(embed|shorts|live)\/([^/?#]+)/); if (m) id = m[2] }
  }
  if (host.endsWith('youtube.com') || host === 'youtu.be' || host.endsWith('youtube-nocookie.com')) {
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return { kind: 'invalid' }
    return { kind: 'youtube', id, embed: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }
  }
  if (/\.(mp4|webm)$/i.test(u.pathname)) return { kind: 'file', src: u.toString() }
  return { kind: 'invalid' }
}
