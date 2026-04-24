import { z } from 'zod'
import crypto from 'node:crypto'
import type pg from 'pg'
import { getPool } from './pool.js'
import { normalizeSmmServicesPayload, smmApiKey, smmRequest } from './smm.js'

type SmmServiceRow = {
  service: string | number
  name: string
  category: string
  rate: string | number
  min: string | number
  max: string | number
  type?: string
  desc?: string
  platform?: string
  refill?: boolean | number | string
  cancel?: boolean | number | string
  dripfeed?: boolean | number | string
}

const MARKUP_MULTIPLIER = 1.5
const SERVICES_CACHE_TTL_MS = 5 * 60 * 1000
let servicesCache: { atMs: number; data: SmmServiceRow[] } | null = null

function toNumber(x: string | number) {
  const n = typeof x === 'number' ? x : Number(String(x).trim())
  return Number.isFinite(n) ? n : 0
}

function roundVnd(n: number) {
  return Math.round(n)
}

function computeSellTotalVnd(panelRateVndPer1k: number, quantity: number) {
  const base = (quantity / 1000) * panelRateVndPer1k
  return roundVnd(base * MARKUP_MULTIPLIER)
}

async function getServicesCached() {
  const now = Date.now()
  if (servicesCache && now - servicesCache.atMs < SERVICES_CACHE_TTL_MS) return servicesCache.data
  const raw = await smmRequest({ key: smmApiKey(), action: 'services' })
  const data = normalizeSmmServicesPayload(raw) as SmmServiceRow[]
  servicesCache = { atMs: now, data }
  return data
}

export async function getPanelRateVndPer1k(serviceId: string) {
  const services = await getServicesCached()
  const row = services.find((s) => String(s.service) === serviceId)
  if (!row) return null
  return { row, rate: toNumber(row.rate), min: toNumber(row.min), max: toNumber(row.max) }
}

function pickSmmStatusFromUpstream(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const o = data as any
  const smmStatus = o?.status ?? o?.order?.status ?? o?.data?.status ?? null
  return smmStatus != null ? String(smmStatus) : null
}

export const ordersActionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('checkStatus'),
      orderId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal('quote'),
      service: z.union([z.string(), z.number()]),
      quantity: z.number().int().positive().max(100_000_000),
    })
    .strict(),
  z
    .object({
      action: z.literal('freeLike'),
      platform: z.enum(['Facebook', 'TikTok', 'Instagram', 'YouTube', 'Telegram']),
      link: z.string().min(1),
    })
    .strict(),
  z
    .object({
      action: z.literal('place'),
      service: z.union([z.string(), z.number()]),
      link: z.string().min(1),
      quantity: z.number().int().positive().max(100_000_000),
      comments: z.string().min(1).max(10000).optional(),
    })
    .strict(),
])

export async function upsertOrderStatusHistory(
  client: pg.PoolClient,
  args: {
    orderId: string
    smmOrderId: string | null
    statusText: string | null
    raw: unknown
    actor: string
  },
) {
  await client.query(
    `insert into order_status_history (order_id, smm_order_id, status_text, status_raw, actor)
     values ($1, $2, $3, $4, $5)`,
    [args.orderId, args.smmOrderId, args.statusText, JSON.stringify(args.raw), args.actor],
  )
}

export async function handleQuote(args: { userId: string; service: string | number; quantity: number }) {
  const serviceId = String(args.service)
  const qty = args.quantity
  const info = await getPanelRateVndPer1k(serviceId)
  if (!info) return { kind: 'error' as const, status: 404, body: { error: 'SERVICE_NOT_FOUND' } }

  const panelRate = info.rate
  const sellRate = roundVnd(panelRate * MARKUP_MULTIPLIER)
  const sellTotalVnd = computeSellTotalVnd(panelRate, qty)

  return {
    kind: 'ok' as const,
    status: 200,
    body: {
      service: serviceId,
      quantity: qty,
      panelRateVndPer1k: panelRate,
      markupMultiplier: MARKUP_MULTIPLIER,
      sellRateVndPer1k: sellRate,
      sellTotalVnd,
      min: info.min,
      max: info.max,
      name: info.row.name,
      category: info.row.category,
      platform: info.row.platform ?? null,
    },
  }
}

export async function handleCheckStatus(args: { userId: string; orderId: string }) {
  const client = await getPool().connect()
  try {
    await client.query('begin')
    const r = await client.query(
      `select id, smm_order_id, sell_total_vnd, refunded_at
       from orders
       where id = $1 and user_id = $2
       limit 1
       for update`,
      [args.orderId, args.userId],
    )
    const row = r.rows[0] as any | undefined
    if (!row) return { status: 404, body: { error: 'ORDER_NOT_FOUND' } }
    if (!row.smm_order_id) return { status: 400, body: { error: 'MISSING_SMM_ORDER_ID' } }

    const data = (await smmRequest({
      key: smmApiKey(),
      action: 'status',
      order: String(row.smm_order_id),
    })) as any

    const statusText = pickSmmStatusFromUpstream(data)
    const isPartial = statusText && statusText.trim().toLowerCase() === 'partial'
    const refundedAtExisting = row.refunded_at as string | null | undefined
    const nextStatusText = refundedAtExisting ? 'Refunded' : statusText

    await client.query(
      `update orders
       set smm_status = $1,
           smm_status_raw = $2,
           smm_status_updated_at = now()
       where id = $3 and user_id = $4`,
      [nextStatusText, JSON.stringify(data), row.id, args.userId],
    )

    await upsertOrderStatusHistory(client, {
      orderId: row.id,
      smmOrderId: String(row.smm_order_id),
      statusText: nextStatusText,
      raw: data,
      actor: 'user',
    })

    if (isPartial) {
      const sellTotalVnd = Number(row.sell_total_vnd ?? 0) || 0
      if (!refundedAtExisting && sellTotalVnd > 0) {
        await client.query('update users set balance_vnd = balance_vnd + $1 where id = $2', [sellTotalVnd, args.userId])
        await client.query(
          `update orders
           set refunded_vnd = $1,
               refunded_at = now()
           where id = $2 and user_id = $3`,
          [sellTotalVnd, row.id, args.userId],
        )
        await client.query(
          `update orders
           set smm_status = 'Refunded'
           where id = $1 and user_id = $2`,
          [row.id, args.userId],
        )
        await upsertOrderStatusHistory(client, {
          orderId: row.id,
          smmOrderId: String(row.smm_order_id),
          statusText: 'Refunded',
          raw: { reason: 'partial_refund', upstream: data },
          actor: 'system',
        })
      }
    }

    await client.query('commit')
    const finalStatus = isPartial && !refundedAtExisting ? 'Refunded' : refundedAtExisting ? 'Refunded' : statusText
    return {
      status: 200,
      body: { ok: true, orderId: row.id, smmOrderId: String(row.smm_order_id), smmStatus: finalStatus, raw: data },
    }
  } catch (e) {
    await client.query('rollback').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

export async function handlePlace(args: {
  userId: string
  userEmail: string
  service: string | number
  link: string
  quantity: number
  comments?: string
}) {
  const client = await getPool().connect()
  try {
    const serviceId = String(args.service)
    const qty = args.quantity
    const link = args.link

    const info = await getPanelRateVndPer1k(serviceId)
    if (!info) return { status: 404, body: { error: 'SERVICE_NOT_FOUND' } }

    const sellTotalVnd = computeSellTotalVnd(info.rate, qty)

    await client.query('begin')
    const balRes = await client.query('select balance_vnd from users where id = $1 for update', [args.userId])
    const balRow = balRes.rows[0] as { balance_vnd: string | number } | undefined
    if (!balRow) {
      await client.query('rollback')
      return { status: 404, body: { error: 'USER_NOT_FOUND' } }
    }
    const balanceVnd = Number(balRow.balance_vnd)
    if (!Number.isFinite(balanceVnd) || balanceVnd < sellTotalVnd) {
      await client.query('rollback')
      return { status: 402, body: { error: 'INSUFFICIENT_FUNDS', balanceVnd, requiredVnd: sellTotalVnd } }
    }

    const orderId = crypto.randomUUID()
    const params: Record<string, string> = {
      key: smmApiKey(),
      action: 'add',
      service: serviceId,
      link,
      quantity: String(qty),
    }
    if (args.comments) params.comments = args.comments

    let upstream: any = null
    let smmOrderId: string | null = null
    let status: string = 'created'
    let errorCode: string | null = null
    let errorDetail: string | null = null

    try {
      upstream = (await smmRequest(params)) as any
      smmOrderId = upstream && typeof upstream === 'object' && 'order' in upstream ? String((upstream as any).order) : null
      status = smmOrderId ? 'running' : 'created'
    } catch (e: any) {
      status = 'rejected'
      errorDetail = String(e?.message || 'SMM_FAILED')
      errorCode = String(errorDetail).startsWith('SMM_ERROR:') ? 'SMM_ERROR' : 'SMM_FAILED'
    }

    const initialSmmStatus = smmOrderId ? 'running' : 'Pending'

    await client.query(
      `insert into orders
        (id, user_id, smm_service_id, link, quantity, panel_rate_vnd_per_1k, markup_multiplier, sell_total_vnd, smm_order_id, smm_status, error_code, error_detail)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        orderId,
        args.userId,
        serviceId,
        link,
        qty,
        info.rate,
        MARKUP_MULTIPLIER,
        sellTotalVnd,
        smmOrderId,
        initialSmmStatus,
        errorCode,
        errorDetail,
      ],
    )

    let newBal = balanceVnd
    let chargedVnd = 0
    if (status !== 'rejected') {
      chargedVnd = sellTotalVnd
      newBal = balanceVnd - sellTotalVnd
      await client.query('update users set balance_vnd = $1 where id = $2', [newBal, args.userId])
    }

    await client.query('commit')

    if (status === 'rejected') {
      return {
        status: 400,
        body: { ok: false, orderId, error: 'SMM_REJECTED', detail: errorDetail, chargedVnd, balanceVnd: newBal },
      }
    }

    return { status: 200, body: { ok: true, orderId, smm: upstream, chargedVnd, balanceVnd: newBal } }
  } catch (e) {
    await client.query('rollback').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

export async function handleFreeLike(args: { userId: string; platform: string; link: string }) {
  const SERVICE_BY_PLATFORM: Record<string, string> = {
    Facebook: '4122',
    TikTok: '4876',
    YouTube: '4874',
    Telegram: '4430',
    // Instagram service id not provided; allow overriding by env.
    Instagram: String(process.env.FREE_LIKE_INSTAGRAM_SERVICE_ID || ''),
  }

  const serviceId = String(SERVICE_BY_PLATFORM[args.platform] || '').trim()
  if (!serviceId) return { status: 400, body: { error: 'SERVICE_NOT_CONFIGURED' } }

  const info = await getPanelRateVndPer1k(serviceId)
  if (!info) return { status: 404, body: { error: 'SERVICE_NOT_FOUND' } }

  const qty = Math.max(1, Math.trunc(Number(info.min) || 1))
  const link = args.link.trim()

  const client = await getPool().connect()
  try {
    const id = crypto.randomUUID()
    await client.query('begin')

    let upstream: any = null
    let smmOrderId: string | null = null
    let errorCode: string | null = null
    let errorDetail: string | null = null
    let smmStatus: string | null = 'Pending'

    try {
      upstream = (await smmRequest({
        key: smmApiKey(),
        action: 'add',
        service: serviceId,
        link,
        quantity: String(qty),
      })) as any
      smmOrderId = upstream && typeof upstream === 'object' && 'order' in upstream ? String((upstream as any).order) : null
      smmStatus = smmOrderId ? 'running' : 'Pending'
    } catch (e: any) {
      errorDetail = String(e?.message || 'SMM_FAILED')
      errorCode = String(errorDetail).startsWith('SMM_ERROR:') ? 'SMM_ERROR' : 'SMM_FAILED'
      smmStatus = 'rejected'
    }

    await client.query(
      `insert into free_like_orders
        (id, user_id, platform, smm_service_id, link, quantity, smm_order_id, smm_status, smm_status_raw, error_code, error_detail)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        id,
        args.userId,
        args.platform,
        serviceId,
        link,
        qty,
        smmOrderId,
        smmStatus,
        upstream ? JSON.stringify(upstream) : null,
        errorCode,
        errorDetail,
      ],
    )

    await client.query('commit')

    if (smmStatus === 'rejected') {
      return { status: 400, body: { ok: false, error: 'SMM_REJECTED', detail: errorDetail } }
    }

    return {
      status: 200,
      body: {
        ok: true,
        free: true,
        orderId: id,
        platform: args.platform,
        serviceId,
        quantity: qty,
        smmOrderId,
        smmStatus,
      },
    }
  } catch (e) {
    await client.query('rollback').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

