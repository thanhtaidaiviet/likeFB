import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPool } from '../_lib/pool'
import { verifyAccessToken } from '../_lib/jwt'
import { bearerToken, onlyMethods, sendJson } from '../_lib/http'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!onlyMethods(req, res, ['GET'])) return

  try {
    const token = bearerToken(req)
    if (!token) return sendJson(res, 401, { error: 'UNAUTHORIZED' })

    const user = verifyAccessToken(token)
    const dbRes = await getPool().query('select id, email from users where id = $1', [user.sub])
    const row = dbRes.rows[0] as { id: string; email: string } | undefined
    if (!row) return sendJson(res, 401, { error: 'UNAUTHORIZED' })

    return sendJson(res, 200, { user: row })
  } catch (err: any) {
    if (typeof err?.message === 'string' && err.message.startsWith('CONFIG_ERROR:')) {
      console.error(err)
      return sendJson(res, 500, { error: 'CONFIG_ERROR' })
    }
    return sendJson(res, 401, { error: 'UNAUTHORIZED' })
  }
}

