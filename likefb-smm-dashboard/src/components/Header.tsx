import { useMemo } from 'react'
import type { NavItem } from './Sidebar'

export default function Header({
  userName,
  userRole,
  activePlatform,
  mobileMenuItems,
  onMobileNavChange,
  onTopupClick,
}: {
  userName: string
  userRole: string
  activePlatform: string
  mobileMenuItems: NavItem[]
  onMobileNavChange: (value: string) => void
  onTopupClick(): void
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
          <button
            type="button"
            onClick={onTopupClick}
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Nạp tiền
          </button>

          <div className="lg:hidden">
            <label className="sr-only" htmlFor="platform">
              Nền tảng
            </label>
            <select
              id="platform"
              value={activePlatform}
              onChange={(e) => onMobileNavChange(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {mobileMenuItems.map((it) => (
                <option key={it.value} value={it.value}>
                  {it.label}
                </option>
              ))}
            </select>
          </div>

          <div className="hidden items-center gap-3 sm:flex">
            <div className="text-right">
              <div className="text-sm font-semibold text-slate-900">{userName}</div>
              <div className="text-xs text-slate-500">{userRole}</div>
            </div>
            <div className="grid size-10 place-items-center rounded-full bg-indigo-600 text-sm font-extrabold text-white">
              {initials}
            </div>
          </div>

          <div className="sm:hidden">
            <div className="grid size-10 place-items-center rounded-full bg-indigo-600 text-sm font-extrabold text-white">
              {initials}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

