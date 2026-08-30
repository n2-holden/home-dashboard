import { closedPercentToHaPosition, coverFromState, type HaCover, type HaState } from './positions'
import { sensorFromState, type HaSensor } from './energy'
import {
  forecastFromServiceResponse,
  type HaWeatherForecast,
} from './weather'
import type { HaAutomationConfig } from './schedules'
import {
  loadAutomationConfigs,
  fetchEntityRegistry,
  fetchScriptSequences,
  type EntityRegistryEntry,
} from './ws'
import type { AutomationLoadResult } from './ws'

export class HaApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export class HaClient {
  constructor(
    private token: string,
    private baseUrl: string = '',
  ) {}

  private url(path: string): string {
    const base = this.baseUrl.replace(/\/$/, '')
    return `${base}${path}`
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${this.token}`)
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    const res = await fetch(this.url(path), { ...init, headers })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new HaApiError(text || res.statusText || 'Home Assistant request failed', res.status)
    }
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }

  async ping(): Promise<boolean> {
    await this.request('/api/')
    return true
  }

  async getStates(): Promise<HaState[]> {
    return this.request<HaState[]>('/api/states')
  }

  async listCovers(): Promise<HaCover[]> {
    const states = await this.getStates()
    return this.coversFromStates(states)
  }

  async listSensors(): Promise<HaSensor[]> {
    const states = await this.getStates()
    return this.sensorsFromStates(states)
  }

  async listCoversAndSensors(): Promise<{ covers: HaCover[]; sensors: HaSensor[] }> {
    const states = await this.getStates()
    return {
      covers: this.coversFromStates(states),
      sensors: this.sensorsFromStates(states),
    }
  }

  private coversFromStates(states: HaState[]): HaCover[] {
    return states
      .filter((s) => s.entity_id.startsWith('cover.'))
      .map(coverFromState)
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  private sensorsFromStates(states: HaState[]): HaSensor[] {
    return states
      .filter((s) => s.entity_id.startsWith('sensor.'))
      .map(sensorFromState)
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  async getCover(entityId: string): Promise<HaCover> {
    const state = await this.request<HaState>(`/api/states/${encodeURIComponent(entityId)}`)
    return coverFromState(state)
  }

  /** closedPercent: dashboard convention (0 open … 100 closed) */
  async setCoverClosedPercent(entityId: string, closedPercent: number): Promise<void> {
    await this.request('/api/services/cover/set_cover_position', {
      method: 'POST',
      body: JSON.stringify({
        entity_id: entityId,
        position: closedPercentToHaPosition(closedPercent),
      }),
    })
  }

  async openCover(entityId: string): Promise<void> {
    await this.request('/api/services/cover/open_cover', {
      method: 'POST',
      body: JSON.stringify({ entity_id: entityId }),
    })
  }

  async closeCover(entityId: string): Promise<void> {
    await this.request('/api/services/cover/close_cover', {
      method: 'POST',
      body: JSON.stringify({ entity_id: entityId }),
    })
  }

  async setSwitch(entityId: string, on: boolean): Promise<void> {
    await this.request(on ? '/api/services/switch/turn_on' : '/api/services/switch/turn_off', {
      method: 'POST',
      body: JSON.stringify({ entity_id: entityId }),
    })
  }

  async setLight(entityId: string, on: boolean): Promise<void> {
    await this.request(on ? '/api/services/light/turn_on' : '/api/services/light/turn_off', {
      method: 'POST',
      body: JSON.stringify({ entity_id: entityId }),
    })
  }

  async setLightBrightness(entityId: string, percent: number): Promise<void> {
    const brightness = Math.max(1, Math.min(100, Math.round(percent))) * 255 / 100
    await this.request('/api/services/light/turn_on', {
      method: 'POST',
      body: JSON.stringify({
        entity_id: entityId,
        brightness: Math.round(brightness),
      }),
    })
  }

  async activateScene(entityId: string): Promise<void> {
    await this.request('/api/services/scene/turn_on', {
      method: 'POST',
      body: JSON.stringify({ entity_id: entityId }),
    })
  }

  async persistCrestronLightRoom(entityId: string, room: string): Promise<void> {
    await this.request('/api/services/script/turn_on', {
      method: 'POST',
      body: JSON.stringify({
        entity_id: 'script.dashboard_set_crestron_light_room',
        variables: { light_entity_id: entityId, room },
      }),
    })
  }

  async setSelect(entityId: string, option: string): Promise<void> {
    await this.request('/api/services/input_select/select_option', {
      method: 'POST',
      body: JSON.stringify({ entity_id: entityId, option }),
    })
  }

  async setNumber(entityId: string, value: number): Promise<void> {
    await this.request('/api/services/input_number/set_value', {
      method: 'POST',
      body: JSON.stringify({ entity_id: entityId, value }),
    })
  }

  /** Writes pool/pond depthOffset to HA www JSON (script or event → package automation). */
  async persistMapDepthOffset(kind: 'pool' | 'pond', offset: number): Promise<void> {
    const payload = { kind, offset }
    try {
      await this.request('/api/services/script/dashboard_set_map_offset', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      return
    } catch {
      /* script not configured — fall through to event */
    }
    await this.request('/api/events/dashboard_update_map_offset', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async loadAutomations(): Promise<AutomationLoadResult> {
    const states = await this.getStates()
    const automationEntityCount = states.filter((state) =>
      state.entity_id.startsWith('automation.'),
    ).length
    return loadAutomationConfigs(this.token, this.baseUrl, automationEntityCount)
  }

  async listAutomationConfigs(): Promise<HaAutomationConfig[]> {
    const result = await this.loadAutomations()
    return result.configs
  }

  async listScriptSequences(scriptEntityIds: string[]): Promise<Record<string, unknown>> {
    return fetchScriptSequences(this.token, this.baseUrl, scriptEntityIds)
  }

  async listEntityRegistry(): Promise<EntityRegistryEntry[]> {
    return fetchEntityRegistry(this.token, this.baseUrl).catch(() => [])
  }

  async getWeatherForecasts(
    entityId: string,
    type: 'daily' | 'hourly' | 'twice_daily' = 'daily',
  ): Promise<HaWeatherForecast[]> {
    const response = await this.request<unknown>(
      '/api/services/weather/get_forecasts?return_response=true',
      {
        method: 'POST',
        body: JSON.stringify({ entity_id: entityId, type }),
      },
    )
    return forecastFromServiceResponse(response, entityId)
  }
}
