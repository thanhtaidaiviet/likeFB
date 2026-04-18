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

/** Some SMM panels wrap the list in nested objects or return JSON as a string. */
export function normalizeSmmServicesPayload(json: unknown): unknown[] {
  const seen = new WeakSet<object>()
  const out = findSmmServicesArray(json, 12, seen)
  if (!out) {
    throw new Error(`SMM_SERVICES_BAD_SHAPE:${servicesShapeHint(json)}`)
  }
  return out
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

