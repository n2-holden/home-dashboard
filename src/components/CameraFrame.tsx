import { useCallback, useEffect, useRef, useState } from 'react'
import { DASHBOARD_CAMERAS, type DashboardCamera } from '../ha/camera'
import { loadToken } from '../ha/storage'
import { HLS_KEEPALIVE_MS, useCameraFeed } from '../hooks/useCameraFeed'

type FeedMode = 'stream' | 'snapshot' | 'hls'

const HLS_RESTART_LIMIT = 6
const HLS_RESTART_COOLDOWN_MS = 1_500

function absoluteUrl(url: string): string {
  return new URL(url, location.origin).href
}

function feedBadgeLabel(
  activeMode: FeedMode,
  hlsPhase: 'connecting' | 'live' | 'idle',
): { text: string; tone: 'live' | 'snapshot' | 'connecting' | 'stream' } {
  if (activeMode === 'hls') {
    if (hlsPhase === 'live') return { text: 'Live', tone: 'live' }
    return { text: 'Connecting', tone: 'connecting' }
  }
  if (activeMode === 'stream') return { text: 'Stream', tone: 'stream' }
  return { text: 'Snapshot', tone: 'snapshot' }
}

/** Grab the current video frame so reconnect can show it instead of black. */
function captureVideoFrame(video: HTMLVideoElement | null): string | null {
  if (!video || video.videoWidth < 2 || video.videoHeight < 2) return null
  try {
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.82)
  } catch {
    return null
  }
}

function authHeaders(token: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function HlsVideo({
  src,
  label,
  onLive,
  onFatalError,
  onHoldFrame,
}: {
  src: string
  label: string
  onLive?: () => void
  onFatalError?: (message: string) => void
  onHoldFrame?: (dataUrl: string) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState('Starting live stream…')
  const [revealed, setRevealed] = useState(false)
  const onLiveRef = useRef(onLive)
  const onFatalErrorRef = useRef(onFatalError)
  const onHoldFrameRef = useRef(onHoldFrame)
  onLiveRef.current = onLive
  onFatalErrorRef.current = onFatalError
  onHoldFrameRef.current = onHoldFrame

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    let destroyed = false
    let hls: { destroy: () => void; startLoad: () => void; recoverMediaError: () => void } | null =
      null
    let networkRetries = 0
    let holdTimer: number | null = null
    setRevealed(false)
    setStatus('Starting live stream…')

    const publishHold = () => {
      const frame = captureVideoFrame(videoRef.current)
      if (frame) onHoldFrameRef.current?.(frame)
    }

    const play = () => {
      void video.play().catch(() => {
        /* autoplay may require a gesture; muted+playsinline usually OK */
      })
    }

    const markLive = () => {
      if (destroyed) return
      setStatus('')
      setRevealed(true)
      onLiveRef.current?.()
      publishHold()
    }

    const fail = (message: string) => {
      if (destroyed) return
      publishHold()
      setStatus(message)
      onFatalErrorRef.current?.(message)
    }

    holdTimer = window.setInterval(() => {
      if (!destroyed) publishHold()
    }, 4_000)

    void (async () => {
      try {
        const token = loadToken()
        const masterUrl = absoluteUrl(src)
        // Remote Safari has no HA session cookie — must send the long-lived token.
        const probe = await fetch(masterUrl, {
          credentials: 'same-origin',
          headers: authHeaders(token),
        })
        if (!probe.ok) {
          fail(
            probe.status === 401
              ? 'Stream auth failed (401) — check the HA token in Settings'
              : `Stream playlist error (${probe.status})`,
          )
          return
        }
        const master = await probe.text()
        if (destroyed) return

        const playlistRegexp = /#EXT-X-STREAM-INF:.*?(?:\n|\r\n)(.+)/g
        const match = playlistRegexp.exec(master)
        const matchTwice = playlistRegexp.exec(master)
        const playlistUrl =
          match !== null && matchTwice === null
            ? new URL(match[1].trim(), masterUrl).href
            : masterUrl

        const { default: Hls } = await import('hls.js')
        if (destroyed || !videoRef.current) return

        // Safari/iPad: native HLS cannot send Authorization. Use hls.js + Managed
        // Media Source (iOS 17+) and attach the Bearer token on every request.
        const managedMs =
          typeof (globalThis as { ManagedMediaSource?: unknown }).ManagedMediaSource !== 'undefined'
        const canUseHlsJs = Hls.isSupported() || managedMs

        if (canUseHlsJs) {
          const instance = new Hls({
            backBufferLength: 60,
            fragLoadingTimeOut: 30_000,
            manifestLoadingTimeOut: 30_000,
            levelLoadingTimeOut: 30_000,
            maxLiveSyncPlaybackRate: 2,
            lowLatencyMode: true,
            liveSyncDurationCount: 3,
            preferManagedMediaSource: true,
            xhrSetup: (xhr) => {
              if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
            },
            fetchSetup: (context, initConfig) => {
              const headers = new Headers(initConfig?.headers ?? {})
              if (token) headers.set('Authorization', `Bearer ${token}`)
              return new Request(context.url, { ...initConfig, headers })
            },
          })
          hls = instance
          instance.attachMedia(videoRef.current)
          instance.on(Hls.Events.MEDIA_ATTACHED, () => {
            instance.loadSource(playlistUrl)
          })
          instance.on(Hls.Events.MANIFEST_PARSED, () => {
            markLive()
            play()
          })
          instance.on(Hls.Events.FRAG_LOADED, () => {
            markLive()
          })
          instance.on(Hls.Events.ERROR, (_event, data) => {
            if (!data.fatal) return
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              const code = data.response?.code
              if (code === 404 || code === 410 || networkRetries >= 2) {
                fail(
                  code
                    ? `Stream network error (${code})`
                    : 'Stream network error — is the stream integration loaded?',
                )
                return
              }
              networkRetries += 1
              instance.startLoad()
              return
            }
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              instance.recoverMediaError()
              return
            }
            fail('Error playing live stream')
          })
          return
        }

        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          const onMeta = () => {
            markLive()
            play()
          }
          const onError = () =>
            fail(
              'Native HLS cannot authenticate remotely — need iOS 17+ (Managed Media Source) or an HA login cookie in this Safari',
            )
          video.addEventListener('loadedmetadata', onMeta)
          video.addEventListener('error', onError)
          video.src = playlistUrl
          return
        }

        fail('HLS playback is not supported in this browser')
      } catch (err) {
        fail(err instanceof Error ? err.message : 'Failed to start live stream')
      }
    })()

    return () => {
      destroyed = true
      if (holdTimer != null) window.clearInterval(holdTimer)
      publishHold()
      hls?.destroy()
      video.removeAttribute('src')
      video.load()
    }
  }, [src])

  return (
    <div className="camera-frame-video-wrap">
      <video
        ref={videoRef}
        className={`camera-frame-img${revealed ? '' : ' camera-frame-img--pending'}`}
        aria-label={`${label} live video`}
        muted
        playsInline
        autoPlay
      />
      {status ? <div className="camera-frame-status">{status}</div> : null}
    </div>
  )
}

export function CameraFrame({
  camera,
  enabled,
  className,
  showFeedBadge = true,
}: {
  camera: DashboardCamera
  enabled: boolean
  className?: string
  /** Corner badge for Live / Snapshot / Stream. Default true. */
  showFeedBadge?: boolean
}) {
  const preferredMode = camera.feedMode ?? 'stream'
  const [modeOverride, setModeOverride] = useState<FeedMode | null>(null)
  const [hlsPhase, setHlsPhase] = useState<'connecting' | 'live' | 'idle'>('idle')
  const [hlsRestartToken, setHlsRestartToken] = useState(0)
  const [holdFrame, setHoldFrame] = useState<string | null>(null)
  const restartCountRef = useRef(0)
  const restartTimerRef = useRef<number | null>(null)
  const mode = modeOverride ?? preferredMode

  useEffect(() => {
    setModeOverride(null)
    setHlsPhase(preferredMode === 'hls' ? 'connecting' : 'idle')
    setHlsRestartToken(0)
    setHoldFrame(null)
    restartCountRef.current = 0
    if (restartTimerRef.current != null) {
      window.clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
  }, [camera.entityId, preferredMode])

  useEffect(() => {
    return () => {
      if (restartTimerRef.current != null) {
        window.clearTimeout(restartTimerRef.current)
      }
    }
  }, [])

  const { url, mode: activeMode, error } = useCameraFeed(camera.entityId, enabled, {
    mode,
    snapshotRefreshMs:
      mode === 'snapshot' || modeOverride === 'snapshot'
        ? (camera.snapshotRefreshMs ?? 2_000)
        : undefined,
    hlsKeepAliveMs: preferredMode === 'hls' ? HLS_KEEPALIVE_MS : undefined,
    hlsRestartToken,
  })

  const handleHoldFrame = useCallback((dataUrl: string) => {
    setHoldFrame(dataUrl)
  }, [])

  const handleHlsLive = useCallback(() => {
    setHlsPhase('live')
    restartCountRef.current = 0
    if (modeOverride === 'snapshot') {
      setModeOverride(null)
    }
  }, [modeOverride])

  const scheduleHlsRestart = useCallback((delayMs: number) => {
    if (restartTimerRef.current != null) {
      window.clearTimeout(restartTimerRef.current)
    }
    restartTimerRef.current = window.setTimeout(() => {
      setModeOverride(null)
      setHlsPhase('connecting')
      setHlsRestartToken((token) => token + 1)
    }, delayMs)
  }, [])

  const handleHlsFatal = useCallback(
    (_message: string) => {
      if (preferredMode !== 'hls') {
        setHlsPhase('idle')
        setModeOverride('snapshot')
        return
      }

      // Prefer reconnecting a fresh HLS session over staying on Snapshot.
      if (restartCountRef.current >= HLS_RESTART_LIMIT) {
        setHlsPhase('idle')
        setModeOverride('snapshot')
        restartCountRef.current = 0
        scheduleHlsRestart(20_000)
        return
      }

      restartCountRef.current += 1
      setHlsPhase('connecting')
      scheduleHlsRestart(HLS_RESTART_COOLDOWN_MS)
    },
    [preferredMode, scheduleHlsRestart],
  )

  // If HA never returned an HLS URL, keep retrying instead of sitting on an error.
  useEffect(() => {
    if (!enabled || preferredMode !== 'hls' || modeOverride != null) return
    if (url || !error) return
    scheduleHlsRestart(HLS_RESTART_COOLDOWN_MS)
  }, [enabled, preferredMode, modeOverride, url, error, scheduleHlsRestart])

  let displayBadge: { text: string; tone: 'live' | 'snapshot' | 'connecting' | 'stream' } | null =
    null
  if (showFeedBadge && enabled) {
    if (modeOverride === 'snapshot' || activeMode === 'snapshot') {
      displayBadge = { text: 'Snapshot', tone: 'snapshot' }
    } else if (activeMode === 'hls' || preferredMode === 'hls') {
      if (hlsPhase === 'live') displayBadge = { text: 'Live', tone: 'live' }
      else
        displayBadge = {
          text: restartCountRef.current > 0 ? 'Reconnecting' : 'Connecting',
          tone: 'connecting',
        }
    } else if (url) {
      displayBadge = feedBadgeLabel(activeMode, hlsPhase)
    }
  }

  const showHls = Boolean(url && activeMode === 'hls' && modeOverride !== 'snapshot')
  const showSnapshotImg = Boolean(url && !showHls)

  return (
    <div className={className ?? 'camera-frame'} aria-label={`${camera.label} camera`}>
      {displayBadge ? (
        <div
          className={`camera-feed-badge camera-feed-badge--${displayBadge.tone}`}
          aria-live="polite"
        >
          {displayBadge.tone === 'live' ? (
            <span className="camera-feed-badge-dot" aria-hidden="true" />
          ) : null}
          {displayBadge.text}
        </div>
      ) : null}

      {holdFrame ? (
        <img src={holdFrame} alt="" className="camera-frame-hold" aria-hidden="true" />
      ) : null}

      {showHls ? (
        <HlsVideo
          key={`hls-${camera.entityId}-${hlsRestartToken}-${url}`}
          src={url!}
          label={camera.label}
          onLive={handleHlsLive}
          onFatalError={handleHlsFatal}
          onHoldFrame={handleHoldFrame}
        />
      ) : showSnapshotImg ? (
        <img src={url!} alt={`${camera.label} camera`} className="camera-frame-img" />
      ) : !holdFrame ? (
        <div className="camera-frame-placeholder">
          {!enabled
            ? 'Not connected'
            : error
              ? error
              : preferredMode === 'hls'
                ? 'Starting live stream…'
                : 'Loading…'}
        </div>
      ) : null}
    </div>
  )
}

export function findDashboardCamera(id: string): DashboardCamera | undefined {
  return DASHBOARD_CAMERAS.find((cam) => cam.id === id)
}
