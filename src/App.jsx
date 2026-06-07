import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import RequireAuth from './components/RequireAuth'
import AppShell from './components/AppShell'
import Splash from './components/Splash'
import Login from './pages/Login'

// Authenticated module screens are heavy (CRM, Send Demo, Discovery, etc.) —
// lazy-load them so the initial bundle stays small for first paint / login.
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Tracks = lazy(() => import('./pages/Tracks'))
const Contacts = lazy(() => import('./pages/Contacts'))
const SendDemo = lazy(() => import('./pages/SendDemo'))
const You = lazy(() => import('./pages/You'))

export default function App() {
  const { loading } = useAuth()

  if (loading) return <Splash />

  return (
    <Suspense fallback={<Splash />}>
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
    </Suspense>
  )
}
