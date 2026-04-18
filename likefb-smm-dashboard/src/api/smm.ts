type SmmRawService = {
  service?: string | number
  service_id?: string | number
  serviceId?: string | number
  id?: string | number
  name: string
  category: string
  platform?: string
  desc?: string
  rate: string | number
  min: string | number
  max: string | number
  type?: string
  refill?: boolean | number | string
  cancel?: boolean | number | string
  dripfeed?: boolean | number | string
}

type OrdersPlaceResponse = {
  ok: boolean
  orderId: string
  smm: Record<string, unknown>
  chargedVnd: number
  balanceVnd: number
}

type OrdersHistoryResponse = {
  ok: boolean
  limit: number
  offset: number
  total: number
  orders: {
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
}

type OrdersCheckStatusResponse = {
  ok: boolean
  orderId: string
  smmOrderId: string
  smmStatus: string | null
  raw: Record<string, unknown>
}

type AdminTopupResponse = {
  ok: boolean
  amountVnd: number
  user: { id: string; email: string; balanceVnd: number }
}

type AdminUsersResponse = {
  ok: boolean
  q: string
  limit: number
  offset: number
  total: number
  users: { id: string; email: string; balanceVnd: number }[]
}

type FreeLikePlaceResponse = {
  ok: boolean
  id: string
  smmOrderId?: string | null
  smm?: Record<string, unknown>
  error?: string
  detail?: string
}

function pickApiCode(data: any): string | number | null {
  if (!data || typeof data !== 'object') return null
  const candidates = [
    (data as any).code,
    (data as any).error_code,
    (data as any).errorCode,
    (data as any).statusCode,
    (data as any).status_code,
  ]
  for (const v of candidates) {
    if (typeof v === 'string' && v.trim()) return v
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return null
}

function looksLikeSmmServiceRow(x: unknown): boolean {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false
  const o = x as Record<string, unknown>
  const svc = o.service ?? o.service_id ?? o.serviceId ?? o.Service
  if (typeof svc === 'string' || typeof svc === 'number') return true
  const id = o.id ?? o.ID
  if ((typeof id === 'string' || typeof id === 'number') && (o.rate != null || o.min != null || o.max != null)) {
    return true
  }
  return false
}

function isLikelyServicesList(arr: unknown[]): boolean {
  if (arr.length === 0) return true
  const n = Math.min(5, arr.length)
  for (let i = 0; i < n; i++) {
    if (!looksLikeSmmServiceRow(arr[i])) return false
  }
  return true
}

function servicesShapeHint(data: unknown): string {
  if (data == null) return String(data)
  if (Array.isArray(data)) return `array(len=${data.length})`
  if (typeof data === 'object') {
    const keys = Object.keys(data as object)
    return `{${keys.slice(0, 20).join(',')}${keys.length > 20 ? ',…' : ''}}`
  }
  if (typeof data === 'string') {
    const t = data.trim()
    return `string(len=${t.length}${t.length > 80 ? ',head=' + JSON.stringify(t.slice(0, 80)) : ''})`
  }
  return typeof data
}

/** Walk nested JSON until we find an array of panel service rows (objects with `service` / `service_id`). */
function findSmmServicesArray(root: unknown, maxDepth: number, seen: WeakSet<object>): unknown[] | null {
  if (root == null || maxDepth < 0) return null

  if (typeof root === 'string') {
    const t = root.trim()
    if ((t.startsWith('[') && t.endsWith(']')) || (t.startsWith('{') && t.endsWith('}'))) {
      try {
        return findSmmServicesArray(JSON.parse(t), maxDepth, seen)
      } catch {
        return null
      }
    }
    return null
  }

  if (Array.isArray(root)) {
    if (isLikelyServicesList(root)) return root
    for (const el of root) {
      const inner = findSmmServicesArray(el, maxDepth - 1, seen)
      if (inner) return inner
    }
    return null
  }

  if (typeof root !== 'object') return null
  if (seen.has(root)) return null
  seen.add(root)

  const o = root as Record<string, unknown>
  const preferred = [
    'services',
    'data',
    'list',
    'items',
    'result',
    'rows',
    'records',
    'msg',
    'response',
    'body',
    'payload',
    'content',
    'services_list',
  ]
  for (const k of preferred) {
    if (!(k in o)) continue
    const inner = findSmmServicesArray(o[k], maxDepth - 1, seen)
    if (inner) return inner
  }
  for (const v of Object.values(o)) {
    const inner = findSmmServicesArray(v, maxDepth - 1, seen)
    if (inner) return inner
  }
  return null
}

/** Upstream may return a bare array, JSON string, or deeply nested wrappers. */
export function normalizeSmmServicesJson(data: unknown): SmmRawService[] {
  const seen = new WeakSet<object>()
  const out = findSmmServicesArray(data, 12, seen)
  if (!out) {
    throw new Error(`SMM_SERVICES_BAD_SHAPE:${servicesShapeHint(data)}`)
  }
  return out as SmmRawService[]
}

function formatRequestFailedMessage(opts: {
  httpStatus: number
  code: string
  detail?: string | null
  apiCode?: string | number | null
}) {
  const meta = [
    `HTTP_${opts.httpStatus}`,
    opts.apiCode != null ? `API_CODE_${String(opts.apiCode)}` : null,
  ]
    .filter(Boolean)
    .join(', ')

  const head = meta ? `${opts.code} [${meta}]` : opts.code
  return opts.detail ? `${head}: ${opts.detail}` : head
}

async function requestJson<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const code = (data && (data.error as string)) || 'REQUEST_FAILED'
    const detail = data && typeof data.detail === 'string' ? data.detail : null
    const apiCode = pickApiCode(data)
    throw new Error(
      formatRequestFailedMessage({
        httpStatus: res.status,
        code,
        detail,
        apiCode,
      }),
    )
  }
  return data as T
}

async function requestJsonPublic<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const text = await res.text().catch(() => '')

  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }

  if (!res.ok) {
    const bodyErr = data && typeof data.error === 'string' ? data.error : null
    const bodyDetail = data && typeof data.detail === 'string' ? data.detail : null

    if (!bodyErr && !bodyDetail) {
      const snippet = text ? text.slice(0, 200) : null
      throw new Error(
        formatRequestFailedMessage({
          httpStatus: res.status,
          code: 'REQUEST_FAILED',
          detail: snippet,
          apiCode: pickApiCode(data),
        }),
      )
    }

    const code = bodyErr || 'REQUEST_FAILED'
    throw new Error(
      formatRequestFailedMessage({
        httpStatus: res.status,
        code,
        detail: bodyDetail,
        apiCode: pickApiCode(data),
      }),
    )
  }

  return data as T
}

export async function apiSmmServices(token: string) {
  const data = await requestJson<unknown>('/api/smm/services', token, { method: 'GET' })
  return normalizeSmmServicesJson(data)
}

export async function apiSmmServicesPublic() {
  const data = await requestJsonPublic<unknown>('/api/smm/services', { method: 'GET' })
  return normalizeSmmServicesJson(data)
}

// Direct (vercel functions) access when running `vercel dev` for dashboard.
// Uses the /smm/* prefix to distinguish from your own /api/* backend.
export async function apiPanelServices(token: string) {
  const data = await requestJson<unknown>('/smm/services', token, { method: 'GET' })
  return normalizeSmmServicesJson(data)
}

export async function apiFreeLikePlace(
  token: string,
  body: { platform: string; service: string | number; link: string; quantity: number },
) {
  return await requestJson<FreeLikePlaceResponse>('/api/free-like/place', token, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function apiOrdersCheckStatus(token: string, body: { orderId: string }) {
  return await requestJson<OrdersCheckStatusResponse>('/api/orders', token, {
    method: 'POST',
    body: JSON.stringify({ action: 'checkStatus', ...body }),
  })
}

export async function apiOrdersPlace(
  token: string,
  body: { service: string | number; link: string; quantity: number; comments?: string },
) {
  return await requestJson<OrdersPlaceResponse>('/api/orders', token, {
    method: 'POST',
    body: JSON.stringify({ action: 'place', ...body }),
  })
}

export async function apiOrdersHistory(
  token: string,
  params?: { limit?: number; offset?: number; from?: string; to?: string },
) {
  const usp = new URLSearchParams()
  if (params?.limit != null) usp.set('limit', String(params.limit))
  if (params?.offset != null) usp.set('offset', String(params.offset))
  if (params?.from) usp.set('from', String(params.from))
  if (params?.to) usp.set('to', String(params.to))
  const suffix = usp.toString() ? `?${usp.toString()}` : ''
  return await requestJson<OrdersHistoryResponse>(`/api/orders/history${suffix}`, token, { method: 'GET' })
}

export async function apiAdminTopup(token: string, body: { email: string; amountVnd: number }) {
  return await requestJson<AdminTopupResponse>('/api/admin', token, {
    method: 'POST',
    body: JSON.stringify({ action: 'topup', ...body }),
  })
}

export async function apiAdminUsers(
  token: string,
  params?: { q?: string; limit?: number; offset?: number },
) {
  const body: Record<string, unknown> = { action: 'users' }
  if (params?.q) body.q = params.q
  if (params?.limit != null) body.limit = params.limit
  if (params?.offset != null) body.offset = params.offset

  return await requestJson<AdminUsersResponse>('/api/admin', token, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

