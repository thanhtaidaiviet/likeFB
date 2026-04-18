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

type SmmErrorShape = { error?: string | number } & Record<string, unknown>

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

async function smmRequest(params: Record<string, string>) {
  const url = process.env.SMM_API_URL || 'https://smm.com.vn/api/v2'
  const body = new URLSearchParams(params)
  const cookie = process.env.SMM_COOKIE

  const res = await fetch(url, {
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

  const maybe = json as SmmErrorShape
  // Panels vary: some return {error:"..."}, others return {status:"error", msg:"..."} (sometimes error is empty).
  if (maybe && (maybe as any).error != null) {
    const err = String((maybe as any).error ?? '').trim()
    const msg = typeof (maybe as any).msg === 'string' ? String((maybe as any).msg).trim() : ''
    if (err) throw new Error(`SMM_ERROR:${err}`)
    if (msg) throw new Error(`SMM_ERROR:${msg}`)
    throw new Error('SMM_ERROR:UNKNOWN')
  }
  if (maybe && typeof (maybe as any).status === 'string' && String((maybe as any).status).toLowerCase() === 'error') {
    const msg = typeof (maybe as any).msg === 'string' ? String((maybe as any).msg).trim() : ''
    if (msg) throw new Error(`SMM_ERROR:${msg}`)
  }
  if (!res.ok) throw new Error(`SMM_HTTP_${res.status}`)
  return json
}

function smmApiKey() {
  const key = process.env.SMM_API_KEY
  if (!key) throw new Error('SMM_API_KEY is missing')
  return key
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
  const data = (await smmRequest({ key: smmApiKey(), action: 'services' })) as unknown
  if (!Array.isArray(data)) throw new Error('SMM_SERVICES_BAD_SHAPE')
  servicesCache = { atMs: now, data: data as SmmServiceRow[] }
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
    const data = await smmRequest({ key: smmApiKey(), action: 'services' })
    return res.json(data)
  } catch (e: any) {
    const msg = e?.message || 'UNKNOWN'
    return res.status(502).json({ error: 'SMM_UPSTREAM_ERROR', detail: msg })
  }
})

app.get('/api/smm/balance', async (req, res) => {
  try {
    requireUser(req)
    const data = await smmRequest({ key: smmApiKey(), action: 'balance' })
    return res.json(data)
  } catch (e: any) {
    const msg = e?.message || 'UNKNOWN'
    if (msg === 'UNAUTHORIZED') return res.status(401).json({ error: 'UNAUTHORIZED' })
    return res.status(502).json({ error: 'SMM_UPSTREAM_ERROR', detail: msg })
  }
})

const smmAddSchema = z
  .object({
    service: z.union([z.string(), z.number()]),
    link: z.string().min(1),
    quantity: z.union([z.string(), z.number()]),
    comments: z.string().min(1).max(10000).optional(),
  })
  .strict()

const smmStatusSchema = z
  .object({
    order: z.union([z.string(), z.number()]),
  })
  .strict()

app.post('/api/smm/add', async (req, res) => {
  try {
    requireUser(req)
    const parsed = smmAddSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT' })

    const b = parsed.data
    const params: Record<string, string> = {
      key: smmApiKey(),
      action: 'add',
      service: String(b.service),
      link: String(b.link),
      quantity: String(b.quantity),
    }
    if (b.comments) params.comments = b.comments

    const data = await smmRequest(params)
    return res.json(data)
  } catch (e: any) {
    const msg = e?.message || 'UNKNOWN'
    if (msg === 'UNAUTHORIZED') return res.status(401).json({ error: 'UNAUTHORIZED' })
    return res.status(502).json({ error: 'SMM_UPSTREAM_ERROR', detail: msg })
  }
})

app.post('/api/smm/status', async (req, res) => {
  try {
    requireUser(req)
    const parsed = smmStatusSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT' })

    const data = await smmRequest({
      key: smmApiKey(),
      action: 'status',
      order: String(parsed.data.order),
    })
    return res.json(data)
  } catch (e: any) {
    const msg = e?.message || 'UNKNOWN'
    if (msg === 'UNAUTHORIZED') return res.status(401).json({ error: 'UNAUTHORIZED' })
    return res.status(502).json({ error: 'SMM_UPSTREAM_ERROR', detail: msg })
  }
})

const checkStatusSchema = z.object({ orderId: z.string().uuid() }).strict()

app.post('/api/orders/check-status', async (req, res) => {
  const client = await getPool().connect()
  try {
    const jwt = requireUser(req)
    const parsed = checkStatusSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT' })

    await client.query('begin')
    const r = await client.query(
      `select id, smm_order_id, sell_total_vnd, refunded_at
       from orders
       where id = $1 and user_id = $2
       limit 1
       for update`,
      [parsed.data.orderId, jwt.sub],
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
})

app.get('/api/account/balance', async (req, res) => {
  try {
    const jwt = requireUser(req)
    const r = await getPool().query('select balance_vnd from users where id = $1', [jwt.sub])
    const row = r.rows[0] as { balance_vnd: string | number } | undefined
    if (!row) return res.status(404).json({ error: 'USER_NOT_FOUND' })
    return res.json({ balanceVnd: Number(row.balance_vnd) })
  } catch (e: any) {
    const msg = e?.message || 'UNKNOWN'
    if (msg === 'UNAUTHORIZED') return res.status(401).json({ error: 'UNAUTHORIZED' })
    console.error(e)
    return res.status(500).json({ error: 'SERVER_ERROR', detail: msg })
  }
})

const topupSchema = z.object({ amountVnd: z.number().int().positive().max(1_000_000_000) }).strict()

app.post('/api/account/topup', async (req, res) => {
  try {
    const jwt = requireUser(req)
    const parsed = topupSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT' })
    const { amountVnd } = parsed.data
    const r = await getPool().query(
      'update users set balance_vnd = balance_vnd + $1 where id = $2 returning balance_vnd',
      [amountVnd, jwt.sub],
    )
    const row = r.rows[0] as { balance_vnd: string | number } | undefined
    if (!row) return res.status(404).json({ error: 'USER_NOT_FOUND' })
    return res.json({ balanceVnd: Number(row.balance_vnd) })
  } catch (e: any) {
    const msg = e?.message || 'UNKNOWN'
    if (msg === 'UNAUTHORIZED') return res.status(401).json({ error: 'UNAUTHORIZED' })
    console.error(e)
    return res.status(500).json({ error: 'SERVER_ERROR', detail: msg })
  }
})

app.get('/api/admin/users', async (req, res) => {
  try {
    await requireAdmin(req)

    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : NaN
    const offsetRaw = typeof req.query.offset === 'string' ? Number(req.query.offset) : NaN
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, Math.trunc(limitRaw)), 1000) : 5
    const offset = Number.isFinite(offsetRaw) ? Math.min(Math.max(0, Math.trunc(offsetRaw)), 1_000_000) : 0

    const args: any[] = []
    let where = ''
    if (q) {
      where = 'where email ilike $1'
      args.push(`%${q}%`)
    }
    args.push(limit, offset)

    const sql = `
      select
        id,
        email,
        coalesce(balance_vnd, 0) as balance_vnd,
        count(*) over()::int as total
      from users
      ${where}
      order by email asc
      limit $${q ? 2 : 1}
      offset $${q ? 3 : 2}
    `

    const r = await getPool().query(sql, args)
    const total = Number((r.rows?.[0] as any)?.total ?? 0) || 0
    const users = (r.rows as any[]).map((row) => ({
      id: String(row.id),
      email: String(row.email),
      balanceVnd: Number(row.balance_vnd) || 0,
    }))

    return res.json({ ok: true, users, q, limit, offset, total })
  } catch (e: any) {
    const msg = e?.message || 'UNKNOWN'
    if (msg === 'UNAUTHORIZED') return res.status(401).json({ error: 'UNAUTHORIZED' })
    if (msg === 'FORBIDDEN') return res.status(403).json({ error: 'FORBIDDEN' })
    console.error(e)
    return res.status(500).json({ error: 'SERVER_ERROR', detail: msg })
  }
})

const adminTopupSchema = z
  .object({
    email: z.string().email(),
    amountVnd: z.number().finite(),
  })
  .strict()

function normalizeTopupAmountVnd(n: number) {
  const rounded = Math.round(n)
  if (!Number.isFinite(rounded)) return null
  if (rounded <= 0) return null
  if (rounded > 1_000_000_000_000) return null
  return rounded
}

app.post('/api/admin/topup', async (req, res) => {
  try {
    await requireAdmin(req)

    const parsed = adminTopupSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT' })

    const targetEmail = String(parsed.data.email).toLowerCase()
    const amountVnd = normalizeTopupAmountVnd(parsed.data.amountVnd)
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
  } catch (e: any) {
    const msg = e?.message || 'UNKNOWN'
    if (msg === 'UNAUTHORIZED') return res.status(401).json({ error: 'UNAUTHORIZED' })
    if (msg === 'FORBIDDEN') return res.status(403).json({ error: 'FORBIDDEN' })
    console.error(e)
    return res.status(500).json({ error: 'SERVER_ERROR', detail: msg })
  }
})

app.get('/api/admin/free-like/history', async (req, res) => {
  try {
    await requireAdmin(req)

    const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : NaN
    const offsetRaw = typeof req.query.offset === 'string' ? Number(req.query.offset) : NaN
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, Math.trunc(limitRaw)), 100) : 20
    const offset = Number.isFinite(offsetRaw) ? Math.min(Math.max(0, Math.trunc(offsetRaw)), 1_000_000) : 0
    const platformRaw = typeof req.query.platform === 'string' ? req.query.platform.trim() : ''
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

const quoteSchema = z
  .object({
    service: z.union([z.string(), z.number()]),
    quantity: z.number().int().positive().max(100_000_000),
  })
  .strict()

app.post('/api/orders/quote', async (req, res) => {
  try {
    requireUser(req)
    const parsed = quoteSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT' })

    const serviceId = String(parsed.data.service)
    const qty = parsed.data.quantity

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
})

const placeSchema = z
  .object({
    service: z.union([z.string(), z.number()]),
    link: z.string().min(1),
    quantity: z.number().int().positive().max(100_000_000),
    comments: z.string().min(1).max(10000).optional(),
  })
  .strict()

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

app.post('/api/orders/place', async (req, res) => {
  const client = await getPool().connect()
  try {
    const jwt = requireUser(req)
    const parsed = placeSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT' })

    const serviceId = String(parsed.data.service)
    const qty = parsed.data.quantity
    const link = parsed.data.link

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
    if (parsed.data.comments) params.comments = parsed.data.comments

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
      // upstream business errors should not be 502
      return res.status(400).json({ error: 'SMM_REJECTED', detail: msg })
    }
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

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(7).max(200),
})

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

app.post('/api/auth/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: inputErrorCode(parsed.error) })

  const { email, password } = parsed.data
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
})

const loginSchema = z
  .object({
    email: z.string().min(1).max(320),
    password: z.string().min(1).max(200),
  })
  .strict()

app.post('/api/auth/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: inputErrorCode(parsed.error) })
  let { email, password } = parsed.data

  const raw = String(email).trim()
  const isAdminAlias = raw.toLowerCase() === 'admin'
  if (isAdminAlias) {
    email = ADMIN_EMAIL
  } else {
    // Require standard email for non-admin login
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
})

const googleLoginSchema = z.object({
  idToken: z.string().min(10),
})

const googleClient = new OAuth2Client()

app.post('/api/auth/google', async (req, res) => {
  const parsed = googleLoginSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT' })

  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) return res.status(500).json({ error: 'GOOGLE_NOT_CONFIGURED' })

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: parsed.data.idToken,
      audience: clientId,
    })
    const payload = ticket.getPayload()
    const sub = payload?.sub
    const email = payload?.email
    if (!sub || !email) return res.status(401).json({ error: 'INVALID_GOOGLE_TOKEN' })

    // Upsert: prefer google_sub; if email already exists, attach google_sub.
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

