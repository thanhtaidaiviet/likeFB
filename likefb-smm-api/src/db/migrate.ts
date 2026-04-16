import 'dotenv/config'
import { pool } from './pool.js'

const SQL = `
create table if not exists users (
  id uuid primary key,
  email text not null unique,
  password_hash text,
  google_sub text,
  balance_vnd bigint not null default 0,
  created_at timestamptz not null default now()
);

alter table users add column if not exists google_sub text;
alter table users add column if not exists balance_vnd bigint not null default 0;

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

create table if not exists orders (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  smm_service_id text not null,
  link text not null,
  quantity integer not null,
  panel_rate_vnd_per_1k numeric not null,
  markup_multiplier numeric not null,
  sell_total_vnd bigint not null,
  smm_order_id text,
  status text not null default 'created',
  created_at timestamptz not null default now()
);

create index if not exists orders_user_id_created_at_idx on orders(user_id, created_at desc);
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

