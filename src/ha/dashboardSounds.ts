/** Built-in dashboard notification sounds (played in the browser, not Sonos). */

export type DashboardSoundId = 'chime' | 'alert' | 'doorbell' | 'ping' | 'siren'

export type DashboardSoundOption = {
  id: DashboardSoundId
  label: string
}

export const DASHBOARD_SOUND_OPTIONS: DashboardSoundOption[] = [
  { id: 'chime', label: 'Chime' },
  { id: 'alert', label: 'Alert beeps' },
  { id: 'doorbell', label: 'Doorbell' },
  { id: 'ping', label: 'Ping' },
  { id: 'siren', label: 'Siren' },
]

export const DEFAULT_DASHBOARD_SOUND: DashboardSoundId = 'chime'

const SOUND_IDS = new Set<string>(DASHBOARD_SOUND_OPTIONS.map((option) => option.id))

export function normalizeDashboardSoundId(value: unknown): DashboardSoundId {
  const raw = String(value ?? '').trim().toLowerCase()
  if (SOUND_IDS.has(raw)) return raw as DashboardSoundId
  return DEFAULT_DASHBOARD_SOUND
}

let audioCtx: AudioContext | null = null
let unlocked = false

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return null
  if (!audioCtx) audioCtx = new Ctx()
  return audioCtx
}

/** Call after a user gesture so later autoplay is allowed on wall tablets. */
export async function unlockDashboardAudio(): Promise<void> {
  const ctx = getAudioContext()
  if (!ctx) return
  try {
    if (ctx.state === 'suspended') await ctx.resume()
    unlocked = ctx.state === 'running'
  } catch {
    /* ignore */
  }
}

export function installDashboardAudioUnlock(): () => void {
  if (typeof window === 'undefined') return () => undefined
  const onGesture = () => {
    void unlockDashboardAudio()
  }
  window.addEventListener('pointerdown', onGesture, { passive: true })
  window.addEventListener('keydown', onGesture)
  return () => {
    window.removeEventListener('pointerdown', onGesture)
    window.removeEventListener('keydown', onGesture)
  }
}

function tone(
  ctx: AudioContext,
  {
    frequency,
    start,
    duration,
    type = 'sine',
    gain = 0.22,
    ramp = 'exp',
  }: {
    frequency: number
    start: number
    duration: number
    type?: OscillatorType
    gain?: number
    ramp?: 'exp' | 'linear'
  },
): void {
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.value = frequency
  g.gain.setValueAtTime(0.0001, start)
  if (ramp === 'linear') {
    g.gain.linearRampToValueAtTime(gain, start + 0.02)
    g.gain.linearRampToValueAtTime(0.0001, start + duration)
  } else {
    g.gain.exponentialRampToValueAtTime(gain, start + 0.025)
    g.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  }
  osc.connect(g)
  g.connect(ctx.destination)
  osc.start(start)
  osc.stop(start + duration + 0.02)
}

/** Play a built-in dashboard notification sound. */
export async function playDashboardSound(id: string | null | undefined): Promise<void> {
  const sound = normalizeDashboardSoundId(id)
  const ctx = getAudioContext()
  if (!ctx) return
  try {
    if (ctx.state === 'suspended') await ctx.resume()
  } catch {
    return
  }
  unlocked = ctx.state === 'running'
  if (!unlocked && ctx.state !== 'running') return

  const t0 = ctx.currentTime + 0.02
  switch (sound) {
    case 'chime':
      tone(ctx, { frequency: 784, start: t0, duration: 0.28, gain: 0.2 })
      tone(ctx, { frequency: 1046.5, start: t0 + 0.18, duration: 0.45, gain: 0.18 })
      break
    case 'alert':
      tone(ctx, { frequency: 880, start: t0, duration: 0.12, type: 'square', gain: 0.12 })
      tone(ctx, { frequency: 880, start: t0 + 0.18, duration: 0.12, type: 'square', gain: 0.12 })
      tone(ctx, { frequency: 880, start: t0 + 0.36, duration: 0.16, type: 'square', gain: 0.12 })
      break
    case 'doorbell':
      tone(ctx, { frequency: 523.25, start: t0, duration: 0.35, gain: 0.2 })
      tone(ctx, { frequency: 392, start: t0 + 0.32, duration: 0.55, gain: 0.18 })
      break
    case 'ping':
      tone(ctx, { frequency: 1320, start: t0, duration: 0.2, type: 'triangle', gain: 0.16 })
      break
    case 'siren':
      {
        const osc = ctx.createOscillator()
        const g = ctx.createGain()
        osc.type = 'sawtooth'
        osc.frequency.setValueAtTime(600, t0)
        osc.frequency.linearRampToValueAtTime(1100, t0 + 0.45)
        osc.frequency.linearRampToValueAtTime(600, t0 + 0.9)
        g.gain.setValueAtTime(0.0001, t0)
        g.gain.exponentialRampToValueAtTime(0.1, t0 + 0.05)
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.95)
        osc.connect(g)
        g.connect(ctx.destination)
        osc.start(t0)
        osc.stop(t0 + 1)
      }
      break
    default:
      tone(ctx, { frequency: 880, start: t0, duration: 0.25, gain: 0.18 })
  }
}
