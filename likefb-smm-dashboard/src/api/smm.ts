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
type OrdersPlaceResponse = {
  ok: boolean
  orderId: string
  smm: Record<string, unknown>
  chargedVnd: number
  balanceVnd: number
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
    throw new Error(detail ? `${code}: ${detail}` : code)
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
      throw new Error(snippet ? `REQUEST_FAILED: ${snippet}` : `REQUEST_FAILED_HTTP_${res.status}`)
    }

    const code = bodyErr || 'REQUEST_FAILED'
    throw new Error(bodyDetail ? `${code}: ${bodyDetail}` : code)
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

