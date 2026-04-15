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

export async function smmRequest(params: Record<string, string>) {
  const body = new URLSearchParams(params)

  const res = await fetch(smmApiUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
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

