import { useCallback, useEffect, useRef, useState } from 'react'
import {
  decodeMulaw,
  DOORBIRD_SAMPLE_RATE,
  downsampleToDoorBird,
  encodeMulaw,
  intercomApiUrl,
  intercomSignedWsUrl,
} from '../ha/doorbirdAudio'
import { loadBaseUrl, loadToken } from '../ha/storage'

export type IntercomStatus = {
  available: boolean
  reason?: string
}

type ScriptProcessor = ScriptProcessorNode & {
  // Older typings; keep a local alias for cleanup.
}

function micBlockedReason(): string | null {
  if (typeof window === 'undefined') return 'Microphone unavailable.'
  if (!window.isSecureContext) {
    return (
      `Microphone needs HTTPS — this page is ${location.protocol}//${location.host}. ` +
      'On iPad open the full Nabu Casa link in Safari ' +
      '(https://….ui.nabu.casa/local/home-dashboard/index.html), not the local http:// address.'
    )
  }
  // iOS blocks getUserMedia inside the HA Companion Webpage iframe.
  if (window.top !== window.self) {
    return (
      'iPad blocks the microphone inside the Home Assistant app panel. ' +
      'Open the dashboard full-page in Safari via your Nabu Casa https://….ui.nabu.casa/local/home-dashboard/ link ' +
      '(or Companion → ⋮ → Open in Safari).'
    )
  }
  return null
}

function secureMicHint(err?: unknown): string {
  const blocked = micBlockedReason()
  if (blocked) return blocked
  if (err instanceof DOMException) {
    if (err.name === 'NotFoundError') return 'No microphone found on this device.'
    if (err.name === 'NotAllowedError') {
      return 'Microphone permission denied — allow mic for this site in iPad Settings → Safari (or the HA app).'
    }
  }
  return 'Microphone permission denied or unavailable.'
}

async function requestMicStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException(secureMicHint(), 'NotSupportedError')
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
      video: false,
    })
  } catch {
    // Safari/iPad often rejects detailed constraints — retry bare audio.
    return await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  }
}

/** Prefer AudioWorklet on modern Safari; fall back to ScriptProcessor. */
async function attachMicCapture(
  ctx: AudioContext,
  mediaStream: MediaStream,
  onPcm: (samples: Float32Array) => void,
): Promise<() => void> {
  const source = ctx.createMediaStreamSource(mediaStream)
  const mute = ctx.createGain()
  mute.gain.value = 0

  if (ctx.audioWorklet?.addModule) {
    try {
      const workletSource = `
        class DoorBirdCaptureProcessor extends AudioWorkletProcessor {
          process(inputs) {
            const ch = inputs[0] && inputs[0][0]
            if (ch && ch.length) {
              const copy = new Float32Array(ch.length)
              copy.set(ch)
              this.port.postMessage(copy, [copy.buffer])
            }
            return true
          }
        }
        registerProcessor('doorbird-capture', DoorBirdCaptureProcessor)
      `
      const moduleUrl = URL.createObjectURL(
        new Blob([workletSource], { type: 'application/javascript' }),
      )
      try {
        await ctx.audioWorklet.addModule(moduleUrl)
      } finally {
        URL.revokeObjectURL(moduleUrl)
      }
      const node = new AudioWorkletNode(ctx, 'doorbird-capture')
      node.port.onmessage = (event) => {
        if (event.data instanceof Float32Array) onPcm(event.data)
      }
      source.connect(node)
      node.connect(mute)
      mute.connect(ctx.destination)
      return () => {
        try {
          node.port.onmessage = null
          node.disconnect()
        } catch {
          /* ignore */
        }
        try {
          source.disconnect()
        } catch {
          /* ignore */
        }
        mediaStream.getTracks().forEach((track) => track.stop())
      }
    } catch {
      /* fall through to ScriptProcessor */
    }
  }

  const processor: ScriptProcessor = ctx.createScriptProcessor(2048, 1, 1)
  processor.onaudioprocess = (event) => {
    onPcm(event.inputBuffer.getChannelData(0))
  }
  source.connect(processor)
  processor.connect(mute)
  mute.connect(ctx.destination)
  return () => {
    processor.onaudioprocess = null
    try {
      processor.disconnect()
    } catch {
      /* ignore */
    }
    try {
      source.disconnect()
    } catch {
      /* ignore */
    }
    mediaStream.getTracks().forEach((track) => track.stop())
  }
}

function supportsFetchDuplex(): boolean {
  try {
    // Chromium supports streaming request bodies; Safari generally does not.
    new Request('http://127.0.0.1', {
      method: 'POST',
      body: new ReadableStream(),
      // @ts-expect-error duplex is not in all TS DOM libs
      duplex: 'half',
    })
    return true
  } catch {
    return false
  }
}

async function playMulawStream(
  response: Response,
  audioCtx: AudioContext,
  aborted: () => boolean,
): Promise<void> {
  if (!response.body) throw new Error('No audio body from DoorBird listen proxy')
  const reader = response.body.getReader()
  let nextTime = audioCtx.currentTime + 0.08
  let pending = new Uint8Array(0)

  const schedule = (pcm: Float32Array) => {
    if (pcm.length === 0) return
    const buffer = audioCtx.createBuffer(1, pcm.length, DOORBIRD_SAMPLE_RATE)
    buffer.copyToChannel(pcm, 0)
    const src = audioCtx.createBufferSource()
    src.buffer = buffer
    src.connect(audioCtx.destination)
    const startAt = Math.max(nextTime, audioCtx.currentTime + 0.02)
    src.start(startAt)
    nextTime = startAt + buffer.duration
  }

  while (!aborted()) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value?.length) continue

    const merged = new Uint8Array(pending.length + value.length)
    merged.set(pending)
    merged.set(value, pending.length)

    // Schedule in ~40 ms chunks (320 bytes @ 8 kHz).
    const chunkBytes = 320
    let offset = 0
    while (merged.length - offset >= chunkBytes) {
      schedule(decodeMulaw(merged.subarray(offset, offset + chunkBytes)))
      offset += chunkBytes
    }
    pending = merged.subarray(offset)
  }

  if (pending.length > 0 && !aborted()) {
    schedule(decodeMulaw(pending))
  }
}

async function openSignedTalkSocket(token: string): Promise<WebSocket> {
  const res = await fetch(intercomApiUrl('/api/doorbird_intercom/talk_session', loadBaseUrl()), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 404) {
    throw new Error(
      'Talk session API missing — restart Home Assistant to load doorbird_intercom 1.1',
    )
  }
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(text || `Talk session failed (${res.status})`)
  }
  const body = (await res.json()) as { ok?: boolean; path?: string }
  if (!body.path) throw new Error('Talk session did not return a signed path')

  const ws = new WebSocket(intercomSignedWsUrl(body.path, loadBaseUrl()))
  ws.binaryType = 'arraybuffer'

  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Talk WebSocket timed out')), 12_000)
    ws.onopen = () => {
      window.clearTimeout(timer)
      resolve()
    }
    ws.onerror = () => {
      window.clearTimeout(timer)
      reject(new Error('Talk WebSocket failed after signed session'))
    }
  })

  return ws
}

export function useDoorBirdIntercom(enabled: boolean) {
  const [listening, setListening] = useState(false)
  const [talking, setTalking] = useState(false)
  const [status, setStatus] = useState<IntercomStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  const listenAbortRef = useRef<AbortController | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const talkCleanupRef = useRef<(() => void) | null>(null)

  const ensureAudioCtx = useCallback(async () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext()
    }
    if (audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume()
    }
    return audioCtxRef.current
  }, [])

  useEffect(() => {
    if (!enabled) {
      setStatus(null)
      return
    }
    let cancelled = false
    const token = loadToken()
    if (!token) {
      setStatus({ available: false, reason: 'not_signed_in' })
      return
    }
    void (async () => {
      try {
        const res = await fetch(intercomApiUrl('/api/doorbird_intercom/status', loadBaseUrl()), {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (cancelled) return
        if (res.status === 404) {
          setStatus({ available: false, reason: 'proxy_missing' })
          return
        }
        if (!res.ok) {
          setStatus({ available: false, reason: `http_${res.status}` })
          return
        }
        const body = (await res.json()) as { ok?: boolean; reason?: string }
        setStatus({
          available: body.ok === true,
          reason: body.ok === true ? undefined : body.reason ?? 'unavailable',
        })
      } catch {
        if (!cancelled) setStatus({ available: false, reason: 'unreachable' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [enabled])

  const stopListen = useCallback(() => {
    listenAbortRef.current?.abort()
    listenAbortRef.current = null
    setListening(false)
  }, [])

  const stopTalk = useCallback(() => {
    talkCleanupRef.current?.()
    talkCleanupRef.current = null
    setTalking(false)
  }, [])

  const stopAll = useCallback(() => {
    stopTalk()
    stopListen()
  }, [stopListen, stopTalk])

  useEffect(() => {
    if (!enabled) stopAll()
  }, [enabled, stopAll])

  useEffect(() => {
    return () => {
      stopAll()
      void audioCtxRef.current?.close()
      audioCtxRef.current = null
    }
  }, [stopAll])

  const startListen = useCallback(async () => {
    const token = loadToken()
    if (!token) {
      setError('Not signed in to Home Assistant')
      return
    }
    stopListen()
    setError(null)
    const abort = new AbortController()
    listenAbortRef.current = abort
    setListening(true)

    try {
      const ctx = await ensureAudioCtx()
      const res = await fetch(intercomApiUrl('/api/doorbird_intercom/listen', loadBaseUrl()), {
        headers: { Authorization: `Bearer ${token}` },
        signal: abort.signal,
      })
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText)
        throw new Error(text || `Listen failed (${res.status})`)
      }
      await playMulawStream(res, ctx, () => abort.signal.aborted)
      if (!abort.signal.aborted) {
        setListening(false)
      }
    } catch (err) {
      if (abort.signal.aborted) return
      setListening(false)
      setError(err instanceof Error ? err.message : 'Listen failed')
    }
  }, [ensureAudioCtx, stopListen])

  const startTalk = useCallback(async () => {
    const token = loadToken()
    if (!token) {
      setError('Not signed in to Home Assistant')
      return
    }
    const precheck = micBlockedReason()
    if (precheck) {
      setError(precheck)
      return
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError(secureMicHint())
      return
    }

    stopTalk()
    setError(null)

    try {
      // Keep mic request early in the user-gesture turn (important on iPad).
      const ctx = await ensureAudioCtx()
      await ctx.resume()
      const mediaStream = await requestMicStream()

      const sendPcm = (send: (bytes: Uint8Array) => void) => (samples: Float32Array) => {
        const down = downsampleToDoorBird(samples, ctx.sampleRate)
        send(encodeMulaw(down))
      }

      // Prefer signed WebSocket (works on Safari/iPad). HTTP duplex is Chromium-only.
      try {
        const ws = await openSignedTalkSocket(token)
        const cleanupAudio = await attachMicCapture(
          ctx,
          mediaStream,
          sendPcm((bytes) => {
            if (ws.readyState === WebSocket.OPEN) {
              try {
                ws.send(bytes)
              } catch {
                /* closing */
              }
            }
          }),
        )
        talkCleanupRef.current = () => {
          cleanupAudio()
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close()
          }
        }
        setTalking(true)
        return
      } catch (wsErr) {
        if (!supportsFetchDuplex()) throw wsErr
      }

      const abort = new AbortController()
      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
      const writer = writable.getWriter()
      const cleanupAudio = await attachMicCapture(
        ctx,
        mediaStream,
        sendPcm((bytes) => {
          void writer.write(bytes).catch(() => undefined)
        }),
      )

      const fetchPromise = fetch(intercomApiUrl('/api/doorbird_intercom/talk', loadBaseUrl()), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'audio/basic',
        },
        body: readable,
        signal: abort.signal,
        // @ts-expect-error duplex is Chromium-specific
        duplex: 'half',
      })

      talkCleanupRef.current = () => {
        cleanupAudio()
        void writer.close().catch(() => undefined)
        abort.abort()
      }

      void fetchPromise.catch((err: unknown) => {
        if (abort.signal.aborted) return
        setTalking(false)
        setError(err instanceof Error ? err.message : 'Talk upload failed')
        stopTalk()
      })

      setTalking(true)
    } catch (err) {
      stopTalk()
      if (
        err instanceof DOMException &&
        (err.name === 'NotAllowedError' ||
          err.name === 'SecurityError' ||
          err.name === 'NotFoundError' ||
          err.name === 'NotSupportedError')
      ) {
        setError(secureMicHint(err))
        return
      }
      setError(err instanceof Error ? err.message : 'Talk failed')
    }
  }, [ensureAudioCtx, stopTalk])

  const toggleListen = useCallback(() => {
    if (listening) stopListen()
    else void startListen()
  }, [listening, startListen, stopListen])

  const toggleTalk = useCallback(() => {
    if (talking) {
      stopTalk()
      return
    }
    // Start Talk first so getUserMedia stays in the iPad user-gesture turn.
    void startTalk().then(() => {
      if (!listening) void startListen()
    })
  }, [listening, startListen, startTalk, stopTalk, talking])

  return {
    listening,
    talking,
    status,
    error,
    toggleListen,
    toggleTalk,
    stopAll,
  }
}
