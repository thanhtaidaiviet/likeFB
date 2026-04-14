import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { apiGoogleLogin, apiLogin, apiMe, apiRegister, type AuthUser } from './api'

type AuthStatus = 'loading' | 'guest' | 'authed'

type AuthContextValue = {
  status: AuthStatus
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
  const [status, setStatus] = useState<AuthStatus>('loading')
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
    setStatus('loading')
    try {
      const res = await apiLogin(email, password)
      localStorage.setItem(TOKEN_KEY, res.token)
      setToken(res.token)
      setUser(res.user)
      setStatus('authed')
      setLoginOpen(false)
    } catch (e: any) {
      setError(e?.message || 'LOGIN_FAILED')
      setToken(null)
      setUser(null)
      setStatus('guest')
    }
  }, [])

  const register = useCallback(async (email: string, password: string) => {
    setError(null)
    setStatus('loading')
    try {
      const res = await apiRegister(email, password)
      localStorage.setItem(TOKEN_KEY, res.token)
      setToken(res.token)
      setUser(res.user)
      setStatus('authed')
      setLoginOpen(false)
    } catch (e: any) {
      setError(e?.message || 'REGISTER_FAILED')
      setToken(null)
      setUser(null)
      setStatus('guest')
    }
  }, [])

  const loginWithGoogle = useCallback(async (idToken: string) => {
    setError(null)
    setStatus('loading')
    try {
      const res = await apiGoogleLogin(idToken)
      localStorage.setItem(TOKEN_KEY, res.token)
      setToken(res.token)
      setUser(res.user)
      setStatus('authed')
      setLoginOpen(false)
    } catch (e: any) {
      setError(e?.message || 'LOGIN_FAILED')
      setToken(null)
      setUser(null)
      setStatus('guest')
    }
  }, [])

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

