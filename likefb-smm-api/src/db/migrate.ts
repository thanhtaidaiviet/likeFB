import '../load-env.js'
import { getPool } from './pool.js'

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
  smm_status text default 'Pending',
  smm_status_raw jsonb,
  smm_status_updated_at timestamptz,
  refunded_vnd bigint not null default 0,
  refunded_at timestamptz,
  error_code text,
  error_detail text,
  created_at timestamptz not null default now()
);

alter table orders drop column if exists status;
alter table orders add column if not exists smm_status text;
alter table orders add column if not exists smm_status_raw jsonb;
alter table orders add column if not exists smm_status_updated_at timestamptz;
alter table orders alter column smm_status set default 'Pending';
alter table orders add column if not exists refunded_vnd bigint not null default 0;
alter table orders add column if not exists refunded_at timestamptz;
alter table orders add column if not exists error_code text;
alter table orders add column if not exists error_detail text;

create index if not exists orders_user_id_created_at_idx on orders(user_id, created_at desc);

create table if not exists free_like_orders (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  platform text not null,
  smm_service_id text not null,
  link text not null,
  quantity integer not null,
  smm_order_id text,
  smm_status text default 'Pending',
  smm_status_raw jsonb,
  smm_status_updated_at timestamptz,
  error_code text,
  error_detail text,
  created_at timestamptz not null default now()
);

alter table free_like_orders add column if not exists smm_order_id text;
alter table free_like_orders add column if not exists smm_status text;
alter table free_like_orders add column if not exists smm_status_raw jsonb;
alter table free_like_orders add column if not exists smm_status_updated_at timestamptz;
alter table free_like_orders alter column smm_status set default 'Pending';
alter table free_like_orders add column if not exists error_code text;
alter table free_like_orders add column if not exists error_detail text;

create index if not exists free_like_orders_user_id_created_at_idx on free_like_orders(user_id, created_at desc);
`

async function main() {
  const pool = getPool()
  await pool.query(SQL)
  await pool.end()
  console.log('migrate: OK')
}

main().catch(async (err) => {
  console.error('migrate: FAILED', err)
  try {
    const pool = getPool()
    await pool.end().catch(() => {})
  } catch {
    // ignore
  }
  process.exit(1)
})

