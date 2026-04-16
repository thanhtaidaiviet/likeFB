import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { apiGoogleLogin, apiLogin, apiMe, apiRegister, type AuthUser } from './api'
import { useToast } from '../ui/toast'

type AuthStatus = 'loading' | 'guest' | 'authed'

type AuthContextValue = {
  status: AuthStatus
  busy: boolean
  user: AuthUser | null
  token: string | null
  error: string | null
  loginOpen: boolean
  openLogin(): void
  closeLogin(): void
  login(email: string, password: string): Promise<void>
  register(email: string, password: string): Promise<void>
  loginWithGoogle(idToken: string): Promise<void>
  logout(): void
  refresh(): Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const TOKEN_KEY = 'likefb_token'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast()
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [busy, setBusy] = useState(false)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loginOpen, setLoginOpen] = useState(false)

  const refresh = useCallback(async () => {
    setError(null)
    const t = token ?? localStorage.getItem(TOKEN_KEY)
    if (!t) {
      setToken(null)
      setUser(null)
      setStatus('guest')
      return
    }

    try {
      const me = await apiMe(t)
      setToken(t)
      setUser(me.user)
      setStatus('authed')
      localStorage.setItem(TOKEN_KEY, t)
      setLoginOpen(false)
    } catch (e: any) {
      // When simply checking existing token on page load, do not show an error UI.
      localStorage.removeItem(TOKEN_KEY)
      setToken(null)
      setUser(null)
      setStatus('guest')
    }
  }, [token])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = useCallback(async (email: string, password: string) => {
    setError(null)
    setBusy(true)
    try {
      const res = await apiLogin(email, password)
      localStorage.setItem(TOKEN_KEY, res.token)
      setToken(res.token)
      setUser(res.user)
      setStatus('authed')
      setLoginOpen(false)
      toast({ kind: 'success', title: 'Đăng nhập thành công', description: res.user.email, durationMs: 3200 })
    } catch (e: any) {
      setError(e?.message || 'LOGIN_FAILED')
      setToken(null)
      setUser(null)
      setStatus('guest')
    } finally {
      setBusy(false)
    }
  }, [toast])

  const register = useCallback(async (email: string, password: string) => {
    setError(null)
    setBusy(true)
    try {
      const res = await apiRegister(email, password)
      localStorage.setItem(TOKEN_KEY, res.token)
      setToken(res.token)
      setUser(res.user)
      setStatus('authed')
      setLoginOpen(false)
      toast({ kind: 'success', title: 'Tạo tài khoản thành công', description: res.user.email, durationMs: 3200 })
    } catch (e: any) {
      setError(e?.message || 'REGISTER_FAILED')
      setToken(null)
      setUser(null)
      setStatus('guest')
    } finally {
      setBusy(false)
    }
  }, [toast])

  const loginWithGoogle = useCallback(async (idToken: string) => {
    setError(null)
    setBusy(true)
    try {
      const res = await apiGoogleLogin(idToken)
      localStorage.setItem(TOKEN_KEY, res.token)
      setToken(res.token)
      setUser(res.user)
      setStatus('authed')
      setLoginOpen(false)
      toast({ kind: 'success', title: 'Đăng nhập Google thành công', description: res.user.email, durationMs: 3200 })
    } catch (e: any) {
      setError(e?.message || 'LOGIN_FAILED')
      setToken(null)
      setUser(null)
      setStatus('guest')
    } finally {
      setBusy(false)
    }
  }, [toast])

  const openLogin = useCallback(() => {
    setError(null)
    setLoginOpen(true)
  }, [])

  const closeLogin = useCallback(() => {
    setLoginOpen(false)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
    setError(null)
    setStatus('guest')
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      busy,
      user,
      token,
      error,
      loginOpen,
      openLogin,
      closeLogin,
      login,
      register,
      loginWithGoogle,
      logout,
      refresh,
    }),
    [
      status,
      busy,
      user,
      token,
      error,
      loginOpen,
      openLogin,
      closeLogin,
      login,
      register,
      loginWithGoogle,
      logout,
      refresh,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

