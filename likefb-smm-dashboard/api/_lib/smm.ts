import { z } from 'zod'

const smmErrorSchema = z
  .object({
    error: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough()

export function smmApiUrl() {
  return process.env.SMM_API_URL || 'https://smm.com.vn/api/v2'
}

export function smmApiKey() {
  const key = process.env.SMM_API_KEY
  if (!key) throw new Error('SMM_API_KEY is missing')
  return key
}

/** Some SMM panels wrap the list in an object instead of returning a bare JSON array. */
export function normalizeSmmServicesPayload(json: unknown): unknown[] {
  if (Array.isArray(json)) return json
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    for (const k of ['services', 'data', 'list', 'items', 'result'] as const) {
      const v = o[k]
      if (Array.isArray(v)) return v
    }
  }
  throw new Error('SMM_SERVICES_BAD_SHAPE')
}

export async function smmRequest(params: Record<string, string>) {
  const body = new URLSearchParams(params)

  const cookie = process.env.SMM_COOKIE
  const res = await fetch(smmApiUrl(), {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...(cookie ? { cookie } : {}),
    },
    body,
  })

  const text = await res.text()
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('SMM_BAD_JSON')
  }

  // Some panels return 200 with { error: "..." } or non-200 with JSON body.
  const maybeErr = smmErrorSchema.safeParse(json)
  if (maybeErr.success && maybeErr.data.error != null) {
    throw new Error(`SMM_ERROR:${String(maybeErr.data.error)}`)
  }

  if (!res.ok) throw new Error(`SMM_HTTP_${res.status}`)
  return json
}

