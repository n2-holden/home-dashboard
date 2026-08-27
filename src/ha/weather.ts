import type { HaState } from './positions'

export type HaWeatherForecast = {
  datetime: string | null
  condition: string
  temperature: number | null
  templow: number | null
  precipitation: number | null
  precipitationProbability: number | null
}

export type HaWeather = {
  entityId: string
  name: string
  condition: string
  temperature: number | null
  temperatureUnit: string
  humidity: number | null
  windSpeed: number | null
  windSpeedUnit: string
  forecast: HaWeatherForecast[]
}

export type WeatherSnapshot = {
  entityId: string
  name: string
  condition: string
  temperatureLabel: string
  conditionLabel: string
  highLabel: string
  lowLabel: string
  windLabel: string
  forecast: Array<{
    dayLabel: string
    highLabel: string
    lowLabel: string
    rainLabel: string
    condition: string
    conditionLabel: string
  }>
}

const WEATHER_ENTITY_PREFERENCE = [
  'weather.home',
  'weather.forecast_home',
  'weather.buienradar',
]

export function weatherFromState(state: HaState): HaWeather {
  const attrs = state.attributes
  const forecastRaw = Array.isArray(attrs.forecast) ? attrs.forecast : []
  const forecast = parseForecastItems(forecastRaw)

  return {
    entityId: state.entity_id,
    name: typeof attrs.friendly_name === 'string' ? attrs.friendly_name : state.entity_id,
    condition: state.state || 'unknown',
    temperature: toNumber(attrs.temperature),
    temperatureUnit: typeof attrs.temperature_unit === 'string' ? attrs.temperature_unit : '°F',
    humidity: toNumber(attrs.humidity),
    windSpeed: toNumber(attrs.wind_speed),
    windSpeedUnit: typeof attrs.wind_speed_unit === 'string' ? attrs.wind_speed_unit : 'mph',
    forecast,
  }
}

export function parseForecastItems(raw: unknown[]): HaWeatherForecast[] {
  return raw.slice(0, 5).map((item) => {
    if (!item || typeof item !== 'object') {
      return emptyForecastItem()
    }
    const row = item as Record<string, unknown>
    return {
      datetime: typeof row.datetime === 'string' ? row.datetime : null,
      condition: typeof row.condition === 'string' ? row.condition : 'unknown',
      temperature: toNumber(row.temperature),
      templow: toNumber(row.templow),
      precipitation: toNumber(row.precipitation),
      precipitationProbability: toNumber(
        row.precipitation_probability ?? row.precip_probability ?? row.precipitationProbability,
      ),
    }
  })
}

export function forecastFromServiceResponse(response: unknown, entityId: string): HaWeatherForecast[] {
  if (!response || typeof response !== 'object') return []
  const root = response as Record<string, unknown>
  const serviceResponse =
    root.service_response && typeof root.service_response === 'object'
      ? (root.service_response as Record<string, unknown>)
      : root
  const entityData = serviceResponse[entityId]
  if (!entityData || typeof entityData !== 'object') return []
  const forecast = (entityData as Record<string, unknown>).forecast
  return parseForecastItems(Array.isArray(forecast) ? forecast : [])
}

function emptyForecastItem(): HaWeatherForecast {
  return {
    datetime: null,
    condition: 'unknown',
    temperature: null,
    templow: null,
    precipitation: null,
    precipitationProbability: null,
  }
}

export function pickWeatherEntity(entities: HaWeather[]): HaWeather | null {
  if (entities.length === 0) return null
  const byId = new Map(entities.map((e) => [e.entityId, e]))
  for (const id of WEATHER_ENTITY_PREFERENCE) {
    const match = byId.get(id)
    if (match) return match
  }
  return entities[0] ?? null
}

export function weatherSnapshot(weather: HaWeather | null): WeatherSnapshot | null {
  if (!weather) return null

  const today = weather.forecast[0]
  const high = today?.temperature ?? weather.temperature
  const low = today?.templow ?? null

  return {
    entityId: weather.entityId,
    name: weather.name,
    condition: weather.condition,
    temperatureLabel: formatTemp(weather.temperature, weather.temperatureUnit),
    conditionLabel: formatCondition(weather.condition),
    highLabel: formatTemp(high, weather.temperatureUnit),
    lowLabel: formatTemp(low, weather.temperatureUnit),
    windLabel: formatWind(weather.windSpeed, weather.windSpeedUnit),
    forecast: weather.forecast.slice(0, 5).map((day) => ({
      dayLabel: formatForecastDay(day.datetime),
      highLabel: formatTemp(day.temperature, weather.temperatureUnit),
      lowLabel: formatTemp(day.templow, weather.temperatureUnit),
      rainLabel: formatRain(day.precipitationProbability, day.precipitation, day.condition),
      condition: day.condition,
      conditionLabel: formatCondition(day.condition),
    })),
  }
}

function toNumber(value: unknown): number | null {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : null
}

function formatTemp(value: number | null, unit: string): string {
  if (value == null) return '—'
  const suffix = unit.startsWith('°') ? unit : ` ${unit}`
  return `${Math.round(value)}${suffix}`
}

function formatWind(speed: number | null, unit: string): string {
  if (speed == null) return '—'
  return `${Math.round(speed)} ${unit}`
}

function formatRain(
  probability: number | null,
  amount: number | null,
  condition: string,
): string {
  if (probability != null) return `${Math.round(probability)}%`
  if (amount != null && amount > 0) return `${amount.toFixed(2)} in`
  if (/rain|pour|drizzle|storm|snow|hail|sleet/i.test(condition)) return 'Likely'
  return '0%'
}

export function formatCondition(condition: string): string {
  const key = condition.trim().toLowerCase()
  const labels: Record<string, string> = {
    clear: 'Clear',
    clear_night: 'Clear',
    cloudy: 'Cloudy',
    exceptional: 'Exceptional',
    fog: 'Fog',
    hail: 'Hail',
    lightning: 'Lightning',
    lightning_rainy: 'Thunderstorms',
    partlycloudy: 'Partly cloudy',
    pouring: 'Heavy rain',
    rainy: 'Rain',
    snowy: 'Snow',
    snowy_rainy: 'Sleet',
    sunny: 'Sunny',
    windy: 'Windy',
    windy_variant: 'Windy',
  }
  return labels[key] ?? condition.replace(/_/g, ' ')
}

function formatForecastDay(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date)
}

export function weatherConditionSymbol(condition: string): string {
  const key = condition.trim().toLowerCase()
  const symbols: Record<string, string> = {
    clear: '☀',
    clear_night: '🌙',
    cloudy: '☁',
    fog: '🌫',
    hail: '🌨',
    lightning: '⚡',
    lightning_rainy: '⛈',
    partlycloudy: '⛅',
    pouring: '🌧',
    rainy: '🌧',
    snowy: '❄',
    snowy_rainy: '🌨',
    sunny: '☀',
    windy: '💨',
    windy_variant: '💨',
  }
  return symbols[key] ?? '◌'
}
