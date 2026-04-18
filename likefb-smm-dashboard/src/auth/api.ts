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
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const error = (data && (data.error as string)) || 'REQUEST_FAILED'
    throw new Error(error)
  }
  return data as T
}

export async function apiLogin(email: string, password: string) {
  return await requestJson<LoginResponse>('/api/auth/session', {
    method: 'POST',
    body: JSON.stringify({ kind: 'login', email, password }),
  })
}

export async function apiRegister(email: string, password: string) {
  return await requestJson<LoginResponse>('/api/auth/session', {
    method: 'POST',
    body: JSON.stringify({ kind: 'register', email, password }),
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
  return await requestJson<LoginResponse>('/api/auth/session', {
    method: 'POST',
    body: JSON.stringify({ kind: 'google', idToken }),
  })
}

