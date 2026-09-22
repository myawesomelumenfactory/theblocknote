import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Pause, Play } from 'lucide-react'

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Spotify-like now-playing card under the vinyl.
 * Spotify tracks use the official embed (real scrubber).
 * Preview URLs use a local <audio> with a scrubber locked to playback time.
 */
export default function PulsePlayer({
  title,
  artist,
  coverUrl,
  embedSrc,
  previewUrl,
  playing,
  onPlayingChange,
  openUrl,
  emptyLabel,
  previewLabel,
}) {
  const audioRef = useRef(null)
  const barRef = useRef(null)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [dragging, setDragging] = useState(false)

  // Reset scrubber when the preview source changes.
  useEffect(() => {
    setCurrent(0)
    setDuration(0)
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  }, [previewUrl])

  // Drive local preview audio from parent playing flag.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !previewUrl || embedSrc) return undefined

    if (audio.src !== previewUrl) {
      audio.src = previewUrl
      audio.load()
    }

    if (playing) {
      const play = audio.play()
      if (play?.catch) play.catch(() => onPlayingChange?.(false))
    } else {
      audio.pause()
    }
    return undefined
  }, [playing, previewUrl, embedSrc, onPlayingChange])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return undefined

    const onTime = () => {
      if (!dragging) setCurrent(audio.currentTime || 0)
    }
    const onMeta = () => setDuration(audio.duration || 0)
    const onEnded = () => {
      setCurrent(0)
      onPlayingChange?.(false)
    }
    const onPlay = () => onPlayingChange?.(true)
    const onPause = () => {
      if (!audio.ended) onPlayingChange?.(false)
    }

    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('durationchange', onMeta)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('durationchange', onMeta)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
    }
  }, [dragging, onPlayingChange, previewUrl])

  const seekToClientX = (clientX) => {
    const audio = audioRef.current
    const bar = barRef.current
    if (!audio || !bar || !Number.isFinite(audio.duration) || audio.duration <= 0) return
    const rect = bar.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const next = ratio * audio.duration
    audio.currentTime = next
    setCurrent(next)
  }

  if (!embedSrc && !previewUrl) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#121212] px-4 py-6 text-center text-sm text-white/40">
        {emptyLabel}
      </div>
    )
  }

  if (embedSrc) {
    const src = embedSrc.includes('theme=')
      ? embedSrc
      : `${embedSrc}${embedSrc.includes('?') ? '&' : '?'}theme=0`
    return (
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#121212] shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-3 px-3 pt-3 pb-1">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt=""
              className="h-11 w-11 rounded object-cover shadow-md"
            />
          ) : (
            <div className="h-11 w-11 rounded bg-white/10" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">{title}</div>
            {artist ? (
              <div className="truncate text-xs text-white/50">{artist}</div>
            ) : null}
          </div>
          {openUrl ? (
            <a
              href={openUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-full p-2 text-white/50 hover:bg-white/10 hover:text-white"
              title="Open in Spotify"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}
        </div>
        {/* Official Spotify scrubber — height 152 keeps the real playhead usable */}
        <iframe
          title={title}
          src={src}
          width="100%"
          height="152"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          className="w-full border-0"
          style={{ display: 'block' }}
        />
      </div>
    )
  }

  const progress = duration > 0 ? Math.min(100, (current / duration) * 100) : 0

  return (
    <div className="rounded-2xl border border-white/10 bg-[#121212] px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
      <audio ref={audioRef} preload="metadata" className="hidden" />
      <div className="flex items-center gap-3">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            className="h-14 w-14 rounded object-cover shadow-md"
          />
        ) : (
          <div className="h-14 w-14 rounded bg-white/10" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">{title}</div>
          {artist ? <div className="truncate text-xs text-white/50">{artist}</div> : null}
          <div className="mt-1 text-[10px] uppercase tracking-wide text-white/35">
            {previewLabel}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onPlayingChange?.(!playing)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1db954] text-black shadow-lg hover:scale-105 transition-transform"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? (
            <Pause className="h-4 w-4 fill-current" />
          ) : (
            <Play className="h-4 w-4 fill-current translate-x-[1px]" />
          )}
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="w-8 shrink-0 text-[10px] tabular-nums text-white/45">
          {formatTime(current)}
        </span>
        <div
          ref={barRef}
          role="slider"
          tabIndex={0}
          aria-valuemin={0}
          aria-valuemax={Math.floor(duration) || 0}
          aria-valuenow={Math.floor(current) || 0}
          aria-label="Seek"
          className="relative h-1.5 flex-1 cursor-pointer rounded-full bg-white/15 group"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture?.(event.pointerId)
            setDragging(true)
            seekToClientX(event.clientX)
          }}
          onPointerMove={(event) => {
            if (!dragging) return
            seekToClientX(event.clientX)
          }}
          onPointerUp={(event) => {
            seekToClientX(event.clientX)
            setDragging(false)
          }}
          onPointerCancel={() => setDragging(false)}
          onKeyDown={(event) => {
            const audio = audioRef.current
            if (!audio || !duration) return
            if (event.key === 'ArrowRight') {
              audio.currentTime = Math.min(duration, audio.currentTime + 2)
              setCurrent(audio.currentTime)
            }
            if (event.key === 'ArrowLeft') {
              audio.currentTime = Math.max(0, audio.currentTime - 2)
              setCurrent(audio.currentTime)
            }
          }}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-white group-hover:bg-[#1db954]"
            style={{ width: `${progress}%` }}
          />
          <div
            className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white shadow opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `calc(${progress}% - 6px)` }}
          />
        </div>
        <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-white/45">
          {formatTime(duration)}
        </span>
      </div>
    </div>
  )
}
