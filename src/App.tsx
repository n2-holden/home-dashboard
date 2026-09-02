import { Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from './components/Shell'
import { HomePage } from './pages/HomePage'
import { LightsPage } from './pages/LightsPage'
import { ShadesPage } from './pages/ShadesPage'
import { SolarThermalPage } from './pages/SolarThermalPage'
import { HvacPage } from './pages/HvacPage'
import { AcPage } from './pages/AcPage'
import { SettingsPage } from './pages/SettingsPage'
import { isReadOnlyDashboard } from './dashboardMode'

const readOnly = isReadOnlyDashboard()

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<HomePage />} />
        <Route path="shades" element={<ShadesPage />} />
        <Route path="lights" element={<LightsPage />} />
        <Route path="lights/:groupId" element={<LightsPage />} />
        <Route path="solar-thermal" element={<SolarThermalPage />} />
        <Route
          path="settings"
          element={readOnly ? <Navigate to="/" replace /> : <SettingsPage />}
        />
        <Route path="hvac" element={<HvacPage />} />
        <Route path="ac" element={<AcPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
