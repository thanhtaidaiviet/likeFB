import 'dotenv/config'
import { pool } from './pool.js'

const SQL = `
create table if not exists users (
  id uuid primary key,
  email text not null unique,
  password_hash text,
  google_sub text,
  created_at timestamptz not null default now()
);

alter table users add column if not exists google_sub text;

-- Ensure password_hash can be null for Google accounts.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'users'
      and column_name = 'password_hash'
      and is_nullable = 'NO'
  ) then
    alter table users alter column password_hash drop not null;
  end if;
end $$;

create unique index if not exists users_google_sub_unique on users(google_sub) where google_sub is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_has_auth_method'
  ) then
    alter table users
      add constraint users_has_auth_method check (
        (password_hash is not null) or (google_sub is not null)
      );
  end if;
end $$;
`

async function main() {
  await pool.query(SQL)
  await pool.end()
  console.log('migrate: OK')
}

main().catch(async (err) => {
  console.error('migrate: FAILED', err)
  await pool.end().catch(() => {})
  process.exit(1)
})

