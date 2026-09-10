import { Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from './components/Shell'
import { HomePage } from './pages/HomePage'
import { LightsPage } from './pages/LightsPage'
import { ShadesPage } from './pages/ShadesPage'
import { SolarThermalPage } from './pages/SolarThermalPage'
import { HvacPage } from './pages/HvacPage'
import { AcPage } from './pages/AcPage'
import { SettingsPage } from './pages/SettingsPage'
import { IrrigationPage } from './pages/IrrigationPage'
import { PowerPage } from './pages/PowerPage'
import { TrendsPage } from './pages/TrendsPage'
import { AudioPage } from './pages/AudioPage'
import { ControlLogPage } from './pages/ControlLogPage'
import { MiniDashPage } from './pages/MiniDashPage'
import { CamerasPage } from './pages/CamerasPage'
import { isReadOnlyDashboard } from './dashboardMode'

const readOnly = isReadOnlyDashboard()

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<HomePage />} />
        <Route path="mini" element={<MiniDashPage />} />
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
        <Route path="irrigation" element={<IrrigationPage />} />
        <Route path="audio" element={<AudioPage />} />
        <Route
          path="log"
          element={readOnly ? <Navigate to="/" replace /> : <ControlLogPage />}
        />
        <Route path="power" element={<PowerPage />} />
        <Route path="cameras" element={<CamerasPage />} />
        <Route path="trends" element={<TrendsPage />} />
        <Route path="cistern" element={<Navigate to="/trends" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
