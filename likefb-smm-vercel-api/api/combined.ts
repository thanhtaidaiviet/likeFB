import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendJson } from './_lib/http.js'
import { proxyUpstream, upstreamBaseFromEnv } from './_lib/proxy-upstream.js'

import health from './_lib/handlers/health.js'
import authUnified from './_lib/handlers/auth-unified.js'
import authLogin from './_lib/handlers/auth-login.js'
import authRegister from './_lib/handlers/auth-register.js'
import authGoogle from './_lib/handlers/auth-google.js'
import authMe from './_lib/handlers/auth-me.js'
import smmServices from './_lib/handlers/smm-services.js'
import smmAdd from './_lib/handlers/smm-add.js'
import smmBalance from './_lib/handlers/smm-balance.js'
import smmStatus from './_lib/handlers/smm-status.js'
import smmCancel from './_lib/handlers/smm-cancel.js'
import smmRefill from './_lib/handlers/smm-refill.js'
import smmRefillStatus from './_lib/handlers/smm-refill-status.js'
import adminTopup from './_lib/handlers/admin-topup.js'
import debugEnv from './_lib/handlers/debug-env.js'
import orders from './_lib/handlers/orders.js'
import ordersHistory from './_lib/handlers/orders-history.js'

type H = (req: VercelRequest, res: VercelResponse) => Promise<void> | void

function getApiPath(req: VercelRequest): string {
  const raw = req.query.path
  let p = typeof raw === 'string' ? raw : Array.isArray(raw) ? String(raw[0] ?? '') : ''
  try {
    p = decodeURIComponent(p).trim().replace(/^\/+|\/+$/g, '')
  } catch {
    p = ''
  }
  if (!p && req.url) {
    const pathname = (req.url.split('?')[0] || '').toLowerCase()
    const idx = pathname.indexOf('/api/')
    if (idx >= 0) {
      p = pathname.slice(idx + 5).replace(/^\/+|\/+$/g, '')
    }
  }
  return p.toLowerCase()
}

const localRoutes: Record<string, Partial<Record<string, H>>> = {
  health: { GET: health as H },
  'debug/env': { GET: debugEnv as H },
  auth: { POST: authUnified as H },
  'auth/register': { POST: authRegister as H },
  'auth/login': { POST: authLogin as H },
  'auth/google': { POST: authGoogle as H },
  'auth/me': { GET: authMe as H },
  'smm/services': { GET: smmServices as H },
  'smm/add': { POST: smmAdd as H },
  'smm/balance': { GET: smmBalance as H },
  'smm/status': { GET: smmStatus as H },
  'smm/cancel': { POST: smmCancel as H },
  'smm/refill': { POST: smmRefill as H },
  'smm/refill_status': { GET: smmRefillStatus as H },
  orders: { POST: orders as H },
  'orders/history': { GET: ordersHistory as H },
  'admin/topup': { POST: adminTopup as H },
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // CORS for calling api.* from dashboard (www.*)
    res.setHeader('access-control-allow-origin', '*')
    res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS')
    res.setHeader('access-control-allow-headers', 'authorization,content-type,x-api-key,x-likefb-api-key')
    res.setHeader('access-control-max-age', '86400')
    if ((req.method || '').toUpperCase() === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    const path = getApiPath(req)
    const method = (req.method || 'GET').toUpperCase()

    const sub = localRoutes[path]?.[method]
    if (sub) {
      await sub(req, res)
      return
    }

    const upstream = upstreamBaseFromEnv()
    if (upstream) {
      await proxyUpstream(upstream, path, req, res)
      return
    }

    return sendJson(res, 404, {
      error: 'NOT_FOUND',
      path,
      method,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e ?? 'UNKNOWN')
    return sendJson(res, 500, { error: 'UNHANDLED', detail: msg })
  }
}

