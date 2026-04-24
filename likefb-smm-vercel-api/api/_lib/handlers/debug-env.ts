import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendJson } from '../http.js'
import { upstreamBaseFromEnv } from '../proxy-upstream.js'

export default function debugEnv(req: VercelRequest, res: VercelResponse) {
  return sendJson(res, 200, {
    ok: true,
    node: process.version,
    upstream: upstreamBaseFromEnv(),
    hasLikefbBaseUrl: Boolean(process.env.LIKEFB_SMM_API_BASE_URL),
    hasViteBaseUrl: Boolean(process.env.VITE_API_BASE_URL),
  })
}

