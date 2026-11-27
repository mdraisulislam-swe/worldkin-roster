import { useState } from 'react'
import { Icon } from './Icon'
import { parseVideoUrl } from '../lib/video'

/**
 * Responsive 16:9 player. YouTube videos load only after the visitor presses Play (privacy-enhanced
 * youtube-nocookie embed); direct files use the native <video> controls. With no URL it shows a clear
 * "video not published yet" state — never a play button that does nothing.
 */
export function VideoPlayer({ url, title }: { url: string; title: string }) {
  const src = parseVideoUrl(url)
  const [play, setPlay] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const frame = 'relative aspect-video w-full overflow-hidden rounded-xl bg-forest-900'

  if (src.kind === 'none' || src.kind === 'invalid' || failed) {
    return (
      <div className={`${frame} grid place-items-center text-center`} role="img" aria-label={`${title}: video not available`}>
        <div className="max-w-sm px-6 text-sage-200">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-white/25 text-white/70"><Icon name="play" size={20} /></span>
          <p className="mt-3 font-semibold text-white">{failed ? 'This video could not be played' : src.kind === 'invalid' ? 'Video link is not valid' : 'Video not published yet'}</p>
          <p className="mt-1 text-sm">{failed ? 'Try again later.' : 'The Worldkin team has not supplied this video link yet.'}</p>
        </div>
      </div>
    )
  }
  if (src.kind === 'file') {
    return (
      <div className={frame}>
        {!loaded && <p role="status" className="absolute inset-0 grid place-items-center text-sm text-sage-200">Loading video…</p>}
        <video className="relative h-full w-full" controls preload="metadata" src={src.src} title={title}
          onLoadedMetadata={() => setLoaded(true)} onError={() => setFailed(true)} />
      </div>
    )
  }
  return (
    <div className={frame}>
      {play ? (
        <>
          {!loaded && <p role="status" className="absolute inset-0 grid place-items-center text-sm text-sage-200">Loading video…</p>}
          <iframe className="relative h-full w-full" src={src.embed} title={title} onLoad={() => setLoaded(true)}
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        </>
      ) : (
        <button type="button" onClick={() => setPlay(true)} className="group absolute inset-0 grid place-items-center" aria-label={`Play video: ${title}`}>
          <img src={src.thumb} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" onError={(e) => { e.currentTarget.style.display = 'none' }} />
          <span className="relative grid h-16 w-16 place-items-center rounded-full bg-white text-brand-700 shadow-lg transition-transform group-hover:scale-105"><Icon name="play" size={26} /></span>
        </button>
      )}
    </div>
  )
}
