import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'

function friendlyError(code: string) {
  switch (code) {
    case 'INVALID_CREDENTIALS':
      return 'Email hoặc mật khẩu không đúng.'
    case 'EMAIL_EXISTS':
      return 'Email đã tồn tại.'
    case 'INVALID_INPUT':
      return 'Dữ liệu không hợp lệ.'
    case 'SERVER_ERROR':
      return 'Lỗi hệ thống. Thử lại sau.'
    default:
      return 'Không thể đăng nhập. Vui lòng thử lại.'
  }
}

export default function LoginPage({
  variant = 'page',
  onClose,
}: {
  variant?: 'page' | 'modal'
  onClose?: () => void
}) {
  const { status, error, login, register } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const disabled = status === 'loading'

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
    if (!trimmedEmail.includes('@')) return setLocalError('Email không hợp lệ.')
    if (!password) return setLocalError('Vui lòng nhập mật khẩu.')
    if (password.length < 6) return setLocalError('Mật khẩu tối thiểu 6 ký tự.')

    if (mode === 'login') await login(trimmedEmail, password)
    else await register(trimmedEmail, password)
  }

  const content = (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">
            {mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
          </div>
          <div className="mt-1 text-sm text-slate-600">
            Đăng nhập thành công mới vào được hệ thống.
          </div>
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
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            disabled={disabled}
          />
        </label>

        <label className="grid gap-1">
          <div className="text-sm font-medium text-slate-700">Mật khẩu</div>
          <input
            className="h-11 rounded-xl border border-slate-200 px-3 outline-none focus:border-sky-400"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder="••••••••"
            disabled={disabled}
          />
        </label>

        <button
          className="mt-2 inline-flex h-11 items-center justify-center rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          type="submit"
          disabled={disabled}
        >
          {mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
        </button>
      </form>

      <GoogleLoginSection disabled={disabled} />

      <div className="mt-4 flex items-center justify-between text-sm">
        <button
          className="font-semibold text-slate-700 hover:text-slate-900"
          type="button"
          onClick={() => {
            setMode((m) => (m === 'login' ? 'register' : 'login'))
            setLocalError(null)
            setSubmitted(false)
          }}
          disabled={disabled}
        >
          {mode === 'login' ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập'}
        </button>
      </div>
    </div>
  )

  if (variant === 'modal') return content

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
        {content}
        <div className="mt-4 text-center text-xs text-slate-500">
          Backend: Postgres + JWT
        </div>
      </div>
    </div>
  )
}

function GoogleLoginSection({ disabled }: { disabled: boolean }) {
  const { loginWithGoogle } = useAuth()
  const buttonRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
    const google = window.google
    if (!clientId || !google?.accounts?.id || !buttonRef.current) return

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
  }, [loginWithGoogle])

  const hasClientId = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID)

  return (
    <div className="mt-4">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200" />
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Hoặc
        </div>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      {!hasClientId ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Chưa cấu hình Google Client ID. Thêm <span className="font-mono">VITE_GOOGLE_CLIENT_ID</span>{' '}
          vào env của frontend.
        </div>
      ) : null}

      <div
        className={disabled ? 'mt-3 pointer-events-none opacity-60' : 'mt-3'}
      >
        <div ref={buttonRef} />
      </div>
    </div>
  )
}

