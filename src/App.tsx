import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './lib/auth'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import RoomPage from './pages/RoomPage'
import InvitePage from './pages/InvitePage'
import SettingsPage from './pages/SettingsPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import LessonDetailPage from './pages/LessonDetailPage'
import RoleSelectPage from './pages/setup/RoleSelectPage'
import ProfileSetupPage from './pages/setup/ProfileSetupPage'

const queryClient = new QueryClient()

// 認証済みユーザーのみアクセス可能なルート
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <div className="min-h-svh flex items-center justify-center"><div className="w-6 h-6 border-2 border-[#2D6A4F] border-t-transparent rounded-full animate-spin" /></div>
  if (!session) return <Navigate to="/" replace />
  return <>{children}</>
}

// プロフィール設定済みユーザーのみアクセス可能なルート（未設定なら/setup/roleへ）
function ProfileRoute({ children }: { children: React.ReactNode }) {
  const { session, profile, loading } = useAuth()
  if (loading) return <div className="min-h-svh flex items-center justify-center"><div className="w-6 h-6 border-2 border-[#2D6A4F] border-t-transparent rounded-full animate-spin" /></div>
  if (!session) return <Navigate to="/" replace />
  if (!profile) return <Navigate to="/setup/role" replace />
  return <>{children}</>
}

// 未認証ユーザーのみアクセス可能なルート（ログイン済みなら/dashboardへ）
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return null
  if (session) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
      <Route path="/setup/role" element={<PrivateRoute><RoleSelectPage /></PrivateRoute>} />
      <Route path="/setup/profile" element={<PrivateRoute><ProfileSetupPage /></PrivateRoute>} />
      <Route path="/dashboard" element={<ProfileRoute><DashboardPage /></ProfileRoute>} />
      <Route path="/room/:id" element={<ProfileRoute><RoomPage /></ProfileRoute>} />
      <Route path="/room/:id/lesson/:lid" element={<ProfileRoute><LessonDetailPage /></ProfileRoute>} />
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/settings" element={<ProfileRoute><SettingsPage /></ProfileRoute>} />
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter basename="/schedule-tool">
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
