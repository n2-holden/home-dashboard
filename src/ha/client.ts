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
import { encodeControlLogDetail } from './controlLog'

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
    const state = await this.getEntityState(entityId)
    return coverFromState(state)
  }

  async getEntityState(entityId: string): Promise<HaState> {
    return this.request<HaState>(`/api/states/${encodeURIComponent(entityId)}`)
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

  async toggleCover(entityId: string): Promise<void> {
    await this.request('/api/services/cover/toggle', {
      method: 'POST',
      body: JSON.stringify({ entity_id: entityId }),
    })
  }

  async pressButton(entityId: string): Promise<void> {
    await this.request('/api/services/button/press', {
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

  async setValve(entityId: string, open: boolean): Promise<void> {
    await this.request(open ? '/api/services/valve/open_valve' : '/api/services/valve/close_valve', {
      method: 'POST',
      body: JSON.stringify({ entity_id: entityId }),
    })
  }

  async setInputBoolean(entityId: string, on: boolean): Promise<void> {
    await this.request(
      on ? '/api/services/input_boolean/turn_on' : '/api/services/input_boolean/turn_off',
      {
        method: 'POST',
        body: JSON.stringify({ entity_id: entityId }),
      },
    )
  }

  async setInputText(entityId: string, value: string): Promise<void> {
    await this.request('/api/services/input_text/set_value', {
      method: 'POST',
      body: JSON.stringify({ entity_id: entityId, value }),
    })
  }

  /** Set time-only input_datetime (HH:MM:SS). */
  async setInputDatetimeTime(entityId: string, time: string): Promise<void> {
    await this.request('/api/services/input_datetime/set_datetime', {
      method: 'POST',
      body: JSON.stringify({ entity_id: entityId, time }),
    })
  }

  /** Send email via script.dashboard_notify_email (honors input_text override). */
  async sendDashboardEmail(title: string, message: string, recipient?: string): Promise<void> {
    await this.request('/api/services/script/dashboard_notify_email', {
      method: 'POST',
      body: JSON.stringify({
        title,
        message,
        recipient: recipient ?? '',
      }),
    })
  }

  /** Send phone push via script.dashboard_notify_phone (Companion App notify entity). */
  async sendDashboardPhone(title: string, message: string, target?: string): Promise<void> {
    await this.request('/api/services/script/dashboard_notify_phone', {
      method: 'POST',
      body: JSON.stringify({
        title,
        message,
        target: target ?? '',
      }),
    })
  }

  /** Persist automation/notification prefs to www/home-dashboard/dashboard-settings.json. */
  async persistDashboardSettings(patchB64: string): Promise<void> {
    const payload = { patch_b64: patchB64 }
    try {
      await this.request('/api/services/script/dashboard_update_settings', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      return
    } catch {
      /* fall through */
    }
    await this.request('/api/services/shell_command/dashboard_update_settings', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async setFan(entityId: string, on: boolean): Promise<void> {
    await this.request(on ? '/api/services/fan/turn_on' : '/api/services/fan/turn_off', {
      method: 'POST',
      body: JSON.stringify({ entity_id: entityId }),
    })
  }

  async setLight(
    entityId: string,
    on: boolean,
    options?: { brightness?: number },
  ): Promise<void> {
    if (!on) {
      await this.request('/api/services/light/turn_off', {
        method: 'POST',
        body: JSON.stringify({ entity_id: entityId }),
      })
      return
    }

    const payload: { entity_id: string; brightness?: number } = { entity_id: entityId }
    if (options?.brightness != null) {
      payload.brightness = Math.max(1, Math.min(255, Math.round(options.brightness)))
    }

    await this.request('/api/services/light/turn_on', {
      method: 'POST',
      body: JSON.stringify(payload),
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

  async mediaStop(entityIds: string | string[]): Promise<void> {
    const ids = Array.isArray(entityIds) ? entityIds : [entityIds]
    if (ids.length === 0) return
    await this.request('/api/services/media_player/media_stop', {
      method: 'POST',
      body: JSON.stringify({ entity_id: ids.length === 1 ? ids[0] : ids }),
    })
  }

  async mediaPlayerTurnOn(entityId: string): Promise<void> {
    await this.request('/api/services/media_player/turn_on', {
      method: 'POST',
      body: JSON.stringify({ entity_id: entityId }),
    })
  }

  async mediaPlayerTurnOff(entityId: string): Promise<void> {
    await this.request('/api/services/media_player/turn_off', {
      method: 'POST',
      body: JSON.stringify({ entity_id: entityId }),
    })
  }

  async mediaPlay(entityIds: string | string[]): Promise<void> {
    const ids = Array.isArray(entityIds) ? entityIds : [entityIds]
    if (ids.length === 0) return
    await this.request('/api/services/media_player/media_play', {
      method: 'POST',
      body: JSON.stringify({ entity_id: ids.length === 1 ? ids[0] : ids }),
    })
  }

  async selectMediaSource(entityId: string, source: string): Promise<void> {
    await this.request('/api/services/media_player/select_source', {
      method: 'POST',
      body: JSON.stringify({ entity_id: entityId, source }),
    })
  }

  async setMediaVolume(entityId: string, volumePercent: number): Promise<void> {
    const level = Math.max(0, Math.min(100, volumePercent)) / 100
    await this.request('/api/services/media_player/volume_set', {
      method: 'POST',
      body: JSON.stringify({ entity_id: entityId, volume_level: level }),
    })
  }

  async activateScene(entityId: string): Promise<void> {
    await this.request('/api/services/scene/turn_on', {
      method: 'POST',
      body: JSON.stringify({ entity_id: entityId }),
    })
  }

  /** Ask HA integrations to refresh entity state before reading /api/states. */
  async refreshEntities(entityIds: string[]): Promise<void> {
    const unique = [...new Set(entityIds.filter(Boolean))]
    if (unique.length === 0) return
    await this.request('/api/services/homeassistant/update_entity', {
      method: 'POST',
      body: JSON.stringify({ entity_id: unique }),
    })
  }


  async logControlEvent(entry: {
    source?: string
    actor: string
    action: string
    entityId?: string | null
    detail?: unknown
    ok?: boolean
  }): Promise<void> {
    const payload = {
      source: entry.source ?? 'dashboard',
      actor: entry.actor,
      action: entry.action,
      entity_id: entry.entityId ?? '',
      ok: entry.ok === false ? '0' : '1',
      detail_b64: encodeControlLogDetail(entry.detail),
    }
    // Prefer the script service (field args). Fall back to shell_command.
    try {
      await this.request('/api/services/script/dashboard_log_control', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      return
    } catch {
      /* try shell_command */
    }
    await this.request('/api/services/shell_command/dashboard_append_control_log', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async clearControlLog(): Promise<void> {
    try {
      await this.request('/api/services/script/dashboard_clear_control_log', {
        method: 'POST',
        body: JSON.stringify({}),
      })
      return
    } catch {
      /* try shell_command */
    }
    await this.request('/api/services/shell_command/dashboard_clear_control_log', {
      method: 'POST',
      body: JSON.stringify({}),
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

  async runScript(entityId: string): Promise<void> {
    await this.request('/api/services/script/turn_on', {
      method: 'POST',
      body: JSON.stringify({ entity_id: entityId }),
    })
  }

  async setNumber(entityId: string, value: number): Promise<void> {
    await this.request('/api/services/input_number/set_value', {
      method: 'POST',
      body: JSON.stringify({ entity_id: entityId, value }),
    })
  }

  async setClimateMode(entityId: string, hvacMode: string): Promise<void> {
    await this.request('/api/services/climate/set_hvac_mode', {
      method: 'POST',
      body: JSON.stringify({ entity_id: entityId, hvac_mode: hvacMode }),
    })
  }

  async setClimateTemperature(entityId: string, temperature: number): Promise<void> {
    await this.request('/api/services/climate/set_temperature', {
      method: 'POST',
      body: JSON.stringify({ entity_id: entityId, temperature }),
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
    const limit = type === 'hourly' ? 48 : 5
    return forecastFromServiceResponse(response, entityId, limit)
  }

  /** Events for a calendar entity between start (inclusive) and end (exclusive). */
  async getCalendarEvents(
    entityId: string,
    start: Date,
    end: Date,
  ): Promise<unknown> {
    const params = new URLSearchParams({
      start: start.toISOString(),
      end: end.toISOString(),
    })
    return this.request<unknown>(
      `/api/calendars/${encodeURIComponent(entityId)}?${params.toString()}`,
    )
  }

  /** HA recorder history for one or more entities between start and end. */
  async getEntitiesHistory(
    entityIds: string[],
    start: Date,
    end: Date,
    options?: {
      /** When true (default), HA omits entity_id on later rows in each bucket. */
      minimalResponse?: boolean
      /** When true (default), HA may skip some state transitions. */
      significantChangesOnly?: boolean
    },
  ): Promise<unknown> {
    const unique = [...new Set(entityIds.filter(Boolean))]
    if (unique.length === 0) return []
    const startIso = start.toISOString()
    const endIso = end.toISOString()
    const params = new URLSearchParams({
      filter_entity_id: unique.join(','),
      end_time: endIso,
    })
    // Empty-string flags are treated as true by HA; only send when explicitly enabled.
    if (options?.minimalResponse !== false) {
      params.set('minimal_response', '')
    }
    if (options?.significantChangesOnly === false) {
      params.set('significant_changes_only', '0')
    } else {
      params.set('significant_changes_only', '')
    }
    return this.request<unknown>(
      `/api/history/period/${encodeURIComponent(startIso)}?${params.toString()}`,
    )
  }

  /** HA recorder history for one entity between start and end (inclusive window). */
  async getEntityHistory(entityId: string, start: Date, end: Date): Promise<unknown> {
    return this.getEntitiesHistory([entityId], start, end)
  }
}
