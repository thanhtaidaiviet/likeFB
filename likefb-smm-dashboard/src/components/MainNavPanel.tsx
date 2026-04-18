export type NavKey = 'overview' | 'newOrder' | 'history' | 'topup' | 'support'

export type NavMenuItem = { key: NavKey; label: string }

export default function MainNavPanel({
  navMenuItems,
  supportNavOpen,
  supportTelegramUrl,
  supportZaloUrl,
  onNavKey,
  ariaLabel,
}: {
  navMenuItems: NavMenuItem[]
  supportNavOpen: boolean
  supportTelegramUrl: string
  supportZaloUrl: string
  onNavKey(key: NavKey): void
  ariaLabel: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/80 p-3 shadow-sm ring-1 ring-slate-200/50 dark:border-slate-700 dark:from-slate-900 dark:to-slate-950/90 dark:ring-slate-700/60">
      <div className="px-1 pb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
        Menu
      </div>
      <nav className="grid gap-1" aria-label={ariaLabel}>
        {navMenuItems.map((it, idx) => (
          <div key={it.key}>
            <button
              type="button"
              onClick={() => onNavKey(it.key)}
              className={[
                'group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition',
                idx === 0
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-900/30'
                  : 'text-slate-700 ring-1 ring-transparent hover:bg-indigo-50/90 hover:text-indigo-800 hover:ring-indigo-200/60 dark:text-slate-200 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-100 dark:hover:ring-indigo-500/30',
                it.key === 'support' && supportNavOpen && idx !== 0
                  ? 'bg-indigo-50/80 ring-indigo-200/60 dark:bg-indigo-500/10 dark:ring-indigo-500/30'
                  : '',
              ].join(' ')}
            >
              <span
                className={[
                  'grid size-8 shrink-0 place-items-center rounded-lg text-[15px] leading-none',
                  idx === 0
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 text-slate-700 group-hover:bg-indigo-100 group-hover:text-indigo-700 dark:bg-slate-800 dark:text-slate-200 dark:group-hover:bg-indigo-500/20 dark:group-hover:text-indigo-100',
                ].join(' ')}
                aria-hidden="true"
              >
                {idx === 0 ? '▦' : idx === 1 ? '+' : idx === 2 ? '⏱' : idx === 3 ? '₫' : '?'}
              </span>
              <span className="min-w-0 flex-1 truncate text-left">{it.label}</span>
              {it.key === 'support' ? (
                <span
                  className={[
                    'text-xs text-slate-400 transition-transform dark:text-slate-500',
                    supportNavOpen ? 'rotate-180' : '',
                    idx === 0 ? 'text-white/80' : '',
                  ].join(' ')}
                  aria-hidden="true"
                >
                  ▾
                </span>
              ) : null}
            </button>
            {it.key === 'support' && supportNavOpen ? (
              <div className="mt-1.5 grid grid-cols-2 gap-2 pl-1">
                <a
                  href={supportTelegramUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex flex-col items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-2 py-1.5 text-center text-xs font-semibold text-slate-600 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:border-sky-500/50 dark:hover:bg-slate-800"
                >
                  <span className="inline-flex size-9 items-center justify-center rounded-full bg-sky-600 text-white shadow-sm">
                    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
                      <path d="M21.8 3.6c-.3-.3-.7-.4-1.2-.2L2.9 10.2c-.5.2-.8.6-.8 1.1 0 .5.3.9.8 1.1l4.6 1.6 1.7 5.3c.1.4.5.7.9.8.4.1.9 0 1.2-.3l2.6-2.5 4.9 3.6c.3.2.7.3 1.1.2.4-.1.7-.4.8-.8l3.4-16.1c.1-.4 0-.8-.3-1.1zM9.8 18.2l-1.2-3.8 8.9-8.2-10.9 7.2-3.8-1.3 14.7-5.7-2.9 13.8-4.7-3.4c-.4-.3-1-.3-1.3.1l-1.8 1.3z" />
                    </svg>
                  </span>
                  Telegram
                </a>
                <a
                  href={supportZaloUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex flex-col items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-2 py-1.5 text-center text-xs font-semibold text-slate-600 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:border-blue-500/50 dark:hover:bg-slate-800"
                >
                  <span className="inline-flex size-9 items-center justify-center rounded-full bg-blue-600 text-sm font-extrabold text-white shadow-sm">
                    Z
                  </span>
                  Zalo
                </a>
              </div>
            ) : null}
          </div>
        ))}
      </nav>
    </div>
  )
}
