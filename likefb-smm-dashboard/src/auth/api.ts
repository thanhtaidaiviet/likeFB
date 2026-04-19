export type AuthUser = {
  id: string
  email: string
  balanceVnd: number
}

type LoginResponse = { token: string; user: AuthUser }
type MeResponse = { user: AuthUser }

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const rawText = await res.text()
  let data: unknown = null
  if (rawText) {
    try {
      data = JSON.parse(rawText) as unknown
    } catch {
      data = null
    }
  }
  if (!res.ok) {
    const fromBody =
      data &&
      typeof data === 'object' &&
      data !== null &&
      typeof (data as { error?: unknown }).error === 'string'
        ? String((data as { error: string }).error).trim()
        : ''
    const error =
      fromBody ||
      (res.status === 502 || res.status === 503 || res.status === 504 ? 'API_UNAVAILABLE' : 'REQUEST_FAILED')
    throw new Error(error)
  }
  return data as T
}

export async function apiLogin(email: string, password: string) {
  return await requestJson<LoginResponse>('/api/auth', {
    method: 'POST',
    body: JSON.stringify({ action: 'login', email, password }),
  })
}

export async function apiRegister(email: string, password: string) {
  return await requestJson<LoginResponse>('/api/auth', {
    method: 'POST',
    body: JSON.stringify({ action: 'register', email, password }),
  })
}

export async function apiMe(token: string) {
  return await requestJson<MeResponse>('/api/auth/me', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
}

export async function apiGoogleLogin(idToken: string) {
  return await requestJson<LoginResponse>('/api/auth', {
    method: 'POST',
    body: JSON.stringify({ action: 'google', idToken }),
  })
}

