import { Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from './components/Shell'
import { HomePage } from './pages/HomePage'
import { LightsPage } from './pages/LightsPage'
import { ShadesPage } from './pages/ShadesPage'
import { SolarThermalPage } from './pages/SolarThermalPage'
import { AreaStubPage } from './pages/AreaStubPage'
import { SettingsPage } from './pages/SettingsPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<HomePage />} />
        <Route path="shades" element={<ShadesPage />} />
        <Route path="lights" element={<LightsPage />} />
        <Route path="lights/:groupId" element={<LightsPage />} />
        <Route path="solar-thermal" element={<SolarThermalPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="hvac" element={<AreaStubPage area="hvac" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
