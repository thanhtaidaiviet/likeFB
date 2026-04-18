type SmmRawService = {
  service: string | number
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

type SmmAddResponse = Record<string, unknown>
type SmmStatusResponse = Record<string, unknown>
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

type AdminFreeLikeHistoryResponse = {
  ok: boolean
  limit: number
  offset: number
  total: number
  items: {
    id: string
    userEmail: string
    platform: string
    serviceId: string
    link: string
    quantity: number
    smmOrderId: string | null
    smmStatus: string | null
    createdAt: string | null
  }[]
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
  // upstream returns an array; we keep as typed array here
  return await requestJson<SmmRawService[]>('/api/smm/services', token, { method: 'GET' })
}

export async function apiSmmServicesPublic() {
  return await requestJsonPublic<SmmRawService[]>('/api/smm/services', { method: 'GET' })
}

// Direct (vercel functions) access when running `vercel dev` for dashboard.
// Uses the /smm/* prefix to distinguish from your own /api/* backend.
export async function apiPanelServices(token: string) {
  return await requestJson<SmmRawService[]>('/smm/services', token, { method: 'GET' })
}

export async function apiSmmAdd(
  token: string,
  body: { service: string | number; link: string; quantity: string | number; comments?: string },
) {
  return await requestJson<SmmAddResponse>('/api/smm/add', token, {
    method: 'POST',
    body: JSON.stringify(body),
  })
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

export async function apiAdminFreeLikeHistory(
  token: string,
  params?: { limit?: number; offset?: number; platform?: string },
) {
  const usp = new URLSearchParams()
  if (params?.limit != null) usp.set('limit', String(params.limit))
  if (params?.offset != null) usp.set('offset', String(params.offset))
  if (params?.platform) usp.set('platform', String(params.platform))
  const suffix = usp.toString() ? `?${usp.toString()}` : ''
  return await requestJson<AdminFreeLikeHistoryResponse>(`/api/admin/free-like/history${suffix}`, token, {
    method: 'GET',
  })
}

export async function apiSmmStatus(token: string, body: { order: string | number }) {
  return await requestJson<SmmStatusResponse>('/api/smm/status', token, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function apiOrdersCheckStatus(token: string, body: { orderId: string }) {
  return await requestJson<OrdersCheckStatusResponse>('/api/orders/check-status', token, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function apiPanelAdd(
  token: string,
  body: { service: string | number; link: string; quantity: string | number; comments?: string },
) {
  return await requestJson<SmmAddResponse>('/smm/add', token, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function apiOrdersPlace(
  token: string,
  body: { service: string | number; link: string; quantity: number; comments?: string },
) {
  return await requestJson<OrdersPlaceResponse>('/api/orders/place', token, {
    method: 'POST',
    body: JSON.stringify(body),
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
  return await requestJson<AdminTopupResponse>('/api/admin/topup', token, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function apiAdminUsers(
  token: string,
  params?: { q?: string; limit?: number; offset?: number },
) {
  const q = params?.q ? String(params.q) : ''
  const limit = params?.limit != null ? String(params.limit) : ''
  const offset = params?.offset != null ? String(params.offset) : ''
  const usp = new URLSearchParams()
  if (q) usp.set('q', q)
  if (limit) usp.set('limit', limit)
  if (offset) usp.set('offset', offset)
  const suffix = usp.toString() ? `?${usp.toString()}` : ''

  return await requestJson<AdminUsersResponse>(`/api/admin/users${suffix}`, token, { method: 'GET' })
}

