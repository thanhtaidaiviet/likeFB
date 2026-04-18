import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { z } from 'zod'
import crypto from 'node:crypto'
import { OAuth2Client } from 'google-auth-library'
import { getPool } from './db/pool.js'
import { hashPassword, verifyPassword } from './auth/password.js'
import { signAccessToken, verifyAccessToken } from './auth/jwt.js'

const app = express()

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
)
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

function getBearerToken(req: express.Request) {
  const header = req.headers.authorization
  if (!header) return null
  const [kind, token] = header.split(' ')
  if (kind !== 'Bearer' || !token) return null
  return token
}

function requireUser(req: express.Request) {
  const token = getBearerToken(req)
  if (!token) throw new Error('UNAUTHORIZED')
  return verifyAccessToken(token)
}

const ADMIN_EMAIL = 'adminlike@gmail.com'

async function requireAdmin(req: express.Request) {
  const jwt = requireUser(req)
  const dbRes = await getPool().query('select email from users where id = $1', [jwt.sub])
  const row = dbRes.rows[0] as { email: string } | undefined
  const email = row?.email ? String(row.email).toLowerCase() : ''
  if (email !== ADMIN_EMAIL) throw new Error('FORBIDDEN')
  return jwt
}

type SmmServiceRow = {
  service: string | number
  name: string
  category: string
  rate: string | number
  min: string | number
  max: string | number
  type?: string
  desc?: string
  platform?: string
  refill?: boolean | number | string
  cancel?: boolean | number | string
  dripfeed?: boolean | number | string
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

/** Extra context for common upstream misconfiguration (Vietnamese UI). */
function augmentSmmUpstreamErrorMessage(text: string): string {
  const t = text.toLowerCase()
  if (t.includes('request not found') || t === 'not found' || t.includes('invalid request')) {
    return `${text} — Kiểm tra SMM_API_URL (vd https://smm.com.vn/api/v2), SMM_API_KEY, SMM_COOKIE (PHPSESSID như curl); thử SMM_API_KEY_FIELD=api_key; SMM_API_BODY_FORMAT=json nếu chỉ nhận JSON. (Code đã tự thử lại JSON một lần khi gặp lỗi dạng này.)`
  }
  return text
}

function assertSmmPanelTransportOk(json: unknown): void {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return
  const o = json as Record<string, unknown>

  if (o.error != null) {
    const err = String(o.error ?? '').trim()
    if (err) throw new Error(`SMM_ERROR:${augmentSmmUpstreamErrorMessage(err)}`)
  }

  if (typeof o.status === 'string' && o.status.trim().toLowerCase() === 'error') {
    const text = formatPanelMsg(o.msg)
    if (text) throw new Error(`SMM_ERROR:${augmentSmmUpstreamErrorMessage(text)}`)
    throw new Error('SMM_ERROR:UNKNOWN')
  }

  if (isPanelErrorStatus(o.status)) {
    const raw = formatPanelMsg(o.msg) || 'UNKNOWN'
    throw new Error(`SMM_ERROR:${augmentSmmUpstreamErrorMessage(raw)}`)
  }
}

const DEFAULT_SMM_PANEL_URL = 'https://smm.com.vn/api/v2'

/** Panel Perfect Panel: POST root là /api/v2 (vd curl …/api/v2 + x-www-form-urlencoded). */
function smmApiUrlResolved() {
  const raw = (process.env.SMM_API_URL || DEFAULT_SMM_PANEL_URL).trim().replace(/\/+$/, '')
  try {
    const u = new URL(raw)
    const host = u.hostname.toLowerCase()
    if (host === 'smm.com.vn' || host === 'www.smm.com.vn') {
      const path = (u.pathname || '/').replace(/\/+$/, '') || '/'
      if (path === '/') {
        u.pathname = '/api/v2'
        return u.origin + u.pathname
      }
    }
  } catch {
    /* giữ nguyên raw nếu không parse được URL */
  }
  return raw
}

function smmApiBodyIsJson() {
  const v = (process.env.SMM_API_BODY_FORMAT || '').trim().toLowerCase()
  return v === 'json' || v === 'application/json'
}

function smmApiBodyDisallowJsonFallback() {
  const v = (process.env.SMM_API_BODY_FORMAT || '').trim().toLowerCase()
  return v === 'form' || v === 'urlencoded' || v === 'application/x-www-form-urlencoded'
}

/** Panels that expect `api_key` / `apikey` instead of `key`. */
function applySmmKeyFieldOverride(params: Record<string, string>): Record<string, string> {
  const field = (process.env.SMM_API_KEY_FIELD || 'key').trim() || 'key'
  if (field === 'key') return { ...params }
  const out = { ...params }
  if ('key' in out) {
    const v = out.key
    delete out.key
    out[field] = v
  }
  return out
}

function collectSmmPanelErrorBlob(json: unknown): string {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return ''
  const o = json as Record<string, unknown>
  const parts: string[] = []
  for (const k of ['msg', 'error', 'message', 'detail', 'description']) {
    const v = o[k]
    if (typeof v === 'string') parts.push(v)
    else if (typeof v === 'number' && Number.isFinite(v)) parts.push(String(v))
  }
  return parts.join(' ').toLowerCase()
}

/** Many gateways return this on form POST when they only accept JSON bodies. */
function panelMessageHintsWrongTransport(json: unknown): boolean {
  const t = collectSmmPanelErrorBlob(json)
  if (!t.trim()) return false
  return (
    t.includes('request not found') ||
    t.includes('invalid request') ||
    t.includes('incorrect request') ||
    t.trim() === 'not found'
  )
}

async function smmFetchOnce(
  url: string,
  params: Record<string, string>,
  useJson: boolean,
): Promise<{ res: Response; json: unknown }> {
  const cookie = process.env.SMM_COOKIE
  const headers: Record<string, string> = {
    ...(cookie ? { cookie } : {}),
  }
  let body: string | URLSearchParams
  if (useJson) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(params)
  } else {
    headers['content-type'] = 'application/x-www-form-urlencoded'
    body = new URLSearchParams(params)
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body,
  })

  const text = await res.text()
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('SMM_BAD_JSON')
  }
  return { res, json }
}

async function smmRequest(params: Record<string, string>) {
  const p = applySmmKeyFieldOverride(params)
  const url = smmApiUrlResolved()
  const forcedJson = smmApiBodyIsJson()

  let { res, json } = await smmFetchOnce(url, p, forcedJson)

  if (!forcedJson && !smmApiBodyDisallowJsonFallback() && panelMessageHintsWrongTransport(json)) {
    const second = await smmFetchOnce(url, p, true)
    if (!panelMessageHintsWrongTransport(second.json)) {
      json = second.json
      res = second.res
    }
  }

  assertSmmPanelTransportOk(json)
  if (!res.ok) throw new Error(`SMM_HTTP_${res.status}`)
  return json
}

function smmApiKey() {
  const key = process.env.SMM_API_KEY
  if (!key) throw new Error('SMM_API_KEY is missing')
  return key
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

/** Some SMM panels return nested wrappers or JSON strings instead of a bare array. */
function normalizeSmmServicesPayload(json: unknown): SmmServiceRow[] {
  assertSmmPanelTransportOk(json)
  const peeled = peelServicesEnvelope(json)
  const seen = new WeakSet<object>()
  const out = findSmmServicesArray(peeled, 14, seen)
  if (!out) {
    throw new Error(`SMM_SERVICES_BAD_SHAPE:${servicesShapeHint(json)}`)
  }
  return out as SmmServiceRow[]
}

const MARKUP_MULTIPLIER = 1.5

function toNumber(x: string | number) {
  const n = typeof x === 'number' ? x : Number(String(x).trim())
  return Number.isFinite(n) ? n : 0
}

function roundVnd(n: number) {
  // VND: round to 1đ
  return Math.round(n)
}

function formatVnd(n: number) {
  try {
    return `${Math.round(n).toLocaleString('vi-VN')} ₫`
  } catch {
    return `${Math.round(n)} ₫`
  }
}

async function telegramSendMessage(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return

  const threadId = process.env.TELEGRAM_MESSAGE_THREAD_ID
  const url = `https://api.telegram.org/bot${token}/sendMessage`
  const body: any = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  }
  if (threadId) body.message_thread_id = Number(threadId)

  await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (r) => {
    if (!r.ok) {
      const t = await r.text().catch(() => '')
      throw new Error(`TELEGRAM_HTTP_${r.status}:${t.slice(0, 200)}`)
    }
  })
}

function computeSellTotalVnd(panelRateVndPer1k: number, quantity: number) {
  const base = (quantity / 1000) * panelRateVndPer1k
  return roundVnd(base * MARKUP_MULTIPLIER)
}

let servicesCache: { atMs: number; data: SmmServiceRow[] } | null = null
const SERVICES_CACHE_TTL_MS = 5 * 60 * 1000

async function getServicesCached() {
  const now = Date.now()
  if (servicesCache && now - servicesCache.atMs < SERVICES_CACHE_TTL_MS) return servicesCache.data
  const data = normalizeSmmServicesPayload(await smmRequest({ key: smmApiKey(), action: 'services' }))
  servicesCache = { atMs: now, data }
  return servicesCache.data
}

async function getPanelRateVndPer1k(serviceId: string) {
  const services = await getServicesCached()
  const row = services.find((s) => String(s.service) === serviceId)
  if (!row) return null
  return { row, rate: toNumber(row.rate), min: toNumber(row.min), max: toNumber(row.max) }
}

app.get('/api/smm/services', async (req, res) => {
  try {
    const data = normalizeSmmServicesPayload(await smmRequest({ key: smmApiKey(), action: 'services' }))
    return res.json(data)
  } catch (e: any) {
    const msg = e?.message || 'UNKNOWN'
    return res.status(502).json({ error: 'SMM_UPSTREAM_ERROR', detail: msg })
  }
})

const ordersActionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('checkStatus'),
      orderId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal('quote'),
      service: z.union([z.string(), z.number()]),
      quantity: z.number().int().positive().max(100_000_000),
    })
    .strict(),
  z
    .object({
      action: z.literal('place'),
      service: z.union([z.string(), z.number()]),
      link: z.string().min(1),
      quantity: z.number().int().positive().max(100_000_000),
      comments: z.string().min(1).max(10000).optional(),
    })
    .strict(),
])

app.post('/api/orders', async (req, res) => {
  const parsed = ordersActionSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT' })

  const body = parsed.data

  if (body.action === 'quote') {
    try {
      requireUser(req)
      const serviceId = String(body.service)
      const qty = body.quantity

      const info = await getPanelRateVndPer1k(serviceId)
      if (!info) return res.status(404).json({ error: 'SERVICE_NOT_FOUND' })

      const panelRate = info.rate
      const sellRate = roundVnd(panelRate * MARKUP_MULTIPLIER)
      const sellTotalVnd = computeSellTotalVnd(panelRate, qty)

      return res.json({
        service: serviceId,
        quantity: qty,
        panelRateVndPer1k: panelRate,
        markupMultiplier: MARKUP_MULTIPLIER,
        sellRateVndPer1k: sellRate,
        sellTotalVnd,
        min: info.min,
        max: info.max,
        name: info.row.name,
        category: info.row.category,
        platform: info.row.platform ?? null,
      })
    } catch (e: any) {
      const msg = e?.message || 'UNKNOWN'
      if (msg === 'UNAUTHORIZED') return res.status(401).json({ error: 'UNAUTHORIZED' })
      return res.status(502).json({ error: 'SMM_UPSTREAM_ERROR', detail: msg })
    }
  }

  if (body.action === 'checkStatus') {
    const client = await getPool().connect()
    try {
      const jwt = requireUser(req)

      await client.query('begin')
      const r = await client.query(
        `select id, smm_order_id, sell_total_vnd, refunded_at
       from orders
       where id = $1 and user_id = $2
       limit 1
       for update`,
        [body.orderId, jwt.sub],
      )
    const row = r.rows[0] as { id: string; smm_order_id: string | null } | undefined
    if (!row) return res.status(404).json({ error: 'ORDER_NOT_FOUND' })
    if (!row.smm_order_id) return res.status(400).json({ error: 'MISSING_SMM_ORDER_ID' })

    const data = (await smmRequest({
      key: smmApiKey(),
      action: 'status',
      order: String(row.smm_order_id),
    })) as any

    const smmStatus =
      (data && typeof data === 'object' && (data as any).status) ||
      (data && typeof data === 'object' && (data as any).order && (data as any).order.status) ||
      null

    const statusText = smmStatus ? String(smmStatus) : null

    const isPartial = statusText && statusText.trim().toLowerCase() === 'partial'
    const refundedAtExisting = (row as any).refunded_at as string | null | undefined

    // If already refunded, keep a stable "Refunded" status in DB.
    const nextStatusText = refundedAtExisting ? 'Refunded' : statusText

    await client.query(
      `update orders
       set smm_status = $1,
           smm_status_raw = $2,
           smm_status_updated_at = now()
       where id = $3 and user_id = $4`,
      [nextStatusText, JSON.stringify(data), row.id, jwt.sub],
    )

    if (isPartial) {
      const sellTotalVnd = Number((row as any).sell_total_vnd ?? 0) || 0
      if (!refundedAtExisting && sellTotalVnd > 0) {
        await client.query('update users set balance_vnd = balance_vnd + $1 where id = $2', [
          sellTotalVnd,
          jwt.sub,
        ])
        await client.query(
          `update orders
           set refunded_vnd = $1,
               refunded_at = now()
           where id = $2 and user_id = $3`,
          [sellTotalVnd, row.id, jwt.sub],
        )

        // Mark as refunded immediately.
        await client.query(
          `update orders
           set smm_status = 'Refunded'
           where id = $1 and user_id = $2`,
          [row.id, jwt.sub],
        )
      }
    }

    await client.query('commit')
    const finalStatus =
      isPartial && !refundedAtExisting ? 'Refunded' : refundedAtExisting ? 'Refunded' : statusText

      return res.json({ ok: true, orderId: row.id, smmOrderId: row.smm_order_id, smmStatus: finalStatus, raw: data })
    } catch (e: any) {
      await client.query('rollback').catch(() => {})
      const msg = e?.message || 'UNKNOWN'
      if (msg === 'UNAUTHORIZED') return res.status(401).json({ error: 'UNAUTHORIZED' })
      return res.status(502).json({ error: 'SMM_UPSTREAM_ERROR', detail: msg })
    } finally {
      client.release()
    }
  }

  if (body.action === 'place') {
    const client = await getPool().connect()
    try {
      const jwt = requireUser(req)
      const serviceId = String(body.service)
      const qty = body.quantity
      const link = body.link

      const info = await getPanelRateVndPer1k(serviceId)
      if (!info) return res.status(404).json({ error: 'SERVICE_NOT_FOUND' })

      const sellTotalVnd = computeSellTotalVnd(info.rate, qty)

      await client.query('begin')
      const balRes = await client.query('select balance_vnd from users where id = $1 for update', [jwt.sub])
      const balRow = balRes.rows[0] as { balance_vnd: string | number } | undefined
      if (!balRow) {
        await client.query('rollback')
        return res.status(404).json({ error: 'USER_NOT_FOUND' })
      }
      const balanceVnd = Number(balRow.balance_vnd)
      if (!Number.isFinite(balanceVnd) || balanceVnd < sellTotalVnd) {
        await client.query('rollback')
        return res.status(402).json({ error: 'INSUFFICIENT_FUNDS', balanceVnd, requiredVnd: sellTotalVnd })
      }

      const orderId = crypto.randomUUID()
      const params: Record<string, string> = {
        key: smmApiKey(),
        action: 'add',
        service: serviceId,
        link,
        quantity: String(qty),
      }
      if (body.comments) params.comments = body.comments

      let upstream: any = null
      let smmOrderId: string | null = null
      let status: string = 'created'
      let errorCode: string | null = null
      let errorDetail: string | null = null

      try {
        upstream = (await smmRequest(params)) as any
        smmOrderId =
          upstream && typeof upstream === 'object' && 'order' in upstream ? String((upstream as any).order) : null
        status = smmOrderId ? 'running' : 'created'
      } catch (e: any) {
        status = 'rejected'
        errorDetail = String(e?.message || 'SMM_FAILED')
        errorCode = String(errorDetail).startsWith('SMM_ERROR:') ? 'SMM_ERROR' : 'SMM_FAILED'
      }

      await client.query(
        `insert into orders
        (id, user_id, smm_service_id, link, quantity, panel_rate_vnd_per_1k, markup_multiplier, sell_total_vnd, smm_order_id, smm_status, error_code, error_detail)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          orderId,
          jwt.sub,
          serviceId,
          link,
          qty,
          info.rate,
          MARKUP_MULTIPLIER,
          sellTotalVnd,
          smmOrderId,
          'Pending',
          errorCode,
          errorDetail,
        ],
      )

      let newBal = balanceVnd
      let chargedVnd = 0
      if (status !== 'rejected') {
        chargedVnd = sellTotalVnd
        newBal = balanceVnd - sellTotalVnd
        await client.query('update users set balance_vnd = $1 where id = $2', [newBal, jwt.sub])
      }

      await client.query('commit')

      const userEmail = (jwt as any).email ? String((jwt as any).email) : 'unknown'
      const msgLines = [
        `🧾 New order: ${orderId}`,
        `User: ${userEmail}`,
        `Service: ${serviceId}`,
        `Qty: ${qty.toLocaleString('vi-VN')}`,
        `Total: ${formatVnd(sellTotalVnd)}`,
        `Status: ${status}`,
        `Link: ${link}`,
        status === 'rejected' ? `Error: ${errorDetail}` : null,
      ].filter(Boolean) as string[]

      telegramSendMessage(msgLines.join('\n')).catch((e) => console.error('telegram:', e?.message || e))

      if (status === 'rejected') {
        return res.status(400).json({
          ok: false,
          orderId,
          error: 'SMM_REJECTED',
          detail: errorDetail,
          chargedVnd,
          balanceVnd: newBal,
        })
      }

      return res.json({
        ok: true,
        orderId,
        smm: upstream,
        chargedVnd,
        balanceVnd: newBal,
      })
    } catch (e: any) {
      await client.query('rollback').catch(() => {})
      const msg = e?.message || 'UNKNOWN'
      if (msg === 'UNAUTHORIZED') return res.status(401).json({ error: 'UNAUTHORIZED' })
      if (String(msg).startsWith('SMM_') || String(msg).startsWith('SMM_ERROR:')) {
        return res.status(400).json({ error: 'SMM_REJECTED', detail: msg })
      }
      console.error(e)
      return res.status(500).json({ error: 'SERVER_ERROR', detail: msg })
    } finally {
      client.release()
    }
  }
})

const adminActionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('topup'),
      email: z.string().email(),
      amountVnd: z.number().finite(),
    })
    .strict(),
  z
    .object({
      action: z.literal('freeLikeHistory'),
      limit: z.number().optional(),
      offset: z.number().optional(),
      platform: z.string().optional(),
    })
    .strict(),
])

function normalizeTopupAmountVnd(n: number) {
  const rounded = Math.round(n)
  if (!Number.isFinite(rounded)) return null
  if (rounded <= 0) return null
  if (rounded > 1_000_000_000_000) return null
  return rounded
}

app.post('/api/admin', async (req, res) => {
  try {
    await requireAdmin(req)
    const parsed = adminActionSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT' })
    const body = parsed.data

    if (body.action === 'topup') {
      const targetEmail = String(body.email).toLowerCase()
      const amountVnd = normalizeTopupAmountVnd(body.amountVnd)
      if (!amountVnd) return res.status(400).json({ error: 'INVALID_AMOUNT' })

      const updateRes = await getPool().query(
        `
      update users
      set balance_vnd = coalesce(balance_vnd, 0) + $1
      where email = $2
      returning id, email, coalesce(balance_vnd, 0) as balance_vnd
      `,
        [amountVnd, targetEmail],
      )

      const row = updateRes.rows[0] as { id: string; email: string; balance_vnd: number } | undefined
      if (!row) return res.status(404).json({ error: 'USER_NOT_FOUND' })

      return res.json({
        ok: true,
        user: { id: row.id, email: row.email, balanceVnd: Number(row.balance_vnd) || 0 },
        amountVnd,
      })
    }

    // body.action === 'freeLikeHistory'
    const limitRaw = body.limit != null ? Number(body.limit) : NaN
    const offsetRaw = body.offset != null ? Number(body.offset) : NaN
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, Math.trunc(limitRaw)), 100) : 20
    const offset = Number.isFinite(offsetRaw) ? Math.min(Math.max(0, Math.trunc(offsetRaw)), 1_000_000) : 0
    const platformRaw = body.platform != null ? String(body.platform).trim() : ''
    const platform = platformRaw && platformRaw !== 'All' ? platformRaw : ''

    const whereParts: string[] = []
    const args: any[] = []
    if (platform) {
      args.push(platform)
      whereParts.push(`f.platform = $${args.length}`)
    }
    args.push(limit, offset)
    const limitArg = `$${args.length - 1}`
    const offsetArg = `$${args.length}`

    const r = await getPool().query(
      `
      select
        f.id,
        u.email as user_email,
        f.platform,
        f.smm_service_id,
        f.link,
        f.quantity,
        f.smm_order_id,
        f.smm_status,
        f.created_at,
        count(*) over()::int as total
      from free_like_orders f
      join users u on u.id = f.user_id
      ${whereParts.length ? `where ${whereParts.join(' and ')}` : ''}
      order by f.created_at desc
      limit ${limitArg}
      offset ${offsetArg}
      `,
      args,
    )

    const total = Number((r.rows?.[0] as any)?.total ?? 0) || 0
    const items = (r.rows as any[]).map((row) => ({
      id: String(row.id),
      userEmail: String(row.user_email || ''),
      platform: String(row.platform || ''),
      serviceId: String(row.smm_service_id || ''),
      link: String(row.link || ''),
      quantity: Number(row.quantity) || 0,
      smmOrderId: row.smm_order_id ? String(row.smm_order_id) : null,
      smmStatus: row.smm_status ? String(row.smm_status) : null,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    }))

    return res.json({ ok: true, items, limit, offset, total })
  } catch (e: any) {
    const msg = e?.message || 'UNKNOWN'
    if (msg === 'UNAUTHORIZED') return res.status(401).json({ error: 'UNAUTHORIZED' })
    if (msg === 'FORBIDDEN') return res.status(403).json({ error: 'FORBIDDEN' })
    console.error(e)
    return res.status(500).json({ error: 'SERVER_ERROR', detail: msg })
  }
})

const freeLikeSchema = z
  .object({
    platform: z.string().min(1).max(50),
    service: z.union([z.string(), z.number()]),
    link: z.string().min(1),
    quantity: z.number().int().positive().max(100_000_000),
  })
  .strict()

app.post('/api/free-like/place', async (req, res) => {
  const client = await getPool().connect()
  try {
    const jwt = requireUser(req)
    const parsed = freeLikeSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT' })

    const platform = String(parsed.data.platform)
    const serviceId = String(parsed.data.service)
    const link = String(parsed.data.link).trim()
    const qty = parsed.data.quantity

    const params: Record<string, string> = {
      key: smmApiKey(),
      action: 'add',
      service: serviceId,
      link,
      quantity: String(qty),
    }

    let upstream: any = null
    let smmOrderId: string | null = null
    let errorCode: string | null = null
    let errorDetail: string | null = null

    try {
      upstream = (await smmRequest(params)) as any
      smmOrderId =
        upstream && typeof upstream === 'object' && 'order' in upstream ? String((upstream as any).order) : null
    } catch (e: any) {
      errorDetail = String(e?.message || 'SMM_FAILED')
      errorCode = String(errorDetail).startsWith('SMM_ERROR:') ? 'SMM_ERROR' : 'SMM_FAILED'
    }

    const id = crypto.randomUUID()
    await client.query('begin')
    await client.query(
      `insert into free_like_orders
        (id, user_id, platform, smm_service_id, link, quantity, smm_order_id, smm_status, error_code, error_detail)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        id,
        jwt.sub,
        platform,
        serviceId,
        link,
        qty,
        smmOrderId,
        'Pending',
        errorCode,
        errorDetail,
      ],
    )
    await client.query('commit')

    const userEmail = (jwt as any).email ? String((jwt as any).email) : 'unknown'
    const msgLines = [
      `🎁 Free-like: ${id}`,
      `User: ${userEmail}`,
      `Platform: ${platform}`,
      `Service: ${serviceId}`,
      `Qty: ${qty.toLocaleString('vi-VN')}`,
      `Link: ${link}`,
      smmOrderId ? `SMM: ${smmOrderId}` : null,
      errorDetail ? `Error: ${errorDetail}` : null,
    ].filter(Boolean) as string[]
    telegramSendMessage(msgLines.join('\n')).catch((e) => console.error('telegram:', e?.message || e))

    if (errorDetail) {
      return res.status(400).json({ ok: false, id, error: 'SMM_REJECTED', detail: errorDetail, smmOrderId })
    }

    return res.json({ ok: true, id, smmOrderId, smm: upstream })
  } catch (e: any) {
    await client.query('rollback').catch(() => {})
    const msg = e?.message || 'UNKNOWN'
    if (msg === 'UNAUTHORIZED') return res.status(401).json({ error: 'UNAUTHORIZED' })
    console.error(e)
    return res.status(500).json({ error: 'SERVER_ERROR', detail: msg })
  } finally {
    client.release()
  }
})

app.get('/api/orders/history', async (req, res) => {
  try {
    const jwt = requireUser(req)
    const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : NaN
    const offsetRaw = typeof req.query.offset === 'string' ? Number(req.query.offset) : NaN
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, Math.trunc(limitRaw)), 50) : 10
    const offset = Number.isFinite(offsetRaw) ? Math.min(Math.max(0, Math.trunc(offsetRaw)), 1_000_000) : 0

    const fromRaw = typeof req.query.from === 'string' ? req.query.from.trim() : ''
    const toRaw = typeof req.query.to === 'string' ? req.query.to.trim() : ''

    function parseFrom(x: string) {
      if (!x) return null
      const d = new Date(x)
      if (!Number.isFinite(d.getTime())) return null
      return d.toISOString()
    }

    function parseToExclusive(x: string) {
      if (!x) return null
      // If date-only (yyyy-mm-dd), treat it as inclusive day and convert to next-day exclusive.
      if (/^\d{4}-\d{2}-\d{2}$/.test(x)) {
        const d = new Date(`${x}T00:00:00.000Z`)
        if (!Number.isFinite(d.getTime())) return null
        d.setUTCDate(d.getUTCDate() + 1)
        return d.toISOString()
      }
      const d = new Date(x)
      if (!Number.isFinite(d.getTime())) return null
      return d.toISOString()
    }

    const fromIso = parseFrom(fromRaw)
    const toExclusiveIso = parseToExclusive(toRaw)

    const whereParts: string[] = ['user_id = $1']
    const args: any[] = [jwt.sub]
    if (fromIso) {
      args.push(fromIso)
      whereParts.push(`created_at >= $${args.length}`)
    }
    if (toExclusiveIso) {
      args.push(toExclusiveIso)
      whereParts.push(`created_at < $${args.length}`)
    }
    args.push(limit, offset)
    const limitArg = `$${args.length - 1}`
    const offsetArg = `$${args.length}`

    const r = await getPool().query(
      `
      select
        id,
        smm_service_id,
        link,
        quantity,
        sell_total_vnd,
        smm_order_id,
        smm_status,
        refunded_vnd,
        refunded_at,
        created_at,
        count(*) over()::int as total
      from orders
      where ${whereParts.join(' and ')}
      order by created_at desc
      limit ${limitArg}
      offset ${offsetArg}
      `,
      args,
    )

    const total = Number((r.rows?.[0] as any)?.total ?? 0) || 0
    const orders = (r.rows as any[]).map((row) => ({
      id: String(row.id),
      serviceId: String(row.smm_service_id),
      link: String(row.link),
      quantity: Number(row.quantity) || 0,
      totalVnd: Number(row.sell_total_vnd) || 0,
      smmOrderId: row.smm_order_id ? String(row.smm_order_id) : null,
      smmStatus: row.smm_status ? String(row.smm_status) : null,
      refundedVnd: Number(row.refunded_vnd) || 0,
      refundedAt: row.refunded_at ? new Date(row.refunded_at).toISOString() : null,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    }))

    return res.json({ ok: true, orders, limit, offset, total })
  } catch (e: any) {
    const msg = e?.message || 'UNKNOWN'
    if (msg === 'UNAUTHORIZED') return res.status(401).json({ error: 'UNAUTHORIZED' })
    console.error(e)
    return res.status(500).json({ error: 'SERVER_ERROR', detail: msg })
  }
})

const authActionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('register'),
      email: z.string().email(),
      password: z.string().min(7).max(200),
    })
    .strict(),
  z
    .object({
      action: z.literal('login'),
      email: z.string().min(1).max(320),
      password: z.string().min(1).max(200),
    })
    .strict(),
  z
    .object({
      action: z.literal('google'),
      idToken: z.string().min(10),
    })
    .strict(),
])

function inputErrorCode(err: z.ZodError) {
  for (const issue of err.issues) {
    const field = issue.path?.[0]
    if (field === 'email') return 'EMAIL_INVALID'
    if (field === 'password') {
      if (issue.code === 'too_small') return 'WEAK_PASSWORD'
      return 'INVALID_PASSWORD'
    }
  }
  return 'INVALID_INPUT'
}

const googleClient = new OAuth2Client()

app.post('/api/auth', async (req, res) => {
  const parsed = authActionSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: inputErrorCode(parsed.error) })

  const body = parsed.data

  if (body.action === 'register') {
    const { email, password } = body
    const passwordHash = await hashPassword(password)

    try {
      const id = crypto.randomUUID()
      const result = await getPool().query(
        'insert into users (id, email, password_hash) values ($1, $2, $3) returning id, email, created_at, balance_vnd',
        [id, email.toLowerCase(), passwordHash],
      )
      const row = result.rows[0] as { id: string; email: string; balance_vnd: string | number }
      const token = signAccessToken({ sub: row.id, email: row.email })
      return res
        .status(201)
        .json({ token, user: { id: row.id, email: row.email, balanceVnd: Number(row.balance_vnd) } })
    } catch (err: any) {
      if (err?.code === '23505') return res.status(409).json({ error: 'EMAIL_EXISTS' })
      console.error(err)
      return res.status(500).json({ error: 'SERVER_ERROR' })
    }
  }

  if (body.action === 'login') {
    let { email, password } = body

    const raw = String(email).trim()
    const isAdminAlias = raw.toLowerCase() === 'admin'
    if (isAdminAlias) {
      email = ADMIN_EMAIL
    } else {
      const okEmail = z.string().email().safeParse(raw)
      if (!okEmail.success) return res.status(400).json({ error: 'EMAIL_INVALID' })
      email = okEmail.data
    }

    const result = await getPool().query(
      'select id, email, password_hash, balance_vnd from users where email = $1',
      [email.toLowerCase()],
    )
    const row = result.rows[0] as
      | { id: string; email: string; password_hash: string | null; balance_vnd: string | number }
      | undefined
    if (!row) return res.status(404).json({ error: 'USER_NOT_FOUND' })
    if (!row.password_hash) return res.status(409).json({ error: 'PASSWORD_NOT_SET' })

    const ok = await verifyPassword(password, row.password_hash)
    if (!ok) return res.status(401).json({ error: 'INVALID_PASSWORD' })

    const token = signAccessToken({ sub: row.id, email: row.email })
    return res.json({ token, user: { id: row.id, email: row.email, balanceVnd: Number(row.balance_vnd) } })
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) return res.status(500).json({ error: 'GOOGLE_NOT_CONFIGURED' })

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: body.idToken,
      audience: clientId,
    })
    const payload = ticket.getPayload()
    const sub = payload?.sub
    const email = payload?.email
    if (!sub || !email) return res.status(401).json({ error: 'INVALID_GOOGLE_TOKEN' })

    const lowerEmail = String(email).toLowerCase()
    const newId = crypto.randomUUID()
    const dbRes = await getPool().query(
      `
      with existing as (
        select id, email, google_sub
        from users
        where google_sub = $1 or email = $2
        limit 1
      ),
      updated as (
        update users
        set google_sub = $1
        where id in (select id from existing)
        returning id, email
      ),
      inserted as (
        insert into users (id, email, google_sub)
        select $3, $2, $1
        where not exists (select 1 from existing)
        returning id, email
      )
      select * from updated
      union all
      select * from inserted
      limit 1;
      `,
      [sub, lowerEmail, newId],
    )

    const row = dbRes.rows[0] as { id: string; email: string } | undefined
    if (!row) return res.status(500).json({ error: 'SERVER_ERROR' })

    const token = signAccessToken({ sub: row.id, email: row.email })
    const balRes = await getPool().query('select balance_vnd from users where id = $1', [row.id])
    const balRow = balRes.rows[0] as { balance_vnd: string | number } | undefined
    return res.json({
      token,
      user: { id: row.id, email: row.email, balanceVnd: Number(balRow?.balance_vnd ?? 0) },
    })
  } catch (err) {
    console.error(err)
    return res.status(401).json({ error: 'INVALID_GOOGLE_TOKEN' })
  }
})

app.get('/api/auth/me', async (req, res) => {
  try {
    const user = requireUser(req)
    const dbRes = await getPool().query('select id, email, balance_vnd from users where id = $1', [user.sub])
    const row = dbRes.rows[0] as { id: string; email: string; balance_vnd: string | number } | undefined
    if (!row) return res.status(401).json({ error: 'UNAUTHORIZED' })
    return res.json({ user: { id: row.id, email: row.email, balanceVnd: Number(row.balance_vnd) } })
  } catch {
    return res.status(401).json({ error: 'UNAUTHORIZED' })
  }
})

const port = Number(process.env.PORT || 4000)
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`)
})

async function cleanupOldRefundedSmmErrorOrders() {
  const enabled = process.env.CLEANUP_ENABLED !== 'false'
  if (!enabled) return

  const days = Number(process.env.CLEANUP_REFUNDED_DAYS || 30)
  const limit = Number(process.env.CLEANUP_DELETE_LIMIT || 500)
  const keepDays = Number.isFinite(days) ? Math.max(1, Math.trunc(days)) : 30
  const take = Number.isFinite(limit) ? Math.max(1, Math.trunc(limit)) : 500

  try {
    const r = await getPool().query(
      `
      with doomed as (
        select id
        from orders
        where refunded_at is not null
          and (error_code = 'SMM_ERROR' or error_detail like 'SMM_ERROR:%')
          and created_at < now() - ($1::int || ' days')::interval
        order by created_at asc
        limit $2
      )
      delete from orders
      where id in (select id from doomed)
      returning id
      `,
      [keepDays, take],
    )
    const deleted = Array.isArray(r.rows) ? r.rows.length : 0
    if (deleted) console.log(`cleanup: deleted ${deleted} refunded SMM_ERROR orders (>${keepDays}d)`)
  } catch (e: any) {
    console.error('cleanup: failed', e?.message || e)
  }
}

// Run cleanup on startup and then periodically (default: every 24h).
void cleanupOldRefundedSmmErrorOrders()
const cleanupHours = Number(process.env.CLEANUP_INTERVAL_HOURS || 24)
const cleanupMs = Number.isFinite(cleanupHours) ? Math.max(1, cleanupHours) * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
setInterval(() => {
  void cleanupOldRefundedSmmErrorOrders()
}, cleanupMs)

