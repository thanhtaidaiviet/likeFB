export type LocalOrderRow = {
  id: string
  serviceId: string
  link: string
  quantity: number
  totalVnd: number
  smmOrderId: string | null
  smmStatus: string | null
  refundedVnd: number
  refundedAt: string | null
  createdAt: string
}

const KEY = 'likefb_local_orders_v1'
const MAX_KEEP = 500

function safeParse<T>(text: string | null): T | null {
  if (!text) return null
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

export function loadLocalOrders(): LocalOrderRow[] {
  if (typeof window === 'undefined') return []
  const data = safeParse<unknown>(window.localStorage.getItem(KEY))
  if (!Array.isArray(data)) return []
  return data
    .filter((x) => x && typeof x === 'object')
    .map((x: any) => ({
      id: String(x.id || ''),
      serviceId: String(x.serviceId || ''),
      link: String(x.link || ''),
      quantity: Number(x.quantity) || 0,
      totalVnd: Number(x.totalVnd) || 0,
      smmOrderId: x.smmOrderId ? String(x.smmOrderId) : null,
      smmStatus: x.smmStatus ? String(x.smmStatus) : null,
      refundedVnd: Number(x.refundedVnd) || 0,
      refundedAt: x.refundedAt ? String(x.refundedAt) : null,
      createdAt: typeof x.createdAt === 'string' && x.createdAt ? x.createdAt : new Date().toISOString(),
    }))
    .filter((o) => o.id && o.serviceId && o.link)
}

export function prependLocalOrder(row: LocalOrderRow) {
  if (typeof window === 'undefined') return
  const current = loadLocalOrders()
  const next = [row, ...current.filter((x) => x.id !== row.id)].slice(0, MAX_KEEP)
  window.localStorage.setItem(KEY, JSON.stringify(next))
}

