import { AuthProvider, useAuth } from './auth/AuthContext'
import Dashboard from './Dashboard'
import LoginPage from './pages/LoginPage'

function AppGate() {
  const { status, loginOpen, closeLogin } = useAuth()
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-sm font-semibold">Đang kiểm tra đăng nhập…</div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-sky-500" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <Dashboard />
      {status === 'guest' && loginOpen ? (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={closeLogin}
            role="button"
            tabIndex={0}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
              <LoginPage variant="modal" onClose={closeLogin} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppGate />
    </AuthProvider>
  )
}
