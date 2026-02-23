-- Bazaar + Auth. Run after supabase-schema.sql and supabase-casino.sql.
-- In Supabase Dashboard: enable Email auth (Authentication → Providers).
-- Add bazaar_listings to Realtime (Database → Replication).

-- Profiles: one per auth user (display name, optional linked Casino username)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  casino_username text unique,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Profiles read all" on public.profiles;
drop policy if exists "Profiles insert own" on public.profiles;
drop policy if exists "Profiles update own" on public.profiles;
create policy "Profiles read all" on public.profiles for select using (true);
create policy "Profiles insert own" on public.profiles for insert with check (auth.uid() = id);
create policy "Profiles update own" on public.profiles for update using (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(split_part(new.email, '@', 1), new.id::text));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Casino link codes: one-time code to link a Casino username to an auth account
create table if not exists public.casino_link_codes (
  username text primary key,
  code text not null,
  expires_at timestamptz not null
);

-- casino_link_codes holds only short-lived 6-digit codes (no sensitive data).
-- Both RPCs that touch it are security definer and handle all access control in code.
alter table public.casino_link_codes disable row level security;

-- Bazaar wallet: coins per user (deposit from game, withdraw to game)
create table if not exists public.bazaar_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  coins_balance int not null default 0 check (coins_balance >= 0),
  updated_at timestamptz default now()
);

alter table public.bazaar_wallets enable row level security;

drop policy if exists "Bazaar wallets own" on public.bazaar_wallets;
create policy "Bazaar wallets own" on public.bazaar_wallets for all using (auth.uid() = user_id);

-- Bazaar seller inventory: auras in Bazaar but not listed (can list or withdraw to Casino)
create table if not exists public.bazaar_seller_inventory (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_json jsonb not null,
  created_at timestamptz default now()
);

alter table public.bazaar_seller_inventory enable row level security;

drop policy if exists "Bazaar inventory own" on public.bazaar_seller_inventory;
drop policy if exists "Bazaar inventory rpc write" on public.bazaar_seller_inventory;
-- Users can read/delete their own rows directly
create policy "Bazaar inventory own" on public.bazaar_seller_inventory
  for all using (auth.uid() = user_id);
-- Security definer RPCs insert on behalf of any user (owner = postgres bypasses uid check)
create policy "Bazaar inventory rpc write" on public.bazaar_seller_inventory
  for insert with check (true);

-- Bazaar listings: auras for sale
create table if not exists public.bazaar_listings (
  id bigint generated always as identity primary key,
  seller_id uuid not null references auth.users(id) on delete cascade,
  item_json jsonb not null,
  price int not null check (price > 0),
  status text not null default 'listed' check (status in ('listed', 'sold')),
  created_at timestamptz default now()
);

alter table public.bazaar_listings enable row level security;

drop policy if exists "Bazaar listings read listed" on public.bazaar_listings;
drop policy if exists "Bazaar listings seller" on public.bazaar_listings;
create policy "Bazaar listings read listed" on public.bazaar_listings for select using (true);
create policy "Bazaar listings seller" on public.bazaar_listings for all using (auth.uid() = seller_id);

-- RPC: generate link code (anon can call)
create or replace function public.generate_casino_link_code(p_username text)
returns table(code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_expires timestamptz;
begin
  if p_username is null or trim(p_username) = '' then
    return;
  end if;
  v_code := lpad(floor(random() * 1000000)::text, 6, '0');
  v_expires := now() + interval '10 minutes';
  insert into casino_link_codes (username, code, expires_at)
  values (trim(p_username), v_code, v_expires)
  on conflict (username) do update set code = v_code, expires_at = v_expires;
  return query select v_code, v_expires;
end;
$$;

-- RPC: link Casino to account (authenticated)
-- Username: case-insensitive match. Code: pad to 6 digits so "12345" matches "012345".
create or replace function public.link_casino_to_account(p_username text, p_code text)
returns table(success boolean, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stored_username text;
  v_code_padded text;
begin
  if auth.uid() is null then
    return query select false, 'Not signed in'::text;
    return;
  end if;
  if p_username is null or trim(p_username) = '' or p_code is null or trim(p_code) = '' then
    return query select false, 'Username and code required'::text;
    return;
  end if;
  v_code_padded := lpad(trim(p_code), 6, '0');
  select c.username into v_stored_username
  from casino_link_codes c
  where lower(c.username) = lower(trim(p_username))
    and (c.code = trim(p_code) or (length(trim(p_code)) <= 6 and c.code = v_code_padded))
    and c.expires_at > now()
  limit 1;
  if v_stored_username is null then
    return query select false, 'Invalid or expired code'::text;
    return;
  end if;
  begin
    update profiles set casino_username = v_stored_username where id = auth.uid();
  exception when unique_violation then
    return query select false, 'That Casino username is already linked to another account'::text;
    return;
  end;
  delete from casino_link_codes where username = v_stored_username;
  return query select true, ''::text;
end;
$$;

-- RPC: deposit coins to Bazaar (client deducts from game)
create or replace function public.bazaar_deposit_coins(p_amount int)
returns table(success boolean, new_balance int, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_bal int;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return query select false, 0, 'Not signed in'::text;
    return;
  end if;
  if p_amount is null or p_amount <= 0 then
    return query select false, 0, 'Invalid amount'::text;
    return;
  end if;
  insert into bazaar_wallets (user_id, coins_balance)
  values (v_uid, p_amount)
  on conflict (user_id) do update set
    coins_balance = bazaar_wallets.coins_balance + p_amount,
    updated_at = now();
  select coins_balance into v_bal from bazaar_wallets where user_id = v_uid;
  return query select true, v_bal, ''::text;
end;
$$;

-- RPC: withdraw coins from Bazaar (client adds to game)
create or replace function public.bazaar_withdraw_coins(p_amount int)
returns table(success boolean, new_balance int, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_bal int;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return query select false, 0, 'Not signed in'::text;
    return;
  end if;
  if p_amount is null or p_amount <= 0 then
    return query select false, 0, 'Invalid amount'::text;
    return;
  end if;
  update bazaar_wallets
  set coins_balance = coins_balance - p_amount, updated_at = now()
  where user_id = v_uid and coins_balance >= p_amount;
  if not found then
    select coins_balance into v_bal from bazaar_wallets where user_id = v_uid;
    return query select false, coalesce(v_bal, 0), 'Not enough balance'::text;
    return;
  end if;
  select coins_balance into v_bal from bazaar_wallets where user_id = v_uid;
  return query select true, coalesce(v_bal, 0), ''::text;
end;
$$;

-- RPC: import aura from Casino vault into Bazaar inventory
create or replace function public.bazaar_import_aura_from_casino(p_aura_id bigint)
returns table(success boolean, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_json jsonb;
begin
  if auth.uid() is null then
    return query select false, 'Not signed in'::text;
    return;
  end if;
  if p_aura_id is null then
    return query select false, 'Invalid aura'::text;
    return;
  end if;
  select casino_username into v_username from profiles where id = auth.uid();
  if v_username is null or trim(v_username) = '' then
    return query select false, 'Link your Casino vault first'::text;
    return;
  end if;
  select item_json into v_json from casino_aura_inventory
  where id = p_aura_id and username = v_username;
  if not found then
    return query select false, 'Aura not found in your Casino vault'::text;
    return;
  end if;
  delete from casino_aura_inventory where id = p_aura_id and username = v_username;
  insert into bazaar_seller_inventory (user_id, item_json) values (auth.uid(), v_json);
  return query select true, ''::text;
end;
$$;

-- RPC: create listing from Bazaar inventory
create or replace function public.bazaar_create_listing(p_inventory_id bigint, p_price int)
returns table(success boolean, listing_id bigint, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_json jsonb;
  v_id bigint;
begin
  if auth.uid() is null then
    return query select false, null::bigint, 'Not signed in'::text;
    return;
  end if;
  if p_price is null or p_price <= 0 then
    return query select false, null::bigint, 'Invalid price'::text;
    return;
  end if;
  select item_json into v_json from bazaar_seller_inventory
  where id = p_inventory_id and user_id = auth.uid();
  if not found then
    return query select false, null::bigint, 'Item not in your inventory'::text;
    return;
  end if;
  delete from bazaar_seller_inventory where id = p_inventory_id and user_id = auth.uid();
  insert into bazaar_listings (seller_id, item_json, price, status)
  values (auth.uid(), v_json, p_price, 'listed')
  returning id into v_id;
  return query select true, v_id, ''::text;
end;
$$;

-- RPC: buy listing (concurrent-safe)
create or replace function public.bazaar_buy_listing(p_listing_id bigint)
returns table(success boolean, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing record;
  v_buyer_bal int;
begin
  if auth.uid() is null then
    return query select false, 'Not signed in'::text;
    return;
  end if;
  select seller_id, item_json, price into v_listing
  from bazaar_listings
  where id = p_listing_id and status = 'listed'
  for update;
  if not found then
    return query select false, 'Listing not found or already sold'::text;
    return;
  end if;
  if v_listing.seller_id = auth.uid() then
    return query select false, 'Cannot buy your own listing'::text;
    return;
  end if;
  select coins_balance into v_buyer_bal from bazaar_wallets where user_id = auth.uid();
  v_buyer_bal := coalesce(v_buyer_bal, 0);
  if v_buyer_bal < v_listing.price then
    return query select false, 'Not enough Bazaar balance'::text;
    return;
  end if;
  update bazaar_wallets set coins_balance = coins_balance - v_listing.price, updated_at = now()
  where user_id = auth.uid();
  insert into bazaar_wallets (user_id, coins_balance)
  values (v_listing.seller_id, v_listing.price)
  on conflict (user_id) do update set coins_balance = bazaar_wallets.coins_balance + v_listing.price, updated_at = now();
  update bazaar_listings set status = 'sold' where id = p_listing_id;
  insert into bazaar_seller_inventory (user_id, item_json) values (auth.uid(), v_listing.item_json);
  return query select true, ''::text;
end;
$$;

-- RPC: cancel listing (return aura to seller inventory)
create or replace function public.bazaar_cancel_listing(p_listing_id bigint)
returns table(success boolean, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_json jsonb;
begin
  if auth.uid() is null then
    return query select false, 'Not signed in'::text;
    return;
  end if;
  select item_json into v_json from bazaar_listings
  where id = p_listing_id and seller_id = auth.uid() and status = 'listed';
  if not found then
    return query select false, 'Listing not found or already sold'::text;
    return;
  end if;
  delete from bazaar_listings where id = p_listing_id and seller_id = auth.uid();
  insert into bazaar_seller_inventory (user_id, item_json) values (auth.uid(), v_json);
  return query select true, ''::text;
end;
$$;

-- RPC: withdraw aura from Bazaar inventory back to Casino vault
create or replace function public.bazaar_withdraw_aura_to_casino(p_inventory_id bigint)
returns table(success boolean, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_json jsonb;
begin
  if auth.uid() is null then
    return query select false, 'Not signed in'::text;
    return;
  end if;
  select casino_username into v_username from profiles where id = auth.uid();
  if v_username is null or trim(v_username) = '' then
    return query select false, 'Link your Casino vault first'::text;
    return;
  end if;
  select item_json into v_json from bazaar_seller_inventory
  where id = p_inventory_id and user_id = auth.uid();
  if not found then
    return query select false, 'Item not in your Bazaar inventory'::text;
    return;
  end if;
  delete from bazaar_seller_inventory where id = p_inventory_id and user_id = auth.uid();
  insert into casino_aura_inventory (username, item_json) values (v_username, v_json);
  return query select true, ''::text;
end;
$$;

grant execute on function public.generate_casino_link_code(text) to anon;
grant execute on function public.generate_casino_link_code(text) to authenticated;
grant execute on function public.link_casino_to_account(text, text) to authenticated;
grant execute on function public.bazaar_deposit_coins(int) to authenticated;
grant execute on function public.bazaar_withdraw_coins(int) to authenticated;
grant execute on function public.bazaar_import_aura_from_casino(bigint) to authenticated;
grant execute on function public.bazaar_create_listing(bigint, int) to authenticated;
grant execute on function public.bazaar_buy_listing(bigint) to authenticated;
grant execute on function public.bazaar_cancel_listing(bigint) to authenticated;
grant execute on function public.bazaar_withdraw_aura_to_casino(bigint) to authenticated;
