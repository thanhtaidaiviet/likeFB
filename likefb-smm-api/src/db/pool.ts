import pg from 'pg'

const { Pool } = pg

let _pool: pg.Pool | null = null

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
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('CONFIG_ERROR: DATABASE_URL is missing')
  }
  const ssl = shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : undefined
  _pool = new Pool({ connectionString, ssl })
  return _pool
}

