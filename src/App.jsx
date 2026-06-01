import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import RequireAuth from './components/RequireAuth'
import AppShell from './components/AppShell'
import Splash from './components/Splash'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Tracks from './pages/Tracks'
import Contacts from './pages/Contacts'
import SendDemo from './pages/SendDemo'
import You from './pages/You'

export default function App() {
  const { loading } = useAuth()

  if (loading) return <Splash />

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="tracks" element={<Tracks />} />
        <Route path="contacts" element={<Contacts />} />
        <Route path="send" element={<SendDemo />} />
        <Route path="you" element={<You />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
