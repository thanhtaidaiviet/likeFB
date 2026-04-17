import { useMemo } from 'react'

export default function Header({
  userName,
  isAuthed,
  onTopupClick,
  onLoginClick,
  onLogoutClick,
}: {
  userName: string
  isAuthed: boolean
  onTopupClick(): void
  onLoginClick(): void
  onLogoutClick(): void
}) {
  const initials = useMemo(() => {
    const parts = userName.trim().split(/\s+/)
    const a = parts[0]?.[0] ?? 'U'
    const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : ''
    return (a + b).toUpperCase()
  }, [userName])

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">
            Dashboard đặt dịch vụ SMM
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isAuthed ? (
            <button
              type="button"
              onClick={onTopupClick}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Nạp tiền
            </button>
          ) : null}

          <div className="hidden items-center gap-3 sm:flex">
            <div className="grid size-10 place-items-center rounded-full bg-indigo-600 text-sm font-extrabold text-white">
              {initials}
            </div>
            {isAuthed ? (
              <button
                type="button"
                onClick={onLogoutClick}
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                Đăng xuất
              </button>
            ) : (
              <button
                type="button"
                onClick={onLoginClick}
                className="inline-flex items-center justify-center rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700"
              >
                Đăng nhập
              </button>
            )}
          </div>

          <div className="sm:hidden">
            {isAuthed ? (
              <button
                type="button"
                onClick={onLogoutClick}
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                Đăng xuất
              </button>
            ) : (
              <button
                type="button"
                onClick={onLoginClick}
                className="inline-flex items-center justify-center rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700"
              >
                Đăng nhập
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

