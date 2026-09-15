/** G.711 µ-law (PCMU) encode/decode at 8 kHz — DoorBird LAN audio format. */

const BIAS = 0x84
const CLIP = 32635
const ENCODE_TABLE = [
  0, 0, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
  4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
  5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
  6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
  6, 6, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
  7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
  7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
  7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
  7, 7, 7,
] as const

export const DOORBIRD_SAMPLE_RATE = 8_000

/** Encode one linear PCM sample (-1…1 float) to µ-law byte. */
export function floatToMulaw(sample: number): number {
  let pcm = Math.max(-1, Math.min(1, sample)) * 32767
  let sign = 0
  if (pcm < 0) {
    sign = 0x80
    pcm = -pcm
  }
  if (pcm > CLIP) pcm = CLIP
  pcm += BIAS
  const exponent = ENCODE_TABLE[pcm >> 7] ?? 7
  const mantissa = (pcm >> (exponent + 3)) & 0x0f
  return ~(sign | (exponent << 4) | mantissa) & 0xff
}

/** Decode one µ-law byte to float sample (-1…1). */
export function mulawToFloat(mulawByte: number): number {
  const mu = ~mulawByte & 0xff
  const sign = mu & 0x80
  const exponent = (mu >> 4) & 0x07
  const mantissa = mu & 0x0f
  let sample = ((mantissa << 3) + BIAS) << exponent
  sample -= BIAS
  if (sign !== 0) sample = -sample
  return sample / 32768
}

export function encodeMulaw(float32: Float32Array): Uint8Array {
  const out = new Uint8Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    out[i] = floatToMulaw(float32[i]!)
  }
  return out
}

export function decodeMulaw(bytes: Uint8Array): Float32Array {
  const out = new Float32Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) {
    out[i] = mulawToFloat(bytes[i]!)
  }
  return out
}

/** Simple decimation / nearest-neighbor resample to DoorBird 8 kHz. */
export function downsampleToDoorBird(input: Float32Array, inputRate: number): Float32Array {
  if (inputRate === DOORBIRD_SAMPLE_RATE) return input
  if (inputRate <= 0) return new Float32Array(0)
  const ratio = inputRate / DOORBIRD_SAMPLE_RATE
  const outLen = Math.max(0, Math.floor(input.length / ratio))
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    out[i] = input[Math.min(input.length - 1, Math.floor(i * ratio))]!
  }
  return out
}

export function intercomApiUrl(path: string, baseUrl = ''): string {
  const base = baseUrl.replace(/\/$/, '')
  const origin = base || (typeof location !== 'undefined' ? location.origin : '')
  const normalized = path.startsWith('/') ? path : `/${path}`
  if (!origin) return normalized
  try {
    return new URL(normalized, origin).href
  } catch {
    return `${origin}${normalized}`
  }
}

/** Turn an HA path (optionally with authSig) into a ws/wss URL. */
export function intercomSignedWsUrl(path: string, baseUrl = ''): string {
  const httpUrl = intercomApiUrl(path, baseUrl)
  const url = new URL(httpUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.href
}

export function intercomWsUrl(path: string, token: string, baseUrl = ''): string {
  const url = new URL(intercomApiUrl(path, baseUrl))
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('access_token', token)
  return url.href
}
