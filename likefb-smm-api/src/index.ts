import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { z } from 'zod'
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

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(200),
})

app.post('/api/auth/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT' })

  const { email, password } = parsed.data
  const passwordHash = await hashPassword(password)

  try {
    const result = await pool.query(
      'insert into users (email, password_hash) values ($1, $2) returning id, email, created_at',
      [email.toLowerCase(), passwordHash],
    )
    const row = result.rows[0] as { id: string; email: string }
    const token = signAccessToken({ sub: row.id, email: row.email })
    return res.json({ token, user: { id: row.id, email: row.email } })
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
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_INPUT' })
  const { email, password } = parsed.data

  const result = await pool.query('select id, email, password_hash from users where email = $1', [
    email.toLowerCase(),
  ])
  const row = result.rows[0] as
    | { id: string; email: string; password_hash: string | null }
    | undefined
  if (!row) return res.status(401).json({ error: 'INVALID_CREDENTIALS' })
  if (!row.password_hash) return res.status(401).json({ error: 'INVALID_CREDENTIALS' })

  const ok = await verifyPassword(password, row.password_hash)
  if (!ok) return res.status(401).json({ error: 'INVALID_CREDENTIALS' })

  const token = signAccessToken({ sub: row.id, email: row.email })
  return res.json({ token, user: { id: row.id, email: row.email } })
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
        insert into users (email, google_sub)
        select $2, $1
        where not exists (select 1 from existing)
        returning id, email
      )
      select * from updated
      union all
      select * from inserted
      limit 1;
      `,
      [sub, lowerEmail],
    )

    const row = dbRes.rows[0] as { id: string; email: string } | undefined
    if (!row) return res.status(500).json({ error: 'SERVER_ERROR' })

    const token = signAccessToken({ sub: row.id, email: row.email })
    return res.json({ token, user: { id: row.id, email: row.email } })
  } catch (err) {
    console.error(err)
    return res.status(401).json({ error: 'INVALID_GOOGLE_TOKEN' })
  }
})

function getBearerToken(req: express.Request) {
  const header = req.headers.authorization
  if (!header) return null
  const [kind, token] = header.split(' ')
  if (kind !== 'Bearer' || !token) return null
  return token
}

app.get('/api/auth/me', async (req, res) => {
  try {
    const token = getBearerToken(req)
    if (!token) return res.status(401).json({ error: 'UNAUTHORIZED' })
    const user = verifyAccessToken(token)
    const dbRes = await pool.query('select id, email from users where id = $1', [user.sub])
    const row = dbRes.rows[0] as { id: string; email: string } | undefined
    if (!row) return res.status(401).json({ error: 'UNAUTHORIZED' })
    return res.json({ user: row })
  } catch {
    return res.status(401).json({ error: 'UNAUTHORIZED' })
  }
})

const port = Number(process.env.PORT || 4000)
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`)
})

