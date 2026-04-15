import pg from 'pg'

const { Pool } = pg

function shouldUseSsl(connectionString: string) {
  if (process.env.DATABASE_SSL === 'true') return true
  try {
    const url = new URL(connectionString)
    const sslmode = url.searchParams.get('sslmode')
    if (sslmode && sslmode !== 'disable') return true
  } catch {
    // ignore
  }
  return false
}

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('CONFIG_ERROR: DATABASE_URL is missing')
}

const ssl = shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : undefined

export const pool = new Pool({ connectionString, ssl })

