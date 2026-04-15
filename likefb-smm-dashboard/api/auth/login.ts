import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { getPool } from '../_lib/pool'
import { verifyPassword } from '../_lib/password'
import { signAccessToken } from '../_lib/jwt'
import { onlyMethods, sendJson } from '../_lib/http'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
})

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!onlyMethods(req, res, ['POST'])) return

  try {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) return sendJson(res, 400, { error: 'INVALID_INPUT' })

    const { email, password } = parsed.data

    const result = await getPool().query('select id, email, password_hash from users where email = $1', [
      email.toLowerCase(),
    ])
    const row = result.rows[0] as
      | { id: string; email: string; password_hash: string | null }
      | undefined
    if (!row) return sendJson(res, 401, { error: 'INVALID_CREDENTIALS' })
    if (!row.password_hash) return sendJson(res, 401, { error: 'INVALID_CREDENTIALS' })

    const ok = await verifyPassword(password, row.password_hash)
    if (!ok) return sendJson(res, 401, { error: 'INVALID_CREDENTIALS' })

    const token = signAccessToken({ sub: row.id, email: row.email })
    return sendJson(res, 200, { token, user: { id: row.id, email: row.email } })
  } catch (err: any) {
    if (typeof err?.message === 'string' && err.message.startsWith('CONFIG_ERROR:')) {
      console.error(err)
      return sendJson(res, 500, { error: 'CONFIG_ERROR' })
    }
    console.error(err)
    return sendJson(res, 500, { error: 'SERVER_ERROR' })
  }
}

