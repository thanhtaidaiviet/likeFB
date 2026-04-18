import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import crypto from 'node:crypto'
import { OAuth2Client } from 'google-auth-library'
import { getPool } from '../pool.js'
import { hashPassword, verifyPassword } from '../password.js'
import { signAccessToken } from '../jwt.js'
import { onlyMethods, readJsonBody, sendJson } from '../http.js'

const ADMIN_EMAIL = 'adminlike@gmail.com'

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!onlyMethods(req, res, ['POST'])) return

  let rawBody: unknown
  try {
    rawBody = await readJsonBody(req)
  } catch {
    return sendJson(res, 400, { error: 'INVALID_INPUT' })
  }

  const parsed = authActionSchema.safeParse(rawBody)
  if (!parsed.success) return sendJson(res, 400, { error: inputErrorCode(parsed.error) })

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
      return sendJson(res, 201, {
        token,
        user: { id: row.id, email: row.email, balanceVnd: Number(row.balance_vnd) },
      })
    } catch (err: any) {
      if (err?.code === '23505') return sendJson(res, 409, { error: 'EMAIL_EXISTS' })
      console.error(err)
      return sendJson(res, 500, { error: 'SERVER_ERROR' })
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
      if (!okEmail.success) return sendJson(res, 400, { error: 'EMAIL_INVALID' })
      email = okEmail.data
    }

    const result = await getPool().query(
      'select id, email, password_hash, balance_vnd from users where email = $1',
      [email.toLowerCase()],
    )
    const row = result.rows[0] as
      | { id: string; email: string; password_hash: string | null; balance_vnd: string | number }
      | undefined
    if (!row) return sendJson(res, 404, { error: 'USER_NOT_FOUND' })
    if (!row.password_hash) return sendJson(res, 409, { error: 'PASSWORD_NOT_SET' })

    const ok = await verifyPassword(password, row.password_hash)
    if (!ok) return sendJson(res, 401, { error: 'INVALID_PASSWORD' })

    const token = signAccessToken({ sub: row.id, email: row.email })
    return sendJson(res, 200, {
      token,
      user: { id: row.id, email: row.email, balanceVnd: Number(row.balance_vnd) },
    })
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) return sendJson(res, 500, { error: 'GOOGLE_NOT_CONFIGURED' })

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: body.idToken,
      audience: clientId,
    })
    const payload = ticket.getPayload()
    const sub = payload?.sub
    const email = payload?.email
    if (!sub || !email) return sendJson(res, 401, { error: 'INVALID_GOOGLE_TOKEN' })

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
    if (!row) return sendJson(res, 500, { error: 'SERVER_ERROR' })

    const token = signAccessToken({ sub: row.id, email: row.email })
    const balRes = await getPool().query('select balance_vnd from users where id = $1', [row.id])
    const balRow = balRes.rows[0] as { balance_vnd: string | number } | undefined
    return sendJson(res, 200, {
      token,
      user: { id: row.id, email: row.email, balanceVnd: Number(balRow?.balance_vnd ?? 0) },
    })
  } catch (err) {
    console.error(err)
    return sendJson(res, 401, { error: 'INVALID_GOOGLE_TOKEN' })
  }
}
