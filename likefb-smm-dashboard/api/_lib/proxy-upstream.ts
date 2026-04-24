import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readJsonBody, sendJson } from './http.js'

/** Forward /api/* to external Express API (same routes as likefb-smm-api). */
export async function proxyUpstream(
  upstreamBase: string,
  apiPath: string,
  req: VercelRequest,
  res: VercelResponse,
) {
  try {
    const base = upstreamBase.replace(/\/$/, '')
    const pathSeg = apiPath.replace(/^\/+/, '').replace(/\/+$/, '')

    const search = new URL(req.url || '/', 'http://localhost')
    search.searchParams.delete('path')
    const debugUpstream = search.searchParams.get('debug_upstream') === '1'
    search.searchParams.delete('debug_upstream')
    const qs = search.searchParams.toString()
    const target = `${base}/api/${pathSeg}${qs ? `?${qs}` : ''}`

    const headers: Record<string, string> = {}
    const auth = req.headers.authorization
    if (auth) headers.authorization = auth
    const ct = req.headers['content-type']
    if (ct) headers['content-type'] = String(ct)

    let body: string | undefined
    if (req.method && !['GET', 'HEAD'].includes(req.method)) {
      try {
        const raw = await readJsonBody(req)
        body = raw === null || raw === undefined ? undefined : JSON.stringify(raw)
        if (body !== undefined && !headers['content-type']) {
          headers['content-type'] = 'application/json; charset=utf-8'
        }
      } catch {
        return sendJson(res, 400, { error: 'INVALID_INPUT' })
      }
    }

    let upstreamRes: Response
    try {
      upstreamRes = await fetch(target, { method: req.method || 'GET', headers, body })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'UNKNOWN'
      return sendJson(res, 502, { error: 'UPSTREAM_UNREACHABLE', detail: msg, target })
    }

    const text = await upstreamRes.text()
    res.status(upstreamRes.status)
    if (debugUpstream) {
      res.setHeader('x-likefb-upstream-target', target)
    }
    const uct = upstreamRes.headers.get('content-type')
    if (uct) res.setHeader('content-type', uct)
    else res.setHeader('content-type', 'application/json; charset=utf-8')
    res.send(text)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e ?? 'UNKNOWN')
    return sendJson(res, 500, { error: 'PROXY_FAILED', detail: msg })
  }
}

export function upstreamBaseFromEnv(): string | null {
  const v = process.env.LIKEFB_SMM_API_BASE_URL || process.env.VITE_API_BASE_URL
  if (!v || typeof v !== 'string') return null
  let t = v.trim().replace(/\/$/, '')
  if (!t) return null

  // If someone configured the marketing domain by mistake, normalize to API origin.
  // Keep scheme/path; only swap hostname.
  try {
    const u = new URL(t)
    if (u.hostname === 'www.liketiktok.xyz') {
      u.hostname = 'api.liketiktok.xyz'
      t = u.toString().replace(/\/$/, '')
    }
  } catch {
    // Ignore invalid URLs; upstreamBase must be a full origin anyway.
  }

  return t
}
