import { useCallback, type KeyboardEvent, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TrendTabId } from '../ha/trends'

const INTERACTIVE_SELECTOR = 'button, input, label, a, .pool-lights-control'

/** Props that make a whole widget open a Trends tab, ignoring clicks on its own controls. */
export function useTrendsLink(tab: TrendTabId) {
  const navigate = useNavigate()
  const path = `/trends?tab=${tab}`

  const onClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if ((event.target as HTMLElement).closest(INTERACTIVE_SELECTOR)) return
      navigate(path)
    },
    [navigate, path],
  )

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget) return
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      navigate(path)
    },
    [navigate, path],
  )

  return {
    role: 'link' as const,
    tabIndex: 0,
    onClick,
    onKeyDown,
  }
}
