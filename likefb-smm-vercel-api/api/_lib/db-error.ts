export type DbErrorHint = {
  kind: 'pg' | 'network' | 'timeout' | 'config' | 'unknown'
  code?: string
  message?: string
}

function safeMessage(msg: unknown) {
  if (typeof msg !== 'string') return undefined
  // Don't accidentally leak connection strings or secrets.
  if (msg.includes('postgres://') || msg.includes('postgresql://')) return 'redacted'
  return msg.slice(0, 180)
}

export function describeDbError(err: any): DbErrorHint {
  const message = safeMessage(err?.message)
  const code = typeof err?.code === 'string' ? err.code : undefined

  // Common Postgres error codes:
  // - 42P01: undefined_table (migration not run)
  // - 28P01: invalid_password
  // - 3D000: invalid_catalog_name (db does not exist)
  // - 57P01/57P02: admin_shutdown/crash_shutdown
  if (code) return { kind: 'pg', code, message }

  const sysCode =
    typeof err?.errno === 'string' ? err.errno : typeof err?.code === 'string' ? err.code : undefined
  if (sysCode && /ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT/i.test(sysCode)) {
    return { kind: 'network', code: sysCode, message }
  }

  if (typeof message === 'string' && /timeout/i.test(message)) return { kind: 'timeout', message }
  if (typeof message === 'string' && message.startsWith('CONFIG_ERROR:')) return { kind: 'config', message }

  return { kind: 'unknown', message }
}

export function toServerError(err: any): { status: number; body: Record<string, unknown> } {
  const hint = describeDbError(err)
  const status =
    hint.kind === 'config' || hint.kind === 'network' || hint.kind === 'timeout'
      ? 503
      : hint.kind === 'pg' && hint.code === '42P01'
        ? 503
        : 500
  const detail =
    hint.kind === 'pg' && hint.code === '42P01'
      ? 'DB is missing table(s). Run migrations (likefb-smm-api/src/db/migrate.ts) against DATABASE_URL.'
      : hint.message || null
  return { status, body: { error: 'SERVER_ERROR', detail, hint } }
}

