import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useHouse } from '../data/HouseContext'
import { startVisibilityInterval } from '../hooks/visibilityInterval'
import type { StockFormula } from '../ha/dashboardSettings'
import { evaluateStockFormula, parseStockFormula } from '../ha/stockFormula'
import { fetchStockQuotes, type StockQuote, type StockQuotesSnapshot } from '../ha/stockQuotes'

const POLL_MS = 60_000
/** Scroll speed in pixels per second. */
const SCROLL_PX_PER_S = 40

type TickerItem = {
  key: string
  label: string
  title: string
  price: number | null
  change: number | null
}

function formatNumber(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formulaItem(formula: StockFormula, bySymbol: Map<string, StockQuote>): TickerItem {
  const item: TickerItem = {
    key: `formula:${formula.title}`,
    label: formula.title,
    title: `${formula.title} = ${formula.formula}`,
    price: null,
    change: null,
  }
  try {
    const tree = parseStockFormula(formula.formula)
    item.price = evaluateStockFormula(tree, (symbol) => bySymbol.get(symbol)?.price)
    const previous = evaluateStockFormula(tree, (symbol) => {
      const quote = bySymbol.get(symbol)
      return quote && quote.change != null ? quote.price - quote.change : null
    })
    item.change = item.price != null && previous != null ? item.price - previous : null
  } catch {
    /* invalid formulas are rejected in Settings; show a dash if one slips through */
  }
  return item
}

function TickerItems({ items }: { items: TickerItem[] }) {
  return (
    <>
      {items.map((item) => {
        const { change } = item
        const tone = change == null || change === 0 ? 'flat' : change > 0 ? 'up' : 'down'
        const sign = change == null ? '' : change > 0 ? '+' : change < 0 ? '−' : ''
        return (
          <span key={item.key} className="stock-ticker-item" title={item.title}>
            <span className="stock-ticker-symbol">{item.label}</span>{' '}
            <span>{item.price != null ? formatNumber(item.price) : '—'}</span>
            {change != null ? (
              <>
                {' '}
                <span className={`stock-ticker-change stock-ticker-change--${tone}`}>
                  {sign}
                  {formatNumber(Math.abs(change))}
                </span>
              </>
            ) : null}
          </span>
        )
      })}
    </>
  )
}

export function StockTickerWidget() {
  const { stockSymbols, stockFormulas } = useHouse()
  const [snapshot, setSnapshot] = useState<StockQuotesSnapshot | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [scrollWidth, setScrollWidth] = useState<number | null>(null)
  const enabled = stockSymbols.length > 0 || stockFormulas.length > 0

  useEffect(() => {
    if (!enabled) return
    const load = () => {
      void fetchStockQuotes().then(setSnapshot)
    }
    load()
    return startVisibilityInterval(load, POLL_MS)
  }, [enabled])

  const items = useMemo(() => {
    const bySymbol = new Map((snapshot?.quotes ?? []).map((quote) => [quote.symbol, quote]))
    const stocks: TickerItem[] = stockSymbols.map((symbol) => {
      const quote = bySymbol.get(symbol)
      return {
        key: symbol,
        label: symbol,
        title: quote?.name ?? symbol,
        price: quote?.price ?? null,
        change: quote?.change ?? null,
      }
    })
    return [...stocks, ...stockFormulas.map((formula) => formulaItem(formula, bySymbol))]
  }, [snapshot, stockSymbols, stockFormulas])

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const measure = measureRef.current
    if (!viewport || !measure) return
    const update = () => {
      const contentWidth = measure.scrollWidth
      setScrollWidth(contentWidth > viewport.clientWidth ? contentWidth : null)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(viewport)
    observer.observe(measure)
    return () => observer.disconnect()
  }, [items])

  if (!enabled) return null

  const scrolling = scrollWidth != null
  return (
    <div className="stock-ticker" ref={viewportRef} aria-label="Stock prices">
      <div className="stock-ticker-measure" ref={measureRef} aria-hidden="true">
        <TickerItems items={items} />
      </div>
      <div
        className={`stock-ticker-track${scrolling ? ' stock-ticker-track--scrolling' : ''}`}
        style={
          scrolling
            ? { animationDuration: `${Math.max(10, scrollWidth / SCROLL_PX_PER_S)}s` }
            : undefined
        }
      >
        <div className="stock-ticker-group">
          <TickerItems items={items} />
        </div>
        {scrolling ? (
          <div className="stock-ticker-group" aria-hidden="true">
            <TickerItems items={items} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
