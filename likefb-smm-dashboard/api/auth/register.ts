import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import crypto from 'node:crypto'
import { getPool } from '../_lib/pool.js'
import { hashPassword } from '../_lib/password.js'
import { signAccessToken } from '../_lib/jwt.js'
import { onlyMethods, sendJson } from '../_lib/http.js'
import { describeDbError } from '../_lib/db-error.js'

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(200),
})

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!onlyMethods(req, res, ['POST'])) return

  try {
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) return sendJson(res, 400, { error: 'INVALID_INPUT' })

    const { email, password } = parsed.data
    const passwordHash = await hashPassword(password)

    const id = crypto.randomUUID()
    const result = await getPool().query(
      'insert into users (id, email, password_hash) values ($1, $2, $3) returning id, email, created_at',
      [id, email.toLowerCase(), passwordHash],
    )
    const row = result.rows[0] as { id: string; email: string }
    const token = signAccessToken({ sub: row.id, email: row.email })
    return sendJson(res, 200, { token, user: { id: row.id, email: row.email } })
  } catch (err: any) {
    if (err?.code === '23505') return sendJson(res, 409, { error: 'EMAIL_EXISTS' })
    const hint = describeDbError(err)
    console.error(err)
    if (hint.kind === 'config') return sendJson(res, 500, { error: 'CONFIG_ERROR', hint })
    return sendJson(res, 500, { error: 'SERVER_ERROR', hint })
  }
}

