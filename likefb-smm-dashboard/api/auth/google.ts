import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { OAuth2Client } from 'google-auth-library'
import crypto from 'node:crypto'
import { getPool } from '../_lib/pool'
import { signAccessToken } from '../_lib/jwt'
import { onlyMethods, sendJson } from '../_lib/http'
import { describeDbError } from '../_lib/db-error'

const googleLoginSchema = z.object({
  idToken: z.string().min(10),
})

const googleClient = new OAuth2Client()

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!onlyMethods(req, res, ['POST'])) return

  const parsed = googleLoginSchema.safeParse(req.body)
  if (!parsed.success) return sendJson(res, 400, { error: 'INVALID_INPUT' })

  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) return sendJson(res, 500, { error: 'GOOGLE_NOT_CONFIGURED' })

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: parsed.data.idToken,
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
    return sendJson(res, 200, { token, user: { id: row.id, email: row.email } })
  } catch (err: any) {
    const hint = describeDbError(err)
    console.error(err)
    if (hint.kind === 'config') return sendJson(res, 500, { error: 'CONFIG_ERROR', hint })
    // If DB fails, surface as server error (not token error) for easier debugging.
    if (hint.kind !== 'unknown') return sendJson(res, 500, { error: 'SERVER_ERROR', hint })
    return sendJson(res, 401, { error: 'INVALID_GOOGLE_TOKEN', hint })
  }
}

