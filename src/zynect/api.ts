import type { ZynectConfig } from './types'

export class ZynectApiError extends Error {
  status: number | null
  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'ZynectApiError'
    this.status = status
  }
}

export class ZynectApiClient {
  constructor(private readonly config: ZynectConfig) {}

  getAuthorizedEggs(): Promise<unknown> {
    return this.getJson(`authorized-eggs?p=${encodeURIComponent(this.config.product)}`)
  }

  getSensorGroups(): Promise<unknown> {
    return this.getJson('my-sensor-groups')
  }

  getCurrentReadings(tokens: string[]): Promise<unknown> {
    return this.getJson(`zynect-egg/${idSegment(tokens.join(','))}`)
  }

  getReadingsMeta(eggIds: string[]): Promise<unknown> {
    return this.getJson(`zynect-egg/${idSegment(eggIds.join(','))}?versionOnly=1`)
  }

  getHistory(eggIds: string[], start: Date, end: Date): Promise<unknown> {
    const startParam = encodeURIComponent(start.toISOString())
    const endParam = encodeURIComponent(end.toISOString())
    return this.getJson(
      `zynect-egg/${idSegment(eggIds.join(','))}?start=${startParam}&end=${endParam}`,
    )
  }

  private async getJson(relativeUrl: string): Promise<unknown> {
    const base = this.config.baseUrl.endsWith('/')
      ? this.config.baseUrl
      : `${this.config.baseUrl}/`
    const url = new URL(relativeUrl, base)
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (this.config.authHeaderName && this.config.authHeaderValue) {
      headers[this.config.authHeaderName] = this.config.authHeaderValue
    }
    const res = await fetch(url.toString(), { headers, cache: 'no-store' })
    const text = await res.text()
    if (!res.ok) {
      throw new ZynectApiError(
        `${res.status} ${res.statusText}: ${text.slice(0, 300)}`,
        res.status,
      )
    }
    if (!text.trim()) return null
    return JSON.parse(text) as unknown
  }
}

function idSegment(commaJoined: string): string {
  return encodeURIComponent(commaJoined).replace(/%2C/gi, ',')
}
