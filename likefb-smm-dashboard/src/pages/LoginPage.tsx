import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'

function friendlyError(code: string) {
  const c = code.trim()
  if (c === 'Failed to fetch' || c === 'NetworkError' || /networkerror|load failed/i.test(c)) {
    return 'Không kết nối được máy chủ. Hãy chạy API (likefb-smm-api, cổng 4000) và dev Vite; kiểm tra proxy /api trong vite.config.'
  }
  switch (c) {
    case 'USER_NOT_FOUND':
      return 'Tài khoản không tồn tại.'
    case 'INVALID_PASSWORD':
      return 'Mật khẩu không đúng.'
    case 'INVALID_CREDENTIALS':
      return 'Email hoặc mật khẩu không đúng.'
    case 'PASSWORD_NOT_SET':
      return 'Tài khoản này chưa đặt mật khẩu (đăng nhập Google).'
    case 'EMAIL_EXISTS':
      return 'Email đã tồn tại.'
    case 'EMAIL_INVALID':
      return 'Email không hợp lệ.'
    case 'WEAK_PASSWORD':
      return 'Mật khẩu quá yếu. Tối thiểu 7 ký tự.'
    case 'PASSWORD_REQUIRED':
      return 'Vui lòng nhập mật khẩu.'
    case 'INVALID_INPUT':
      return 'Dữ liệu không hợp lệ.'
    case 'SERVER_ERROR':
      return 'Lỗi hệ thống. Thử lại sau.'
    case 'DATABASE_UNAVAILABLE':
      return 'Không kết nối được PostgreSQL. Bật DB (ví dụ docker compose up), kiểm tra DATABASE_URL trong .env của API, rồi chạy npm run db:migrate trong likefb-smm-api.'
    case 'MIGRATION_REQUIRED':
      return 'Cơ sở dữ liệu chưa có bảng users. Trong thư mục likefb-smm-api chạy: npm run db:migrate (PostgreSQL phải đang chạy và DATABASE_URL đúng).'
    case 'API_UNAVAILABLE':
    case 'REQUEST_FAILED':
      return 'API không phản hồi đúng (tắt, sai cổng, hoặc không phải JSON). Chạy song song: npm run dev trong likefb-smm-api và likefb-smm-dashboard.'
    case 'LOGIN_FAILED':
    case 'REGISTER_FAILED':
      return 'Đăng nhập thất bại. Thử lại.'
    case 'GOOGLE_NOT_CONFIGURED':
      return 'Đăng nhập Google chưa được cấu hình trên máy chủ (GOOGLE_CLIENT_ID).'
    case 'INVALID_GOOGLE_TOKEN':
      return 'Đăng nhập Google không hợp lệ. Thử lại.'
    default:
      return c && c !== 'Error' && !/^error$/i.test(c)
        ? `Lỗi: ${c}`
        : 'Không thể đăng nhập. Vui lòng thử lại.'
  }
}

export default function LoginPage({
  variant = 'page',
  onClose,
}: {
  variant?: 'page' | 'modal'
  onClose?: () => void
}) {
  const { busy, error, login, register } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const disabled = busy

  const errText = useMemo(() => {
    if (localError) return localError
    if (!submitted) return null
    return error ? friendlyError(error) : null
  }, [error, localError, submitted])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setLocalError(null)

    const trimmedEmail = email.trim()
    if (!trimmedEmail) return setLocalError('Vui lòng nhập email.')
    const isAdminAlias = trimmedEmail.toLowerCase() === 'admin'
    if (mode === 'login' && !isAdminAlias && !trimmedEmail.includes('@')) {
      return setLocalError('Email không hợp lệ.')
    }
    if (mode === 'register' && !trimmedEmail.includes('@')) return setLocalError('Email không hợp lệ.')
    if (!password) return setLocalError('Vui lòng nhập mật khẩu.')
    if (mode === 'register' && password.length < 7) return setLocalError('Mật khẩu tối thiểu 7 ký tự.')
    if (mode === 'register' && password !== confirmPassword)
      return setLocalError('Mật khẩu nhập lại không khớp.')

    if (mode === 'login') await login(trimmedEmail, password)
    else await register(trimmedEmail, password)
  }

  const content = (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">Tài khoản</div>
        </div>
        {variant === 'modal' && onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            aria-label="Đóng"
          >
            ×
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-50 p-1 text-sm">
        <button
          type="button"
          className={
            mode === 'login'
              ? 'h-10 rounded-lg bg-white font-semibold text-slate-900 shadow-sm'
              : 'h-10 rounded-lg font-semibold text-slate-600 hover:text-slate-900'
          }
          onClick={() => {
            setMode('login')
            setLocalError(null)
            setSubmitted(false)
            setPassword('')
            setConfirmPassword('')
          }}
          disabled={disabled}
        >
          Đăng nhập
        </button>
        <button
          type="button"
          className={
            mode === 'register'
              ? 'h-10 rounded-lg bg-white font-semibold text-slate-900 shadow-sm'
              : 'h-10 rounded-lg font-semibold text-slate-600 hover:text-slate-900'
          }
          onClick={() => {
            setMode('register')
            setLocalError(null)
            setSubmitted(false)
            setPassword('')
            setConfirmPassword('')
          }}
          disabled={disabled}
        >
          Đăng ký
        </button>
      </div>

      {errText ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {errText}
        </div>
      ) : null}

      <form className="mt-5 grid gap-3" onSubmit={onSubmit} noValidate>
        <label className="grid gap-1">
          <div className="text-sm font-medium text-slate-700">Email</div>
          <input
            className="h-11 rounded-xl border border-slate-200 px-3 outline-none focus:border-sky-400"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="text"
            autoComplete="username"
            placeholder="email@example.com"
            disabled={disabled}
          />
        </label>

        <label className="grid gap-1">
          <div className="text-sm font-medium text-slate-700">Mật khẩu</div>
          <div className="relative">
            <input
              className="h-11 w-full rounded-xl border border-slate-200 px-3 pr-12 outline-none focus:border-sky-400"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type={showPassword ? 'text' : 'password'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="••••••••"
              disabled={disabled}
            />
            <button
              type="button"
              className="absolute right-1 top-1 inline-flex h-9 items-center justify-center rounded-lg px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              onClick={() => setShowPassword((v) => !v)}
              disabled={disabled}
              aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            >
              {showPassword ? 'Ẩn' : 'Hiện'}
            </button>
          </div>
        </label>

        {mode === 'register' ? (
          <label className="grid gap-1">
            <div className="text-sm font-medium text-slate-700">Nhập lại mật khẩu</div>
            <input
              className="h-11 rounded-xl border border-slate-200 px-3 outline-none focus:border-sky-400"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="••••••••"
              disabled={disabled}
            />
          </label>
        ) : null}

        <button
          className="mt-2 inline-flex h-11 items-center justify-center rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          type="submit"
          disabled={disabled}
        >
          {disabled ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
        </button>
      </form>

      <GoogleLoginSection disabled={disabled} />
    </div>
  )

  if (variant === 'modal') return content

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
        {content}
      </div>
    </div>
  )
}

function GoogleLoginSection({ disabled }: { disabled: boolean }) {
  const { loginWithGoogle } = useAuth()
  const buttonRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
    if (!clientId || !buttonRef.current) return

    let cancelled = false

    async function ensureGoogleGsiLoaded() {
      if (window.google?.accounts?.id) return
      const existing = document.querySelector<HTMLScriptElement>('script[data-likefb="google-gsi"]')
      if (existing) {
        await new Promise<void>((resolve, reject) => {
          existing.addEventListener('load', () => resolve(), { once: true })
          existing.addEventListener('error', () => reject(new Error('GOOGLE_GSI_LOAD_FAILED')), { once: true })
        })
        return
      }
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script')
        s.src = 'https://accounts.google.com/gsi/client'
        s.async = true
        s.defer = true
        s.dataset.likefb = 'google-gsi'
        s.onload = () => resolve()
        s.onerror = () => reject(new Error('GOOGLE_GSI_LOAD_FAILED'))
        document.head.appendChild(s)
      })
    }

    async function init() {
      await ensureGoogleGsiLoaded()
      if (cancelled) return
      const google = window.google
      if (!google?.accounts?.id || !buttonRef.current) return

      google.accounts.id.initialize({
        client_id: clientId,
        callback: async (resp: { credential?: string }) => {
          const idToken = resp?.credential
          if (!idToken) return
          await loginWithGoogle(idToken)
        },
      })

      buttonRef.current.innerHTML = ''
      google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        width: 380,
      })
    }

    void init()
    return () => {
      cancelled = true
    }
  }, [loginWithGoogle])

  return (
    <div className="mt-4">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200" />
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Hoặc
        </div>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      <div
        className={disabled ? 'mt-3 pointer-events-none opacity-60' : 'mt-3'}
      >
        <div ref={buttonRef} />
      </div>
    </div>
  )
}

