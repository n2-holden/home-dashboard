import { OutsideAccessWidget } from '../components/OutsideAccessWidget'
import { AudioWidget } from '../components/AudioWidget'

/** Phone-first remote dash: gate + garages + audio only. */
export function MiniDashPage() {
  return (
    <main className="mini-dash">
      <header className="mini-dash-header">
        <h1 className="mini-dash-title">Stoneridge Mini Dash</h1>
      </header>
      <div className="mini-dash-stack">
        <OutsideAccessWidget standalone />
        <AudioWidget />
      </div>
    </main>
  )
}
