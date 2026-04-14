export type NavItem = {
  label: string
  value: string
  badge?: string
}

export default function Sidebar({
  items,
  activeValue,
  onChange,
}: {
  items: NavItem[]
  activeValue: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="grid size-9 place-items-center rounded-xl bg-indigo-600 text-sm font-extrabold text-white">
            S
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">
              SMM Panel
            </div>
            <div className="truncate text-xs text-slate-500">
              Dashboard đặt dịch vụ
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3">
        <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Nền tảng
        </div>
        <div className="grid gap-1">
          {items.map((it) => {
            const active = it.value === activeValue
            return (
              <button
                key={it.value}
                type="button"
                onClick={() => onChange(it.value)}
                className={[
                  'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition',
                  active
                    ? 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200'
                    : 'text-slate-700 hover:bg-slate-50',
                ].join(' ')}
              >
                <span className="font-medium">{it.label}</span>
                {it.badge ? (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {it.badge}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </nav>

      <div className="border-t border-slate-200 p-4">
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-xs font-semibold text-slate-700">
            Mẹo nhanh
          </div>
          <div className="mt-1 text-xs text-slate-600">
            Tìm dịch vụ theo <span className="font-semibold">ID</span> hoặc tên để
            chọn nhanh.
          </div>
        </div>
      </div>
    </div>
  )
}

