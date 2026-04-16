import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

export type ToastKind = 'success' | 'error' | 'info'

export type ToastItem = {
  id: string
  kind: ToastKind
  title: string
  description?: string
  createdAt: number
  durationMs: number
}

type ToastContextValue = {
  toast(input: Omit<ToastItem, 'id' | 'createdAt'>): void
}

const ToastContext = createContext<ToastContextValue | null>(null)

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const timers = useRef(new Map<string, number>())

  const remove = useCallback((id: string) => {
    const t = timers.current.get(id)
    if (t) window.clearTimeout(t)
    timers.current.delete(id)
    setItems((prev) => prev.filter((x) => x.id !== id))
  }, [])

  const toast = useCallback(
    (input: Omit<ToastItem, 'id' | 'createdAt'>) => {
      const id = uid()
      const durationMs = Number.isFinite(input.durationMs) ? input.durationMs : 3500
      const next: ToastItem = { ...input, id, createdAt: Date.now(), durationMs }
      setItems((prev) => [next, ...prev].slice(0, 4))
      const handle = window.setTimeout(() => remove(id), durationMs)
      timers.current.set(id, handle)
    },
    [remove],
  )

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport items={items} onDismiss={remove} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

function kindStyles(kind: ToastKind) {
  switch (kind) {
    case 'success':
      return {
        ring: 'border-emerald-200 bg-emerald-50 text-emerald-950',
        dot: 'bg-emerald-600',
      }
    case 'error':
      return { ring: 'border-rose-200 bg-rose-50 text-rose-950', dot: 'bg-rose-600' }
    case 'info':
    default:
      return { ring: 'border-slate-200 bg-white text-slate-900', dot: 'bg-sky-600' }
  }
}

function ToastViewport({
  items,
  onDismiss,
}: {
  items: ToastItem[]
  onDismiss(id: string): void
}) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[60] w-[min(360px,calc(100vw-2rem))] space-y-2">
      {items.map((t) => {
        const st = kindStyles(t.kind)
        return (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-xl border px-4 py-3 shadow-sm ${st.ring}`}
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start gap-3">
              <div className={`mt-1 size-2 rounded-full ${st.dot}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{t.title}</div>
                    {t.description ? (
                      <div className="mt-0.5 text-sm opacity-80">{t.description}</div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="inline-flex size-8 items-center justify-center rounded-lg border border-black/10 bg-white/70 text-slate-800 hover:bg-white"
                    onClick={() => onDismiss(t.id)}
                    aria-label="Đóng"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-black/5">
              <div
                className={`h-full ${st.dot}`}
                style={{
                  width: '100%',
                  animation: `toast-shrink ${Math.max(800, t.durationMs)}ms linear forwards`,
                }}
              />
            </div>
          </div>
        )
      })}

      <style>{`
        @keyframes toast-shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  )
}

