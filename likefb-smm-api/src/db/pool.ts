import pg from 'pg'

const { Pool } = pg

let _pool: pg.Pool | null = null

/** Supabase pooler (6543) cần pgbouncer=true để tránh lỗi prepared statement với node-pg. */
function normalizeConnectionString(connectionString: string) {
  try {
    const u = new URL(connectionString)
    const host = u.hostname.toLowerCase()
    const port = u.port || '5432'
    if (host.includes('pooler.supabase.com') && port === '6543' && !u.searchParams.has('pgbouncer')) {
      u.searchParams.set('pgbouncer', 'true')
    }
    return u.toString()
  } catch {
    return connectionString
  }
}

function shouldUseSsl(connectionString: string) {
  if (process.env.DATABASE_SSL === 'true') return true
  if (process.env.DATABASE_SSL === 'false') return false
  try {
    const url = new URL(connectionString)
    const sslmode = url.searchParams.get('sslmode')
    if (sslmode && sslmode !== 'disable') return true
    if (url.hostname.endsWith('.supabase.com') || url.hostname.includes('supabase')) return true
  } catch {
    // ignore
  }
  return false
}

export function getPool() {
  if (_pool) return _pool
  const raw = process.env.DATABASE_URL
  if (!raw) {
    throw new Error('CONFIG_ERROR: DATABASE_URL is missing')
  }
  const connectionString = normalizeConnectionString(raw.trim())
  const ssl = shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : undefined
  _pool = new Pool({ connectionString, ssl })
  return _pool
}

