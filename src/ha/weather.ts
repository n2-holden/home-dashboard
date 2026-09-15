import type { HaState } from './positions'

export type HaWeatherForecast = {
  datetime: string | null
  condition: string
  temperature: number | null
  templow: number | null
  precipitation: number | null
  precipitationProbability: number | null
  windSpeed: number | null
  humidity: number | null
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

/** Prefer the NWS Weather Forecast custom integration when present. */
function isNwsForecastEntity(entity: HaWeather): boolean {
  return (
    entity.entityId.startsWith('weather.nws_forecast_') ||
    /^NWS Forecast\b/i.test(entity.name)
  )
}

/** True when NWS emitted a night-only period (e.g. "Tonight") with high === low. */
function isNightOnlyForecast(day: HaWeatherForecast): boolean {
  return (
    day.temperature != null &&
    day.templow != null &&
    day.temperature === day.templow
  )
}

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

export function parseForecastItems(raw: unknown[], limit = 5): HaWeatherForecast[] {
  return raw.slice(0, limit).map((item) => {
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
      windSpeed: toNumber(row.wind_speed ?? row.windSpeed),
      humidity: toNumber(row.humidity),
    }
  })
}

export function forecastFromServiceResponse(
  response: unknown,
  entityId: string,
  limit = 5,
): HaWeatherForecast[] {
  if (!response || typeof response !== 'object') return []
  const root = response as Record<string, unknown>
  const serviceResponse =
    root.service_response && typeof root.service_response === 'object'
      ? (root.service_response as Record<string, unknown>)
      : root
  const entityData = serviceResponse[entityId]
  if (!entityData || typeof entityData !== 'object') return []
  const forecast = (entityData as Record<string, unknown>).forecast
  return parseForecastItems(Array.isArray(forecast) ? forecast : [], limit)
}

function emptyForecastItem(): HaWeatherForecast {
  return {
    datetime: null,
    condition: 'unknown',
    temperature: null,
    templow: null,
    precipitation: null,
    precipitationProbability: null,
    windSpeed: null,
    humidity: null,
  }
}

export function pickWeatherEntity(entities: HaWeather[]): HaWeather | null {
  if (entities.length === 0) return null
  const nws = entities.find(isNwsForecastEntity)
  if (nws) return nws
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
  // Evening "Tonight" periods have high === low; use current temp as high.
  const high =
    today && isNightOnlyForecast(today)
      ? (weather.temperature ?? today.temperature)
      : (today?.temperature ?? weather.temperature)
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
      dayLabel: formatForecastDay(day.datetime, day),
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

/** HA conditions may use hyphens (`clear-night`) or underscores. */
function conditionKey(condition: string): string {
  return condition.trim().toLowerCase().replace(/-/g, '_')
}

export function formatCondition(condition: string): string {
  const key = conditionKey(condition)
  const labels: Record<string, string> = {
    clear: 'Clear',
    clear_night: 'Clear',
    cloudy: 'Cloudy',
    exceptional: 'Exceptional',
    fog: 'Fog',
    hail: 'Hail',
    hurricane: 'Hurricane',
    lightning: 'Lightning',
    lightning_rainy: 'Thunderstorms',
    partlycloudy: 'Partly cloudy',
    pouring: 'Heavy rain',
    rainy: 'Rain',
    snowy: 'Snow',
    snowy_rainy: 'Sleet',
    sunny: 'Sunny',
    tornado: 'Tornado',
    tropical_storm: 'Tropical storm',
    windy: 'Windy',
    windy_variant: 'Windy',
  }
  return labels[key] ?? condition.replace(/[_-]/g, ' ')
}

function formatForecastDay(iso: string | null, day?: HaWeatherForecast): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  if (day && isNightOnlyForecast(day) && date.getHours() >= 15) return 'Tonight'
  return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date)
}

export function weatherConditionSymbol(condition: string): string {
  const key = conditionKey(condition)
  const symbols: Record<string, string> = {
    clear: '☀',
    clear_night: '🌙',
    cloudy: '☁',
    fog: '🌫',
    hail: '🌨',
    hurricane: '🌀',
    lightning: '⚡',
    lightning_rainy: '⛈',
    partlycloudy: '⛅',
    pouring: '🌧',
    rainy: '🌧',
    snowy: '❄',
    snowy_rainy: '🌨',
    sunny: '☀',
    tornado: '🌪',
    tropical_storm: '🌀',
    windy: '💨',
    windy_variant: '💨',
  }
  return symbols[key] ?? '◌'
}

export type HourlyWeatherRow = {
  key: string
  timeLabel: string
  condition: string
  conditionLabel: string
  symbol: string
  temperatureLabel: string
  rainLabel: string
  windLabel: string
  humidityLabel: string
}

/** Keep forecast hours for the local calendar day (including the current hour). */
export function filterHourlyForToday(items: HaWeatherForecast[], now = new Date()): HaWeatherForecast[] {
  const today = items.filter((item) => {
    if (!item.datetime) return false
    const when = new Date(item.datetime)
    if (Number.isNaN(when.getTime())) return false
    return isSameLocalDay(when, now) && when.getTime() >= now.getTime() - 45 * 60_000
  })
  if (today.length > 0) return today
  // Fallback if the provider only returns future hours past midnight.
  return items
    .filter((item) => {
      if (!item.datetime) return false
      const when = new Date(item.datetime)
      return !Number.isNaN(when.getTime()) && when.getTime() >= now.getTime() - 45 * 60_000
    })
    .slice(0, 12)
}

/** Remaining hours today plus all hours tomorrow (local calendar). */
export function filterHourlyForTodayAndTomorrow(
  items: HaWeatherForecast[],
  now = new Date(),
): HaWeatherForecast[] {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2)
  const filtered = items.filter((item) => {
    if (!item.datetime) return false
    const when = new Date(item.datetime)
    if (Number.isNaN(when.getTime())) return false
    return when.getTime() >= now.getTime() - 45 * 60_000 && when.getTime() < end.getTime()
  })
  if (filtered.length > 0) return filtered
  return items
    .filter((item) => {
      if (!item.datetime) return false
      const when = new Date(item.datetime)
      return !Number.isNaN(when.getTime()) && when.getTime() >= now.getTime() - 45 * 60_000
    })
    .slice(0, 36)
}

export type HourlyWeatherDaySection = {
  key: string
  label: string
  dateLabel: string
  rows: HourlyWeatherRow[]
}

/** Group hourly rows into Today / Tomorrow sections. */
export function groupHourlyByDay(
  items: HaWeatherForecast[],
  now = new Date(),
  temperatureUnit = '°F',
  windSpeedUnit = 'mph',
): HourlyWeatherDaySection[] {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const sections: HourlyWeatherDaySection[] = []

  for (let offset = 0; offset < 2; offset += 1) {
    const dayStart = new Date(
      todayStart.getFullYear(),
      todayStart.getMonth(),
      todayStart.getDate() + offset,
    )
    const dayItems = items.filter((item) => {
      if (!item.datetime) return false
      const when = new Date(item.datetime)
      return !Number.isNaN(when.getTime()) && isSameLocalDay(when, dayStart)
    })
    if (dayItems.length === 0) continue
    sections.push({
      key: dayStart.toISOString(),
      label: offset === 0 ? 'Today' : 'Tomorrow',
      dateLabel: new Intl.DateTimeFormat(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      }).format(dayStart),
      rows: hourlyWeatherRows(dayItems, temperatureUnit, windSpeedUnit),
    })
  }

  return sections
}

export function hourlyWeatherRows(
  items: HaWeatherForecast[],
  temperatureUnit = '°F',
  windSpeedUnit = 'mph',
): HourlyWeatherRow[] {
  return items.map((item, index) => {
    const when = item.datetime ? new Date(item.datetime) : null
    const timeLabel =
      when && !Number.isNaN(when.getTime())
        ? new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(when)
        : '—'
    return {
      key: item.datetime ?? `hour-${index}`,
      timeLabel,
      condition: item.condition,
      conditionLabel: formatCondition(item.condition),
      symbol: weatherConditionSymbol(item.condition),
      temperatureLabel: formatTemp(item.temperature, temperatureUnit),
      rainLabel: formatRain(item.precipitationProbability, item.precipitation, item.condition),
      windLabel: formatWind(item.windSpeed, windSpeedUnit),
      humidityLabel: item.humidity != null ? `${Math.round(item.humidity)}%` : '—',
    }
  })
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}
