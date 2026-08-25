import { Link } from 'react-router-dom'
import { ShadeControls } from '../components/ShadeControls'

export function ShadesPage() {
  return (
    <main>
      <Link className="back-link" to="/">
        ← Home
      </Link>
      <header className="page-header">
        <h1>Shades</h1>
        <p>Open / closed status by room group.</p>
      </header>
      <ShadeControls />
    </main>
  )
}
