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

/** Match many panels: { status: "error" | false | 0, msg: "..." }. */
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

/** Throw SMM_ERROR:* when the panel returns an error envelope (incl. {status,msg}). */
export function assertSmmPanelTransportOk(json: unknown): void {
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
    const text = formatPanelMsg(o.msg)
    throw new Error(`SMM_ERROR:${text || 'UNKNOWN'}`)
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

/** PHP-style JSON object: { "0": row, "1": row } */
function tryNumericKeyedArray(val: unknown): unknown[] | null {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return null
  const o = val as Record<string, unknown>
  const keys = Object.keys(o)
  if (keys.length === 0 || !keys.every((k) => /^\d+$/.test(k))) return null
  return keys.sort((a, b) => Number(a) - Number(b)).map((k) => o[k])
}

/** Unwrap { status: ok, msg: payload } / { success, data } before deep search. */
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

/** Normalize panel `services` action: arrays, {status,msg}, nested JSON, PHP numeric objects. */
export function normalizeSmmServicesPayload(json: unknown): unknown[] {
  assertSmmPanelTransportOk(json)
  const peeled = peelServicesEnvelope(json)
  const seen = new WeakSet<object>()
  const out = findSmmServicesArray(peeled, 14, seen)
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

  const maybeErr = smmErrorSchema.safeParse(json)
  if (maybeErr.success && maybeErr.data.error != null) {
    const ev = maybeErr.data.error
    if (typeof ev === 'string' && !ev.trim()) {
      // fall through to assertSmmPanelTransportOk (msg-only errors)
    } else {
      throw new Error(`SMM_ERROR:${String(ev)}`)
    }
  }

  assertSmmPanelTransportOk(json)

  if (!res.ok) throw new Error(`SMM_HTTP_${res.status}`)
  return json
}
