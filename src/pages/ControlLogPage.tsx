import { Link, useSearchParams } from 'react-router-dom'
import { ControlLogPanel } from '../components/ControlLogPanel'
import type { ControlLogKind } from '../ha/controlLog'

function parseKind(value: string | null): ControlLogKind {
  return value === 'communication' ? 'communication' : 'activity'
}

export function ControlLogPage() {
  const [params] = useSearchParams()
  const kind = parseKind(params.get('kind') ?? params.get('tab'))
  const openCommStatus = params.get('comm') === '1'
  const title = kind === 'communication' ? 'Communication log' : 'Activity log'
  const blurb =
    kind === 'communication'
      ? 'Failed commands, connectivity alerts, and last device communication'
      : 'Device commands from the dashboard and Home Assistant automations'

  return (
    <main>
      <Link className="back-link" to={`/settings?tab=${kind}`}>
        ← Settings
      </Link>
      <header className="page-header">
        <h1>{title}</h1>
        <p>{blurb}</p>
      </header>
      <ControlLogPanel kind={kind} openCommStatus={openCommStatus} />
    </main>
  )
}
