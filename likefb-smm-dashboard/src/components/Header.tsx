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
  onTopupClick,
  supportTelegramUrl,
  hotline,
  apiResellerUrl,
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
  onTopupClick(): void
  supportTelegramUrl?: string
  hotline?: string
  apiResellerUrl?: string
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
          <a
            href="/"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg px-1 py-1 text-slate-900 hover:bg-slate-100/70 dark:text-slate-100 dark:hover:bg-slate-800/70"
            aria-label="LikeTikTok.xyz"
          >
            <img src="/logo.svg" alt="LikeTikTok.xyz" className="size-9" />
            <div className="hidden leading-tight sm:block">
              <div className="text-sm font-extrabold tracking-tight">LikeTikTok.xyz</div>
              <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                {lang === 'en' ? 'Boost social engagement' : 'Tăng tương tác mạng xã hội'}
              </div>
            </div>
          </a>
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
          <div className="hidden items-center gap-2 lg:flex">
            <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-800 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-800">
              +12.000 khách hàng
            </div>
            <div className="text-xs font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
              Tăng Like TikTok Uy Tín #1 Việt Nam
            </div>
          </div>

          {supportTelegramUrl ? (
            <a
              href={supportTelegramUrl}
              target="_blank"
              rel="noreferrer"
              className="hidden h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900 sm:inline-flex"
            >
              Telegram
            </a>
          ) : null}

          {hotline ? (
            <a
              href={`tel:${hotline.replace(/\s+/g, '')}`}
              className="hidden h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900 sm:inline-flex"
              title={hotline}
            >
              Hotline
            </a>
          ) : null}

          {apiResellerUrl ? (
            <a
              href={apiResellerUrl}
              target="_blank"
              rel="noreferrer"
              className="hidden h-10 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-sm font-extrabold text-indigo-900 shadow-sm hover:bg-indigo-100/70 dark:border-indigo-500/40 dark:bg-indigo-950/40 dark:text-indigo-100 dark:hover:bg-indigo-950/60 sm:inline-flex"
            >
              API Reseller
            </a>
          ) : null}

          <button
            type="button"
            onClick={onTopupClick}
            className="hidden h-10 items-center justify-center rounded-lg bg-amber-500 px-3 text-sm font-extrabold text-amber-950 shadow-sm hover:bg-amber-400 sm:inline-flex"
          >
            Nạp tiền
          </button>

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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onLoginClick}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
                >
                  Đăng ký
                </button>
                <button
                  type="button"
                  onClick={onLoginClick}
                  className="inline-flex items-center justify-center rounded-lg bg-sky-600 px-3 py-2 text-sm font-extrabold text-white hover:bg-sky-700"
                >
                  {t.login}
                </button>
              </div>
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

      <div className="border-t border-slate-200/60 px-4 py-2 sm:px-6 lg:hidden dark:border-slate-700/70">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-extrabold text-emerald-800 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-800">
              +12.000 khách hàng
            </div>
            <div className="text-[11px] font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
              Tăng Like TikTok Uy Tín #1 Việt Nam
            </div>
          </div>

          <div className="flex items-center gap-2">
            {supportTelegramUrl ? (
              <a
                href={supportTelegramUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
              >
                Telegram
              </a>
            ) : null}
            {hotline ? (
              <a
                href={`tel:${hotline.replace(/\s+/g, '')}`}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
                title={hotline}
              >
                Hotline
              </a>
            ) : null}
            {apiResellerUrl ? (
              <a
                href={apiResellerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-xs font-extrabold text-indigo-900 shadow-sm hover:bg-indigo-100/70 dark:border-indigo-500/40 dark:bg-indigo-950/40 dark:text-indigo-100 dark:hover:bg-indigo-950/60"
              >
                API Reseller
              </a>
            ) : null}
            <button
              type="button"
              onClick={onTopupClick}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-amber-500 px-3 text-xs font-extrabold text-amber-950 shadow-sm hover:bg-amber-400"
            >
              Nạp tiền
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
