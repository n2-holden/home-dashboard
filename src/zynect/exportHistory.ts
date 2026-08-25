import type { ChartSeries } from './types'

export function historyHasPoints(series: ChartSeries[]): boolean {
  return series.some((s) => s.points.length > 0)
}

export function downloadHistoryCsv(series: ChartSeries[], rangeDays: number): void {
  const active = series.filter((s) => s.points.length > 0)
  if (active.length === 0) return

  const header = active.flatMap((s) => [`${s.name} timestamp`, s.name])
  const maxRows = Math.max(...active.map((s) => s.points.length))

  const lines = [header.map(csvCell).join(',')]
  for (let row = 0; row < maxRows; row += 1) {
    const cells: string[] = []
    for (const s of active) {
      const point = s.points[row]
      if (point) {
        cells.push(csvCell(point.timestamp), String(point.value))
      } else {
        cells.push('', '')
      }
    }
    lines.push(cells.join(','))
  }

  const blob = new Blob([`${lines.join('\n')}\n`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `solar-thermal-history-${rangeDays}d-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}
