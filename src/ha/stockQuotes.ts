export type StockQuote = {
  symbol: string
  name: string
  price: number
  change: number | null
  changePercent: number | null
  currency?: string | null
  marketTimeMs?: number | null
  /** Last good quote kept after a failed refresh. */
  stale?: boolean
}

export type StockQuotesSnapshot = {
  fetchedAt: string
  marketOpen?: boolean
  symbols: string[]
  quotes: StockQuote[]
  /** Symbols whose last fetch failed (e.g. unknown ticker) → error text. */
  errors?: Record<string, string>
}

/** Written every 5 minutes by HA `dashboard_sync/stock_quotes.py`. */
export async function fetchStockQuotes(): Promise<StockQuotesSnapshot | null> {
  try {
    const url = new URL('stock-quotes.json', new URL('./', location.href))
    url.searchParams.set('t', String(Date.now()))
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const parsed = (await res.json()) as StockQuotesSnapshot
    return parsed && Array.isArray(parsed.quotes) ? parsed : null
  } catch {
    return null
  }
}
