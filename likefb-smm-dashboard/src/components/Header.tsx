import { useMemo } from 'react'
import { ToolbarLanguageSelect, ToolbarThemeButton } from './ToolbarControls'

export default function Header({
  userName,
  isAuthed,
  menuOpen,
  onMenuClick,
  menuButtonRef,
  onLoginClick,
  onLogoutClick,
  lang,
  onLangChange,
  darkMode,
  onToggleDarkMode,
}: {
  userName: string
  isAuthed: boolean
  menuOpen: boolean
  onMenuClick?(): void
  menuButtonRef?: React.Ref<HTMLButtonElement>
  onLoginClick(): void
  onLogoutClick(): void
  lang: 'vi' | 'en'
  onLangChange(lang: 'vi' | 'en'): void
  darkMode: boolean
  onToggleDarkMode(): void
}) {
  const initials = useMemo(() => {
    const parts = userName.trim().split(/\s+/)
    const a = parts[0]?.[0] ?? 'U'
    const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : ''
    return (a + b).toUpperCase()
  }, [userName])

  const t = useMemo(() => {
    const vi = {
      logout: 'Đăng xuất',
      login: 'Đăng nhập',
      switchToDark: 'Chuyển sang chế độ tối',
      switchToLight: 'Chuyển sang chế độ sáng',
    }
    const en = {
      logout: 'Logout',
      login: 'Login',
      switchToDark: 'Switch to dark mode',
      switchToLight: 'Switch to light mode',
    }
    return lang === 'en' ? en : vi
  }, [lang])

  return (
    <header className="border-b border-transparent">
      <div className="flex items-center justify-between gap-2 px-4 py-3 sm:gap-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onMenuClick}
            ref={menuButtonRef}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-indigo-200 bg-white text-slate-800 shadow-sm transition hover:bg-indigo-50/80 dark:border-indigo-500/40 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'}
            aria-expanded={menuOpen}
          >
            ☰
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <ToolbarLanguageSelect lang={lang} onLangChange={onLangChange} />
          <ToolbarThemeButton
            darkMode={darkMode}
            onToggleDarkMode={onToggleDarkMode}
            labelSwitchToDark={t.switchToDark}
            labelSwitchToLight={t.switchToLight}
          />

          <div className="hidden items-center gap-3 sm:flex">
            <div className="grid size-10 place-items-center rounded-full bg-indigo-600 text-sm font-extrabold text-white">
              {initials}
            </div>
            {isAuthed ? (
              <button
                type="button"
                onClick={onLogoutClick}
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
              >
                {t.logout}
              </button>
            ) : (
              <button
                type="button"
                onClick={onLoginClick}
                className="inline-flex items-center justify-center rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700"
              >
                {t.login}
              </button>
            )}
          </div>

          <div className="sm:hidden">
            {isAuthed ? (
              <button
                type="button"
                onClick={onLogoutClick}
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
              >
                {t.logout}
              </button>
            ) : (
              <button
                type="button"
                onClick={onLoginClick}
                className="inline-flex items-center justify-center rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700"
              >
                {t.login}
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
