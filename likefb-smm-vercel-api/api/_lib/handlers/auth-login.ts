import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { getPool } from '../pool.js'
import { verifyPassword } from '../password.js'
import { signAccessToken } from '../jwt.js'
import { onlyMethods, readJsonBody, sendJson } from '../http.js'
import { describeDbError } from '../db-error.js'

const ADMIN_EMAIL = 'adminlike@gmail.com'

const loginSchema = z
  .object({
    email: z.string().min(1).max(320),
    password: z.string().min(1).max(200),
  })
  .strict()

function inputErrorCode(err: z.ZodError) {
  for (const issue of err.issues) {
    const field = issue.path?.[0]
    if (field === 'email') return 'EMAIL_INVALID'
    if (field === 'password') return 'PASSWORD_REQUIRED'
  }
  return 'INVALID_INPUT'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!onlyMethods(req, res, ['POST'])) return

  try {
    let body: unknown
    try {
      body = await readJsonBody(req)
    } catch {
      return sendJson(res, 400, { error: 'INVALID_INPUT' })
    }

    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) return sendJson(res, 400, { error: inputErrorCode(parsed.error) })

    let { email, password } = parsed.data

    const raw = String(email).trim()
    const isAdminAlias = raw.toLowerCase() === 'admin'
    if (isAdminAlias) {
      email = ADMIN_EMAIL
    } else {
      const okEmail = z.string().email().safeParse(raw)
      if (!okEmail.success) return sendJson(res, 400, { error: 'EMAIL_INVALID' })
      email = okEmail.data
    }

    const result = await getPool().query('select id, email, password_hash, balance_vnd from users where email = $1', [
      email.toLowerCase(),
    ])
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
  } catch (err: any) {
    const hint = describeDbError(err)
    console.error(err)
    if (hint.kind === 'config') return sendJson(res, 500, { error: 'CONFIG_ERROR', hint })
    return sendJson(res, 500, { error: 'SERVER_ERROR', hint })
  }
}

