import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { z } from 'zod'
import crypto from 'node:crypto'
import { OAuth2Client } from 'google-auth-library'
import { pool } from './db/pool.js'
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
  if (maybe && maybe.error != null) throw new Error(`SMM_ERROR:${String(maybe.error)}`)
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

app.get('/api/account/balance', async (req, res) => {
  try {
    const jwt = requireUser(req)
    const r = await pool.query('select balance_vnd from users where id = $1', [jwt.sub])
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
    const r = await pool.query(
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

app.post('/api/orders/place', async (req, res) => {
  const client = await pool.connect()
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

    const params: Record<string, string> = {
      key: smmApiKey(),
      action: 'add',
      service: serviceId,
      link,
      quantity: String(qty),
    }
    if (parsed.data.comments) params.comments = parsed.data.comments
    const upstream = (await smmRequest(params)) as any

    const smmOrderId =
      upstream && typeof upstream === 'object' && 'order' in upstream ? String((upstream as any).order) : null

    const orderId = crypto.randomUUID()
    await client.query(
      `insert into orders
        (id, user_id, smm_service_id, link, quantity, panel_rate_vnd_per_1k, markup_multiplier, sell_total_vnd, smm_order_id, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
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
        smmOrderId ? 'running' : 'created',
      ],
    )

    const newBal = balanceVnd - sellTotalVnd
    await client.query('update users set balance_vnd = $1 where id = $2', [newBal, jwt.sub])
    await client.query('commit')

    return res.json({
      ok: true,
      orderId,
      smm: upstream,
      chargedVnd: sellTotalVnd,
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
    const result = await pool.query(
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

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
})

app.post('/api/auth/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: inputErrorCode(parsed.error) })
  const { email, password } = parsed.data

  const result = await pool.query('select id, email, password_hash, balance_vnd from users where email = $1', [
    email.toLowerCase(),
  ])
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
    const dbRes = await pool.query(
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
    const balRes = await pool.query('select balance_vnd from users where id = $1', [row.id])
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
    const dbRes = await pool.query('select id, email, balance_vnd from users where id = $1', [user.sub])
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

