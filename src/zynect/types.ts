export type ZynectConfig = {
  baseUrl: string
  authHeaderName: string
  authHeaderValue: string
  product: string
  refreshIntervalSeconds: number
  siteLatitude: number
  siteLongitude: number
}

export type SensorReading = {
  eggId: string
  name: string
  value: number | null
  unit: string
  lastUpdatedUtc: string | null
  batteryPercent: number | null
  minScale: number | null
  maxScale: number | null
}

export type HistoryPoint = {
  timestamp: string
  value: number
}

export type ChartSeries = {
  name: string
  color: string
  points: HistoryPoint[]
}

export const CHART_PALETTE = [
  '#2E86AB',
  '#E53935',
  '#4CAF50',
  '#F5A623',
  '#9B59B6',
  '#009688',
] as const

export const PREFERRED_GAUGE_ORDER = [
  'Collector out',
  'Tank supply',
  'Tank return',
  'Return',
  'Pool supply',
  'Pool return',
] as const

export const GAUGE_LAYOUT: Array<{ key: string; row: number; col: number }> = [
  { key: 'Collector out', row: 0, col: 0 },
  { key: 'Tank supply', row: 0, col: 1 },
  { key: 'Tank return', row: 0, col: 2 },
  { key: 'Return', row: 0, col: 3 },
  { key: 'Pool supply', row: 1, col: 1 },
  { key: 'Pool return', row: 1, col: 2 },
]

export const DEFAULT_ZYNECT_CONFIG: ZynectConfig = {
  baseUrl: 'https://zynect.com/api/v2/',
  authHeaderName: 'Authorization',
  authHeaderValue: '',
  product: 'thermote',
  refreshIntervalSeconds: 30,
  siteLatitude: 40.019,
  siteLongitude: -105.2747,
}
