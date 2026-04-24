import pg from 'pg'

const { Pool } = pg

let _pool: pg.Pool | null = null

function pickConnectionString(): string | null {
  const candidates = [
    process.env.DATABASE_URL,
    // Vercel Postgres integration (common variants)
    process.env.POSTGRES_URL,
    process.env.POSTGRES_PRISMA_URL,
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.POSTGRES_URL_NO_SSL,
    // Supabase (sometimes used)
    process.env.SUPABASE_DATABASE_URL,
  ]
  for (const v of candidates) {
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

function shouldUseSsl(connectionString: string) {
  // Vercel env is sometimes missing DATABASE_SSL; Supabase pooler requires TLS.
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

  const connectionString = pickConnectionString()
  if (!connectionString) {
    throw new Error(
      'CONFIG_ERROR: missing database connection string (set DATABASE_URL or Vercel Postgres POSTGRES_URL)',
    )
  }

  const ssl = shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : undefined
  _pool = new Pool({ connectionString, ssl })
  return _pool
}

