/** Minimal outline icons + compact language / theme controls (header + mobile drawer). */

function IconGlobe({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M3 12h18M12 3c2.8 3.6 2.8 16.4 0 20M12 3c-2.8 3.6-2.8 16.4 0 20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M5 8c2.8 1.2 5.2 1.8 7 1.8s4.2-.6 7-1.8M5 16c2.8-1.2 5.2-1.8 7-1.8s4.2.6 7 1.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconChevronDown({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconSun({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconMoon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <path
        d="M21 14.5A8.5 8.5 0 0110.5 4a8.5 8.5 0 0010.5 10.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ToolbarLanguageSelect({
  lang,
  onLangChange,
  size = 'md',
}: {
  lang: 'vi' | 'en'
  onLangChange(lang: 'vi' | 'en'): void
  size?: 'sm' | 'md'
}) {
  const box = size === 'sm' ? 'h-8 min-w-[5.25rem]' : 'h-9 min-w-[5.75rem]'
  const icon = size === 'sm' ? 'size-3.5' : 'size-4'
  const chev = size === 'sm' ? 'size-3' : 'size-3.5'
  return (
    <div className={`relative inline-flex items-center ${box}`}>
      <IconGlobe className={`pointer-events-none absolute left-2 top-1/2 ${icon} -translate-y-1/2 text-slate-600 dark:text-slate-300`} />
      <select
        value={lang}
        onChange={(e) => onLangChange(e.target.value === 'en' ? 'en' : 'vi')}
        className={[
          box,
          'w-full appearance-none rounded-lg border border-indigo-200 bg-white py-1.5 pl-8 pr-7 text-xs font-semibold uppercase tracking-wide text-slate-700 shadow-sm outline-none transition hover:bg-indigo-50/60 focus-visible:ring-2 focus-visible:ring-indigo-500/30 dark:border-indigo-500/40 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800',
        ].join(' ')}
        aria-label="Language"
      >
        <option value="vi">VI</option>
        <option value="en">EN</option>
      </select>
      <IconChevronDown className={`pointer-events-none absolute right-2 top-1/2 ${chev} -translate-y-1/2 text-slate-500 dark:text-slate-300`} />
    </div>
  )
}

export function ToolbarThemeButton({
  darkMode,
  onToggleDarkMode,
  labelSwitchToDark,
  labelSwitchToLight,
}: {
  darkMode: boolean
  onToggleDarkMode(): void
  /** When currently light (sun shown), describe switching to dark. */
  labelSwitchToDark: string
  /** When currently dark (moon shown), describe switching to light. */
  labelSwitchToLight: string
}) {
  const label = darkMode ? labelSwitchToLight : labelSwitchToDark
  return (
    <button
      type="button"
      onClick={onToggleDarkMode}
      className="inline-flex size-8 items-center justify-center rounded-lg border border-indigo-200 bg-white text-slate-600 shadow-sm transition hover:bg-indigo-50/60 dark:border-indigo-500/40 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      aria-label={label}
      title={label}
    >
      {darkMode ? <IconMoon className="size-[15px]" /> : <IconSun className="size-[15px]" />}
    </button>
  )
}
