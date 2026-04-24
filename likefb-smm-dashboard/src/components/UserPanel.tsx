import { useEffect, useState } from 'react'
import { apiOrdersCheckStatus, apiOrdersSummary } from '../api/smm'
import { loadLocalOrders } from '../localOrders'

export default function UserPanel({
  userId: _userId,
  formatVnd,
  token,
  isAuthed,
  isAdmin,
}: {
  userId: string
  formatVnd: (n: number) => string
  token?: string | null
  isAuthed: boolean
  isAdmin: boolean
}) {
  const [orders, setOrders] = useState<
    {
      id: string
      serviceId: string
      link: string
      quantity: number
      totalVnd: number
      smmOrderId: string | null
      smmStatus: string | null
      refundedVnd: number
      refundedAt: string | null
      createdAt: string | null
    }[]
  >([])
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkingOrderId, setCheckingOrderId] = useState<string | null>(null)
  const [useLocalHistory, setUseLocalHistory] = useState(false)

  function formatDateTime(iso: string | null) {
    if (!iso) return '—'
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleString('vi-VN')
  }

  function statusBadge(raw: string | null) {
    const s = String(raw || '').trim()
    if (!s) {
      return <span className="text-slate-500">—</span>
    }

    const norm = s.toLowerCase()
    const isRunning =
      norm === 'running' ||
      norm === 'processing' ||
      norm === 'in progress' ||
      norm === 'inprogress'
    if (isRunning) {
      return (
        <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
          Đang chạy
        </span>
      )
    }

    const isPending = norm === 'pending'
    if (isPending) {
      return (
        <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800 ring-1 ring-inset ring-sky-200">
          Đang chờ
        </span>
      )
    }

    const isCompleted = norm === 'completed'
    if (isCompleted) {
      return (
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
          Hoàn tất
        </span>
      )
    }

    const isRefunded = norm === 'refunded'
    if (isRefunded) {
      return (
        <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200">
          Đã hoàn tiền
        </span>
      )
    }

    const isPartial = norm === 'partial' || norm.includes('partial')
    if (isPartial) {
      return (
        <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
          Lỗi
        </span>
      )
    }

    return (
      <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200">
        {s}
      </span>
    )
  }

  async function load(next?: { page?: number; pageSize?: number }) {
    if (useLocalHistory) {
      const nextPageSize = next?.pageSize ?? pageSize
      const nextPage = Math.max(1, Math.trunc(next?.page ?? page))
      const offset = (nextPage - 1) * nextPageSize
      const all = loadLocalOrders()
      const slice = all.slice(offset, offset + nextPageSize)
      setOrders(slice)
      setTotal(all.length)
      setPage(nextPage)
      setPageSize(nextPageSize)
      return
    }
    if (!isAuthed || !token) return
    const nextPageSize = next?.pageSize ?? pageSize
    const nextPage = Math.max(1, Math.trunc(next?.page ?? page))
    const offset = (nextPage - 1) * nextPageSize

    setLoading(true)
    setError(null)
    try {
      const res = await apiOrdersSummary(token, {
        limit: nextPageSize,
        offset,
      })
      setOrders(res.orders || [])
      setTotal(Number(res.total) || 0)
      setPage(nextPage)
      setPageSize(nextPageSize)
    } catch (e: any) {
      setError(String(e?.message || 'ORDERS_HISTORY_FAILED'))
    } finally {
      setLoading(false)
    }
  }

  async function checkStatus(row: { id: string; smmOrderId: string | null }) {
    if (!token) return
    if (useLocalHistory) return
    if (!row.smmOrderId) return
    if (checkingOrderId) return

    setCheckingOrderId(row.id)
    try {
      await apiOrdersCheckStatus(token, { orderId: row.id })
      // Reload current page so table reflects the saved status from DB.
      await load({ page })
    } catch (e: any) {
      setError(String(e?.message || 'STATUS_FAILED'))
    } finally {
      setCheckingOrderId(null)
    }
  }

  useEffect(() => {
    let cancelled = false
    if (!isAuthed || !token) {
      const local = loadLocalOrders()
      if (local.length) {
        setUseLocalHistory(true)
        setOrders(local.slice(0, pageSize))
        setTotal(local.length)
        setPage(1)
        setError(null)
      } else {
        setOrders([])
        setTotal(0)
        setError(null)
      }
      return
    }
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await apiOrdersSummary(token, {
          limit: pageSize,
          offset: 0,
        })
        if (cancelled) return
        setUseLocalHistory(false)
        setOrders(res.orders || [])
        setTotal(Number(res.total) || 0)
        setPage(1)
      } catch (e: any) {
        if (cancelled) return
        const local = loadLocalOrders()
        if (local.length) {
          setUseLocalHistory(true)
          setOrders(local.slice(0, pageSize))
          setTotal(local.length)
          setPage(1)
          setError(null)
        } else {
          setError(String(e?.message || 'ORDERS_HISTORY_FAILED'))
        }
      } finally {
        if (cancelled) return
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isAdmin, isAuthed, token, pageSize])

  return (
    <div className="grid gap-4">
      <div id="order-history" className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Lịch sử đặt hàng</div>
          <div className="flex items-center gap-2">
            <div className="hidden text-xs font-semibold text-slate-600 sm:block dark:text-slate-300">Hiển thị:</div>
            <select
              value={pageSize}
              disabled={!isAuthed || !token || loading}
              onChange={(e) => {
                const next = Number(e.target.value)
                const v = Number.isFinite(next) ? next : 10
                setPageSize(v)
                setPage(1)
              }}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 shadow-sm outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
            >
              {[5, 10, 20, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!isAuthed ? (
          <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {useLocalHistory ? 'Đang hiển thị lịch sử trên máy này.' : 'Đăng nhập để xem lịch sử.'}
          </div>
        ) : error ? (
          <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
            Lỗi: {error}
          </div>
        ) : null}

        {/* Mobile: card list (easier to tap) */}
        <div className="mt-3 grid gap-2 sm:hidden">
          {orders.length ? (
            orders.map((o) => {
              const isRefunded =
                Boolean(o.refundedAt) || (o.smmStatus != null && String(o.smmStatus).trim().toLowerCase() === 'refunded')
              return (
                <div
                  key={o.id}
                  className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        Service {o.serviceId}
                      </div>
                      <div className="mt-0.5 text-[10px] leading-tight text-slate-500 dark:text-slate-400">
                        {formatDateTime(o.createdAt)}
                      </div>
                    </div>
                    <div className="shrink-0">{statusBadge(o.smmStatus)}</div>
                  </div>

                  <a
                    href={o.link}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 block break-all text-sm font-semibold text-sky-700 underline-offset-2 hover:underline dark:text-sky-300"
                    title={o.link}
                  >
                    {o.link}
                  </a>

                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg bg-slate-50 p-2 ring-1 ring-inset ring-slate-200 dark:bg-slate-900/40 dark:ring-slate-800">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Thanh toán
                      </div>
                      <div className="mt-0.5 font-extrabold text-slate-900 dark:text-slate-100">{formatVnd(o.totalVnd)}</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2 ring-1 ring-inset ring-slate-200 dark:bg-slate-900/40 dark:ring-slate-800">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Số lượng
                      </div>
                      <div className="mt-0.5 font-extrabold text-slate-900 dark:text-slate-100">
                        {o.quantity.toLocaleString('vi-VN')}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Đơn hàng
                      </div>
                      <div className="truncate font-semibold text-slate-900 dark:text-slate-100">{o.smmOrderId ?? '—'}</div>
                      {o.refundedAt ? (
                        <div className="mt-0.5 text-[10px] leading-tight text-slate-500 dark:text-slate-400">
                          Hoàn {formatVnd(o.refundedVnd)}
                        </div>
                      ) : null}
                    </div>

                    {!isRefunded ? (
                      <button
                        type="button"
                        disabled={!token || !o.smmOrderId || Boolean(checkingOrderId)}
                        onClick={() => void checkStatus({ id: o.id, smmOrderId: o.smmOrderId })}
                        className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-900 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
                      >
                        {checkingOrderId === o.id ? '...' : 'Check'}
                      </button>
                    ) : (
                      <div className="h-10" />
                    )}
                  </div>
                </div>
              )
            })
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
              {loading ? 'Đang tải...' : 'Chưa có đơn nào.'}
            </div>
          )}
        </div>

        {/* Desktop/tablet: table */}
        <div className="mt-3 hidden overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 sm:block">
          <div className="max-h-[380px] overflow-auto overscroll-contain">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900/40">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Dịch vụ
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Liên kết
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Trạng thái
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Check
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Thanh toán / SL
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Đơn hàng
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:bg-slate-950">
                {orders.length ? (
                  orders.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                      <td className="px-3 py-2 align-top">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{o.serviceId}</div>
                        <div className="mt-0.5 text-[10px] font-normal leading-tight text-slate-500 dark:text-slate-400">
                          {formatDateTime(o.createdAt)}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <a
                          href={o.link}
                          target="_blank"
                          rel="noreferrer"
                          className="line-clamp-1 max-w-[260px] font-semibold text-sky-700 hover:underline dark:text-sky-300"
                          title={o.link}
                        >
                          {o.link}
                        </a>
                      </td>
                      <td className="px-3 py-2 text-slate-800">{statusBadge(o.smmStatus)}</td>
                      <td className="px-3 py-2">
                        {o.refundedAt ||
                        (o.smmStatus != null &&
                          String(o.smmStatus).trim().toLowerCase() === 'refunded') ? null : (
                          <button
                            type="button"
                            disabled={!token || !o.smmOrderId || Boolean(checkingOrderId)}
                            onClick={() => void checkStatus({ id: o.id, smmOrderId: o.smmOrderId })}
                            className="inline-flex h-8 max-w-full items-center justify-center whitespace-normal rounded-lg border border-slate-200 bg-white px-2 py-1 text-center text-[11px] font-semibold leading-tight text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
                          >
                            {checkingOrderId === o.id ? '...' : 'Check'}
                          </button>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right align-top">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{formatVnd(o.totalVnd)}</div>
                        <div className="mt-0.5 text-[10px] font-medium leading-tight text-slate-500 dark:text-slate-400">
                          SL: {o.quantity.toLocaleString('vi-VN')}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{o.smmOrderId ?? '—'}</div>
                        {o.refundedAt ? (
                          <div className="mt-1 text-[10px] font-normal leading-tight text-slate-500 dark:text-slate-400">
                            Hoàn {formatVnd(o.refundedVnd)}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-3 py-4 text-center text-slate-600 dark:text-slate-300" colSpan={6}>
                      {loading ? 'Đang tải...' : 'Chưa có đơn nào.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
          <div className="text-slate-600 dark:text-slate-300">
            Tổng: <span className="font-semibold text-slate-900 dark:text-slate-100">{total}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!isAuthed || !token || loading || page <= 1}
              onClick={() => void load({ page: Math.max(1, page - 1) })}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
            >
              Prev
            </button>
            <div className="font-semibold text-slate-900 dark:text-slate-100">Trang {page}</div>
            <button
              type="button"
              disabled={!isAuthed || !token || loading || page * pageSize >= total || total <= 0}
              onClick={() => void load({ page: page + 1 })}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

