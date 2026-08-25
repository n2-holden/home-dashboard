import type { HaAutomationConfig } from './schedules'

const WS_TIMEOUT_MS = 45_000

type WsMessage = {
  id?: number
  type: string
  success?: boolean
  result?: unknown
  error?: { message?: string }
}

type AutomationListItem = { id: string; alias?: string }

export type AutomationLoadResult = {
  configs: HaAutomationConfig[]
  listedIds: string[]
  automationEntityCount: number
  errors: string[]
}

export async function loadAutomationConfigs(
  token: string,
  baseUrl: string,
  automationEntityCount: number,
): Promise<AutomationLoadResult> {
  const errors: string[] = []
  let listedIds: string[] = []

  try {
    listedIds = await fetchAutomationIdList(token, baseUrl)
  } catch (err) {
    errors.push(formatError('WebSocket list', err))
  }

  if (listedIds.length === 0) {
    errors.push('No automation IDs returned from Home Assistant')
    return { configs: [], listedIds: [], automationEntityCount, errors }
  }

  let configs: HaAutomationConfig[] = []
  try {
    configs = await fetchAutomationConfigsByIds(token, baseUrl, listedIds)
  } catch (err) {
    errors.push(formatError('WebSocket config', err))
  }

  if (configs.length === 0) {
    errors.push(`WebSocket returned 0/${listedIds.length} automation configs`)
  }

  return { configs, listedIds, automationEntityCount, errors }
}

async function fetchAutomationIdList(token: string, baseUrl: string): Promise<string[]> {
  const listed = await withHomeAssistantSession(token, baseUrl, async (request) =>
    request<AutomationListItem[]>('config/automation/list'),
  )
  return listed.map((item) => item.id).filter((id) => id.length > 0)
}

async function fetchAutomationConfigsByIds(
  token: string,
  baseUrl: string,
  ids: string[],
): Promise<HaAutomationConfig[]> {
  const configs = await withHomeAssistantSession(token, baseUrl, async (request) =>
    Promise.all(
      ids.map((automationId) =>
        request<HaAutomationConfig>('config/automation/config', {
          automation_id: automationId,
        }).catch(() => null),
      ),
    ),
  )

  return configs.filter((config): config is HaAutomationConfig => config != null)
}

/** @deprecated Use loadAutomationConfigs */
export async function fetchAutomationConfigs(
  token: string,
  baseUrl: string,
): Promise<HaAutomationConfig[]> {
  const result = await loadAutomationConfigs(token, baseUrl, 0)
  return result.configs
}

export async function fetchScriptSequences(
  token: string,
  baseUrl: string,
  scriptEntityIds: string[],
): Promise<Record<string, unknown>> {
  const uniqueIds = [...new Set(scriptEntityIds.map((entityId) => entityId.replace(/^script\./, '')))]
  if (uniqueIds.length === 0) return {}

  const entries = await withHomeAssistantSession(token, baseUrl, async (request) =>
    Promise.all(
      uniqueIds.map(async (scriptId) => {
        const config = await request<{ sequence?: unknown }>('config/script/config', {
          script_id: scriptId,
        }).catch(() => null)
        return [scriptId, config?.sequence ?? null] as const
      }),
    ),
  )

  const result: Record<string, unknown> = {}
  for (const [scriptId, sequence] of entries) {
    if (sequence != null) result[`script.${scriptId}`] = sequence
  }
  return result
}

type EntityRegistryEntry = {
  entity_id: string
  area_id: string | null
}

export async function fetchEntityRegistry(
  token: string,
  baseUrl: string,
): Promise<EntityRegistryEntry[]> {
  return withHomeAssistantSession(token, baseUrl, async (request) => {
    const entries = await request<Array<Record<string, unknown>>>('config/entity_registry/list')
    return entries
      .map((entry) => ({
        entity_id: typeof entry.entity_id === 'string' ? entry.entity_id : '',
        area_id: typeof entry.area_id === 'string' ? entry.area_id : null,
      }))
      .filter((entry) => entry.entity_id.length > 0)
  })
}

async function withHomeAssistantSession<T>(
  token: string,
  baseUrl: string,
  run: (request: <R>(type: string, extra?: Record<string, unknown>) => Promise<R>) => Promise<T>,
): Promise<T> {
  const url = websocketUrl(baseUrl)
  const ws = new WebSocket(url)

  return await new Promise<T>((resolve, reject) => {
    let msgId = 1
    let settled = false
    let opened = false
    const pending = new Map<number, (message: WsMessage) => void>()

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeoutId)
      try {
        ws.close()
      } catch {
        /* ignore */
      }
      fn()
    }

    const timeoutId = window.setTimeout(() => {
      finish(() =>
        reject(
          new Error(
            opened
              ? 'Home Assistant websocket timed out'
              : `Home Assistant websocket did not connect (${url})`,
          ),
        ),
      )
    }, WS_TIMEOUT_MS)

    const send = (payload: Record<string, unknown>) => {
      ws.send(JSON.stringify(payload))
    }

    const request = <R>(type: string, extra: Record<string, unknown> = {}): Promise<R> =>
      new Promise<R>((resolveRequest, rejectRequest) => {
        const id = msgId++
        pending.set(id, (message) => {
          if (!message.success) {
            rejectRequest(new Error(message.error?.message ?? 'Home Assistant websocket request failed'))
            return
          }
          resolveRequest(message.result as R)
        })
        send({ id, type, ...extra })
      })

    ws.onopen = () => {
      opened = true
    }

    ws.onerror = () => {
      finish(() => reject(new Error(`Home Assistant websocket connection failed (${url})`)))
    }

    ws.onmessage = (event) => {
      let message: WsMessage
      try {
        message = JSON.parse(String(event.data)) as WsMessage
      } catch {
        return
      }

      if (message.type === 'auth_required') {
        send({ type: 'auth', access_token: token })
        return
      }

      if (message.type === 'auth_invalid') {
        finish(() => reject(new Error(message.error?.message ?? 'Home Assistant auth failed')))
        return
      }

      if (message.type === 'auth_ok') {
        void run(request)
          .then((result) => finish(() => resolve(result)))
          .catch((err) =>
            finish(() => reject(err instanceof Error ? err : new Error('Home Assistant websocket failed'))),
          )
        return
      }

      if (message.type === 'result' && message.id != null) {
        pending.get(message.id)?.(message)
        pending.delete(message.id)
      }
    }
  })
}

function websocketUrl(baseUrl: string): string {
  if (baseUrl.trim()) {
    const url = new URL(baseUrl, location.origin)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.pathname = '/api/websocket'
    url.search = ''
    url.hash = ''
    return url.toString()
  }

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${location.host}/api/websocket`
}

function formatError(label: string, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return `${label}: ${message}`
}
