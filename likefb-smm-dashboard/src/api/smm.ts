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

function isPanelErrorStatus(status: unknown): boolean {
  if (status === false || status === 0) return true
  if (typeof status === 'string') {
    const t = status.trim().toLowerCase()
    return t === 'error' || t === 'fail' || t === 'failed' || t === 'false' || t === '0'
  }
  return false
}

function formatPanelMsg(msg: unknown): string {
  if (typeof msg === 'string') return msg.trim()
  if (msg && typeof msg === 'object' && !Array.isArray(msg)) {
    const o = msg as Record<string, unknown>
    if (typeof o.message === 'string') return o.message.trim()
    if (typeof o.error === 'string') return o.error.trim()
  }
  if (msg != null) return JSON.stringify(msg).slice(0, 500)
  return ''
}

function assertSmmPanelTransportOk(json: unknown): void {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return
  const o = json as Record<string, unknown>

  if (o.error != null) {
    const err = String(o.error ?? '').trim()
    if (err) throw new Error(`SMM_ERROR:${err}`)
  }

  if (typeof o.status === 'string' && o.status.trim().toLowerCase() === 'error') {
    const text = formatPanelMsg(o.msg)
    if (text) throw new Error(`SMM_ERROR:${text}`)
    throw new Error('SMM_ERROR:UNKNOWN')
  }

  if (isPanelErrorStatus(o.status)) {
    throw new Error(`SMM_ERROR:${formatPanelMsg(o.msg) || 'UNKNOWN'}`)
  }
}

function loosePick(o: Record<string, unknown>, canonical: string): unknown {
  const want = canonical.toLowerCase()
  for (const k of Object.keys(o)) {
    if (k.toLowerCase() === want) return o[k]
  }
  return undefined
}

function rowServiceIdLoose(o: Record<string, unknown>): unknown {
  return (
    o.service ??
    o.service_id ??
    o.serviceId ??
    o.Service ??
    o.SERVICE ??
    loosePick(o, 'service') ??
    loosePick(o, 'service_id') ??
    loosePick(o, 'id')
  )
}

function rowRateMinMaxLoose(o: Record<string, unknown>): unknown {
  return (
    o.rate ??
    o.Rate ??
    o.min ??
    o.max ??
    loosePick(o, 'rate') ??
    loosePick(o, 'min') ??
    loosePick(o, 'price')
  )
}

function looksLikeSmmServiceRow(x: unknown): boolean {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false
  const o = x as Record<string, unknown>
  const svc = rowServiceIdLoose(o)
  if (typeof svc === 'string' || typeof svc === 'number') return true
  const id = o.id ?? o.ID ?? loosePick(o, 'id')
  if ((typeof id === 'string' || typeof id === 'number') && rowRateMinMaxLoose(o) != null) {
    return true
  }
  return false
}

function looksLikeSmmServiceRowLenient(x: unknown): boolean {
  if (looksLikeSmmServiceRow(x)) return true
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false
  const o = x as Record<string, unknown>
  const keys = Object.keys(o)
  if (keys.length < 4) return false
  if (keys.length <= 4 && 'status' in o && 'msg' in o) return false
  const hasRateish = keys.some((k) => {
    const l = k.toLowerCase()
    return l.includes('rate') || l.includes('price') || l.endsWith('cost')
  })
  const hasNameish = keys.some((k) => {
    const l = k.toLowerCase()
    return l === 'name' || l === 'title' || (l.includes('service') && l.includes('name'))
  })
  return hasRateish && (hasNameish || rowServiceIdLoose(o) != null)
}

function isLikelyServicesList(arr: unknown[]): boolean {
  if (arr.length === 0) return true
  const n = Math.min(5, arr.length)
  const strict = () => {
    for (let i = 0; i < n; i++) {
      if (!looksLikeSmmServiceRow(arr[i])) return false
    }
    return true
  }
  const lenient = () => {
    for (let i = 0; i < n; i++) {
      if (!looksLikeSmmServiceRowLenient(arr[i])) return false
    }
    return true
  }
  return strict() || lenient()
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

function tryNumericKeyedArray(val: unknown): unknown[] | null {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return null
  const o = val as Record<string, unknown>
  const keys = Object.keys(o)
  if (keys.length === 0 || !keys.every((k) => /^\d+$/.test(k))) return null
  return keys.sort((a, b) => Number(a) - Number(b)).map((k) => o[k])
}

function peelServicesEnvelope(json: unknown): unknown {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return json
  const o = json as Record<string, unknown>

  if (o.data != null && (o.success === true || o.ok === true)) {
    return o.data
  }

  if ('msg' in o && 'status' in o && !isPanelErrorStatus(o.status)) {
    return o.msg
  }

  const keys = Object.keys(o)
  if (keys.length === 1 && keys[0] === 'msg') return o.msg

  return json
}

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

  const asPseudo = tryNumericKeyedArray(root)
  if (asPseudo) {
    const inner = findSmmServicesArray(asPseudo, maxDepth, seen)
    if (inner) return inner
  }

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

/** Upstream may return a bare array, {status,msg}, JSON string, or nested wrappers. */
export function normalizeSmmServicesJson(data: unknown): SmmRawService[] {
  assertSmmPanelTransportOk(data)
  const peeled = peelServicesEnvelope(data)
  const seen = new WeakSet<object>()
  const out = findSmmServicesArray(peeled, 14, seen)
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

