import { useEffect, useState } from 'react'
import type { SmmService } from '../types'
import { apiOrdersCheckStatus, apiOrdersHistory } from '../api/smm'

export default function UserPanel({
  userName,
  userId: _userId,
  balanceVnd,
  formatVnd,
  service,
  token,
  isAuthed,
  isAdmin,
}: {
  userName: string
  userId: string
  balanceVnd: number
  formatVnd: (n: number) => string
  service: SmmService | null
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
    const isRunning = norm === 'in progress' || norm === 'inprogress'
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
    if (!isAuthed || !token) return
    const nextPageSize = next?.pageSize ?? pageSize
    const nextPage = Math.max(1, Math.trunc(next?.page ?? page))
    const offset = (nextPage - 1) * nextPageSize

    setLoading(true)
    setError(null)
    try {
      const res = await apiOrdersHistory(token, {
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
      setOrders([])
      setError(null)
      return
    }
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await apiOrdersHistory(token, {
          limit: pageSize,
          offset: 0,
        })
        if (cancelled) return
        setOrders(res.orders || [])
        setTotal(Number(res.total) || 0)
        setPage(1)
      } catch (e: any) {
        if (cancelled) return
        setError(String(e?.message || 'ORDERS_HISTORY_FAILED'))
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
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="break-words text-sm font-semibold text-slate-900">
              {userName}
            </div>
          </div>
          <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
            Online
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-slate-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Số dư
          </div>
          <div className="mt-1 text-2xl font-extrabold text-slate-900">
            {formatVnd(balanceVnd)}
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Số dư tự trừ sau khi đặt hàng.
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-slate-900">
          Thông tin dịch vụ
        </div>
        <div className="mt-3 grid gap-3 text-sm">
          <Row label="Trạng thái" value={service ? 'Đã chọn' : 'Chưa chọn'} />
          <Row label="Service ID" value={service?.id ?? '-'} />
          <Row label="Giá / 1k" value={service ? formatVnd(service.rateVndPer1k) : '-'} />
          <Row label="Min" value={service ? service.min.toLocaleString('vi-VN') : '-'} />
          <Row label="Max" value={service ? service.max.toLocaleString('vi-VN') : '-'} />
          <Row label="Hoàn thành" value={service?.avgCompletion ?? '-'} />

          <div className="grid grid-cols-[110px_1fr] items-start gap-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mô tả</div>
            <div className="min-w-0 text-sm font-semibold text-slate-800">
              {service?.desc ? (
                <div
                  className="break-words whitespace-normal [&_p]:m-0"
                  dangerouslySetInnerHTML={{ __html: service.desc }}
                />
              ) : (
                '-'
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900">Lịch sử đặt hàng</div>
          <div className="flex items-center gap-2">
            <div className="text-xs font-semibold text-slate-600">Hiển thị:</div>
            <select
              value={pageSize}
              disabled={!isAuthed || !token || loading}
              onChange={(e) => {
                const next = Number(e.target.value)
                const v = Number.isFinite(next) ? next : 10
                setPageSize(v)
                setPage(1)
              }}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 shadow-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
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
          <div className="mt-2 text-sm text-slate-600">Đăng nhập để xem lịch sử.</div>
        ) : error ? (
          <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
            Lỗi: {error}
          </div>
        ) : null}

        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
          <div className="max-h-[320px] overflow-auto overscroll-contain">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Thời gian
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Dịch vụ
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Liên kết
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Trạng thái
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Thanh toán
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Số lượng
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Mã đơn hàng
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Check
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {orders.length ? (
                  orders.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-3 py-2 text-slate-800">{formatDateTime(o.createdAt)}</td>
                      <td className="px-3 py-2 font-semibold text-slate-900">{o.serviceId}</td>
                      <td className="px-3 py-2">
                        <a
                          href={o.link}
                          target="_blank"
                          rel="noreferrer"
                          className="line-clamp-1 max-w-[260px] font-semibold text-sky-700 hover:underline"
                          title={o.link}
                        >
                          {o.link}
                        </a>
                      </td>
                      <td className="px-3 py-2 text-slate-800">
                        {statusBadge(o.smmStatus)}
                        {o.refundedAt ? (
                          <div className="mt-1 text-xs text-slate-500">
                            Hoàn {formatVnd(o.refundedVnd)} • {formatDateTime(o.refundedAt)}
                          </div>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-slate-900">
                        {formatVnd(o.totalVnd)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-slate-900">
                        {o.quantity.toLocaleString('vi-VN')}
                      </td>
                      <td className="px-3 py-2 font-semibold text-slate-900">{o.smmOrderId ?? '—'}</td>
                      <td className="px-3 py-2">
                        {o.refundedAt ||
                        (o.smmStatus != null &&
                          String(o.smmStatus).trim().toLowerCase() === 'refunded') ? null : (
                          <button
                            type="button"
                            disabled={!token || !o.smmOrderId || Boolean(checkingOrderId)}
                            onClick={() => void checkStatus({ id: o.id, smmOrderId: o.smmOrderId })}
                            className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {checkingOrderId === o.id ? '...' : 'Check'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-3 py-4 text-center text-slate-600" colSpan={9}>
                      {loading ? 'Đang tải...' : 'Chưa có đơn nào.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
          <div className="text-slate-600">
            Tổng: <span className="font-semibold text-slate-900">{total}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!isAuthed || !token || loading || page <= 1}
              onClick={() => void load({ page: Math.max(1, page - 1) })}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Prev
            </button>
            <div className="font-semibold text-slate-900">Trang {page}</div>
            <button
              type="button"
              disabled={!isAuthed || !token || loading || page * pageSize >= total || total <= 0}
              onClick={() => void load({ page: page + 1 })}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-start gap-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="min-w-0 text-sm font-semibold text-slate-800">
        <span className="break-words whitespace-normal">{value}</span>
      </div>
    </div>
  )
}

