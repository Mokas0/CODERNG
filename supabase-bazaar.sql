-- Bazaar + Auth. Run after supabase-schema.sql and supabase-casino.sql.
-- In Supabase Dashboard: enable Email auth (Authentication → Providers).
-- Add bazaar_listings to Realtime (Database → Replication).

-- Profiles: one per auth user (display name, optional linked Casino username)
-- Idempotent: safe to run multiple times (drop policy before create policy)
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
  -- Block import if the aura is currently staked in an active itemflip challenge
  if exists (
    select 1 from itemflip_challenges
    where (creator_aura_id = p_aura_id or acceptor_aura_id = p_aura_id)
      and status in ('open', 'matched')
  ) then
    return query select false, 'Aura is currently staked in an active challenge. Cancel or wait for it to settle first.'::text;
    return;
  end if;
  delete from casino_aura_inventory where id = p_aura_id and username = v_username;
  insert into bazaar_seller_inventory (user_id, item_json) values (auth.uid(), v_json);
  return query select true, ''::text;
end;
$$;

-- RPC: import all importable auras from Casino vault into Bazaar (skips those staked in itemflip)
create or replace function public.bazaar_import_all_from_casino()
returns table(success boolean, imported_count int, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_row record;
  v_count int := 0;
begin
  if auth.uid() is null then
    return query select false, 0, 'Not signed in'::text;
    return;
  end if;
  select casino_username into v_username from profiles where id = auth.uid();
  if v_username is null or trim(v_username) = '' then
    return query select false, 0, 'Link your Casino vault first'::text;
    return;
  end if;
  for v_row in
    select c.id, c.item_json
    from casino_aura_inventory c
    where c.username = v_username
      and not exists (
        select 1 from itemflip_challenges i
        where (i.creator_aura_id = c.id or i.acceptor_aura_id = c.id)
          and i.status in ('open', 'matched')
      )
  loop
    delete from casino_aura_inventory where id = v_row.id and username = v_username;
    insert into bazaar_seller_inventory (user_id, item_json) values (auth.uid(), v_row.item_json);
    v_count := v_count + 1;
  end loop;
  return query select true, v_count, ''::text;
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

-- ─── Bazaar Business Investments ───
create table if not exists public.bazaar_business_investments (
  id bigint generated always as identity primary key,
  investor_id uuid not null references auth.users(id) on delete cascade,
  business_owner_id uuid not null references auth.users(id) on delete cascade,
  amount int not null check (amount >= 0),
  created_at timestamptz default now(),
  unique(investor_id, business_owner_id)
);

alter table public.bazaar_business_investments enable row level security;
drop policy if exists "Bazaar investments own" on public.bazaar_business_investments;
create policy "Bazaar investments own" on public.bazaar_business_investments for all using (auth.uid() = investor_id);

create table if not exists public.bazaar_business_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_invested int not null default 0,
  investor_count int not null default 0,
  sales_count int not null default 0,
  updated_at timestamptz default now()
);

alter table public.bazaar_business_stats enable row level security;
drop policy if exists "Bazaar business stats read" on public.bazaar_business_stats;
create policy "Bazaar business stats read" on public.bazaar_business_stats for select using (true);

-- RPC: invest in another player's business
create or replace function public.bazaar_invest_in_business(p_owner_id uuid, p_amount int)
returns table(success boolean, message text)
language plpgsql security definer set search_path = public as $$
declare
  v_bal int;
  v_cur int;
begin
  if auth.uid() is null then
    return query select false, 'Not signed in'::text;
    return;
  end if;
  if p_owner_id = auth.uid() then
    return query select false, 'Cannot invest in yourself'::text;
    return;
  end if;
  if p_amount is null or p_amount <= 0 then
    return query select false, 'Invalid amount'::text;
    return;
  end if;
  select coalesce(coins_balance, 0) into v_bal from bazaar_wallets where user_id = auth.uid();
  if v_bal < p_amount then
    return query select false, 'Not enough Bazaar balance'::text;
    return;
  end if;
  update bazaar_wallets set coins_balance = coins_balance - p_amount, updated_at = now()
  where user_id = auth.uid();
  insert into bazaar_business_investments (investor_id, business_owner_id, amount)
  values (auth.uid(), p_owner_id, p_amount)
  on conflict (investor_id, business_owner_id) do update set amount = bazaar_business_investments.amount + p_amount;
  insert into bazaar_business_stats (user_id, total_invested, investor_count, sales_count)
  values (p_owner_id,
    (select coalesce(sum(amount), 0) from bazaar_business_investments where business_owner_id = p_owner_id),
    (select count(distinct investor_id) from bazaar_business_investments where business_owner_id = p_owner_id),
    coalesce((select sales_count from bazaar_business_stats where user_id = p_owner_id), 0))
  on conflict (user_id) do update set
    total_invested = (select coalesce(sum(amount), 0) from bazaar_business_investments where business_owner_id = p_owner_id),
    investor_count = (select count(distinct investor_id) from bazaar_business_investments where business_owner_id = p_owner_id),
    updated_at = now();
  return query select true, ''::text;
end;
$$;

-- RPC: divest from a business
create or replace function public.bazaar_divest_from_business(p_owner_id uuid, p_amount int)
returns table(success boolean, message text)
language plpgsql security definer set search_path = public as $$
declare
  v_cur int;
begin
  if auth.uid() is null then
    return query select false, 'Not signed in'::text;
    return;
  end if;
  if p_amount is null or p_amount <= 0 then
    return query select false, 'Invalid amount'::text;
    return;
  end if;
  select amount into v_cur from bazaar_business_investments
  where investor_id = auth.uid() and business_owner_id = p_owner_id;
  v_cur := coalesce(v_cur, 0);
  if v_cur < p_amount then
    return query select false, 'Not enough invested'::text;
    return;
  end if;
  update bazaar_business_investments set amount = amount - p_amount
  where investor_id = auth.uid() and business_owner_id = p_owner_id;
  delete from bazaar_business_investments
  where investor_id = auth.uid() and business_owner_id = p_owner_id and amount <= 0;
  update bazaar_wallets set coins_balance = coins_balance + p_amount, updated_at = now()
  where user_id = auth.uid();
  insert into bazaar_wallets (user_id, coins_balance)
  values (auth.uid(), p_amount)
  on conflict (user_id) do update set coins_balance = bazaar_wallets.coins_balance + p_amount, updated_at = now();
  update bazaar_business_stats set
    total_invested = (select coalesce(sum(amount), 0) from bazaar_business_investments where business_owner_id = p_owner_id),
    investor_count = (select count(distinct investor_id) from bazaar_business_investments where business_owner_id = p_owner_id),
    updated_at = now()
  where user_id = p_owner_id;
  return query select true, ''::text;
end;
$$;

grant execute on function public.bazaar_invest_in_business(uuid, int) to authenticated;
grant execute on function public.bazaar_divest_from_business(uuid, int) to authenticated;

-- ─── Bazaar Volume Stats (for BZX stock price) ───
create table if not exists public.bazaar_volume_stats (
  id int primary key default 1 check (id = 1),
  period_start timestamptz not null default now(),
  sales_count int not null default 0,
  volume_coins int not null default 0
);

alter table public.bazaar_volume_stats enable row level security;
drop policy if exists "Bazaar volume stats read" on public.bazaar_volume_stats;
create policy "Bazaar volume stats read" on public.bazaar_volume_stats for select using (true);

insert into public.bazaar_volume_stats (id, period_start, sales_count, volume_coins)
values (1, now(), 0, 0) on conflict (id) do nothing;

-- ─── Bazaar Stock Ticker (BZX) ───
create table if not exists public.bazaar_stock_ticker (
  symbol text primary key,
  price numeric not null default 100,
  shares_outstanding int not null default 0,
  updated_at timestamptz default now()
);

alter table public.bazaar_stock_ticker enable row level security;
drop policy if exists "Bazaar ticker read" on public.bazaar_stock_ticker;
drop policy if exists "Bazaar ticker rpc" on public.bazaar_stock_ticker;
create policy "Bazaar ticker read" on public.bazaar_stock_ticker for select using (true);
create policy "Bazaar ticker rpc" on public.bazaar_stock_ticker for all using (true);

insert into public.bazaar_stock_ticker (symbol, price, shares_outstanding)
values ('BZX', 100, 0) on conflict (symbol) do nothing;

-- ─── Bazaar Stock Holdings ───
create table if not exists public.bazaar_stock_holdings (
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null references public.bazaar_stock_ticker(symbol),
  shares int not null default 0 check (shares >= 0),
  avg_buy_price numeric,
  primary key (user_id, symbol)
);

alter table public.bazaar_stock_holdings enable row level security;
drop policy if exists "Bazaar holdings own" on public.bazaar_stock_holdings;
create policy "Bazaar holdings own" on public.bazaar_stock_holdings for all using (auth.uid() = user_id);

-- Trigger: update volume stats and business sales when a listing is sold
create or replace function public.bazaar_on_listing_sold()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'sold' and (old.status is null or old.status != 'sold') then
    insert into bazaar_business_stats (user_id, total_invested, investor_count, sales_count)
    values (new.seller_id, 0, 0, 1)
    on conflict (user_id) do update set sales_count = bazaar_business_stats.sales_count + 1, updated_at = now();
    update bazaar_volume_stats set
      period_start = case when period_start < now() - interval '24 hours' then now() else period_start end,
      sales_count = case when period_start < now() - interval '24 hours' then 1 else sales_count + 1 end,
      volume_coins = case when period_start < now() - interval '24 hours' then new.price else volume_coins + new.price end
    where id = 1;
    perform public.bazaar_stock_update_price('BZX');
  end if;
  return new;
end;
$$;

drop trigger if exists bazaar_listing_sold_trigger on public.bazaar_listings;
create trigger bazaar_listing_sold_trigger
  after update on public.bazaar_listings
  for each row execute function public.bazaar_on_listing_sold();

-- RPC: get BZX price and 24h stats
create or replace function public.bazaar_stock_get_price(p_symbol text default 'BZX')
returns table(price numeric, sales_24h int, volume_24h int)
language plpgsql security definer set search_path = public as $$
declare
  v_row record;
  v_stats record;
begin
  select t.price into v_row from bazaar_stock_ticker t where t.symbol = p_symbol;
  if v_row.price is null then
    return;
  end if;
  select coalesce(sales_count, 0), coalesce(volume_coins, 0) into v_stats
  from bazaar_volume_stats where id = 1;
  return query select v_row.price, coalesce(v_stats.sales_count, 0)::int, coalesce(v_stats.volume_coins, 0)::int;
end;
$$;

-- RPC: update ticker price from volume stats with realistic volatility
-- Fundamental value from activity; random walk + mean reversion for lifelike behavior
create or replace function public.bazaar_stock_update_price(p_symbol text default 'BZX')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_sales int;
  v_volume int;
  v_fundamental numeric;
  v_old_price numeric;
  v_random_drift numeric;   -- ±3% random volatility per tick
  v_new_price numeric;
begin
  select coalesce(sales_count, 0), coalesce(volume_coins, 0) into v_sales, v_volume
  from bazaar_volume_stats where id = 1;
  v_fundamental := 100 + (v_sales * 2) + (v_volume / 10000.0);
  v_fundamental := greatest(50, least(5000, v_fundamental));
  select coalesce(price, 100) into v_old_price from bazaar_stock_ticker where symbol = p_symbol;
  -- Random walk: ±3% volatility per update (like real market noise)
  v_random_drift := (random() - 0.5) * 0.06;
  -- 80% momentum (old price + random shock), 20% mean reversion toward fundamental
  v_new_price := v_old_price * (1 + v_random_drift) * 0.8 + v_fundamental * 0.2;
  v_new_price := greatest(10, least(10000, round(v_new_price, 2)));
  update bazaar_stock_ticker set price = v_new_price, updated_at = now() where symbol = p_symbol;
end;
$$;

-- RPC: buy BZX shares
create or replace function public.bazaar_stock_buy(p_symbol text default 'BZX', p_shares int default 1)
returns table(success boolean, message text)
language plpgsql security definer set search_path = public as $$
declare
  v_price numeric;
  v_cost numeric;
  v_bal int;
  v_cur_shares int;
  v_cur_avg numeric;
  v_new_avg numeric;
begin
  if auth.uid() is null then
    return query select false, 'Not signed in'::text;
    return;
  end if;
  if p_shares is null or p_shares <= 0 then
    return query select false, 'Invalid shares'::text;
    return;
  end if;
  select price into v_price from bazaar_stock_ticker where symbol = p_symbol;
  if v_price is null then
    return query select false, 'Unknown ticker'::text;
    return;
  end if;
  v_cost := v_price * p_shares;
  select coalesce(coins_balance, 0) into v_bal from bazaar_wallets where user_id = auth.uid();
  if v_bal < v_cost then
    return query select false, 'Not enough Bazaar balance'::text;
    return;
  end if;
  update bazaar_wallets set coins_balance = coins_balance - v_cost, updated_at = now()
  where user_id = auth.uid();
  -- Market impact: buying pushes price up slightly (realistic)
  update bazaar_stock_ticker set price = least(10000, round(price * (1 + 0.002 * least(p_shares, 50)), 2)), updated_at = now()
  where symbol = p_symbol;
  select coalesce(shares, 0), avg_buy_price into v_cur_shares, v_cur_avg
  from bazaar_stock_holdings where user_id = auth.uid() and symbol = p_symbol;
  v_cur_shares := coalesce(v_cur_shares, 0);
  v_new_avg := case
    when v_cur_shares = 0 then v_price
    else ((v_cur_avg * v_cur_shares) + (v_price * p_shares)) / (v_cur_shares + p_shares)
  end;
  insert into bazaar_stock_holdings (user_id, symbol, shares, avg_buy_price)
  values (auth.uid(), p_symbol, p_shares, v_price)
  on conflict (user_id, symbol) do update set
    shares = bazaar_stock_holdings.shares + p_shares,
    avg_buy_price = v_new_avg;
  update bazaar_stock_ticker set shares_outstanding = shares_outstanding + p_shares, updated_at = now()
  where symbol = p_symbol;
  return query select true, ''::text;
end;
$$;

-- RPC: sell BZX shares
create or replace function public.bazaar_stock_sell(p_symbol text default 'BZX', p_shares int default 1)
returns table(success boolean, message text)
language plpgsql security definer set search_path = public as $$
declare
  v_price numeric;
  v_proceeds numeric;
  v_cur_shares int;
begin
  if auth.uid() is null then
    return query select false, 'Not signed in'::text;
    return;
  end if;
  if p_shares is null or p_shares <= 0 then
    return query select false, 'Invalid shares'::text;
    return;
  end if;
  select price into v_price from bazaar_stock_ticker where symbol = p_symbol;
  if v_price is null then
    return query select false, 'Unknown ticker'::text;
    return;
  end if;
  select shares into v_cur_shares from bazaar_stock_holdings where user_id = auth.uid() and symbol = p_symbol;
  v_cur_shares := coalesce(v_cur_shares, 0);
  if v_cur_shares < p_shares then
    return query select false, 'Not enough shares'::text;
    return;
  end if;
  v_proceeds := v_price * p_shares;
  insert into bazaar_wallets (user_id, coins_balance)
  values (auth.uid(), v_proceeds)
  on conflict (user_id) do update set coins_balance = bazaar_wallets.coins_balance + v_proceeds, updated_at = now();
  -- Market impact: selling pushes price down slightly (realistic)
  update bazaar_stock_ticker set price = greatest(10, round(price * (1 - 0.002 * least(p_shares, 50)), 2)), updated_at = now()
  where symbol = p_symbol;
  update bazaar_stock_holdings set shares = shares - p_shares
  where user_id = auth.uid() and symbol = p_symbol;
  delete from bazaar_stock_holdings where user_id = auth.uid() and symbol = p_symbol and shares <= 0;
  update bazaar_stock_ticker set shares_outstanding = greatest(0, shares_outstanding - p_shares), updated_at = now()
  where symbol = p_symbol;
  return query select true, ''::text;
end;
$$;

grant execute on function public.bazaar_stock_get_price(text) to anon;
grant execute on function public.bazaar_stock_get_price(text) to authenticated;
grant execute on function public.bazaar_stock_update_price(text) to authenticated;
grant execute on function public.bazaar_stock_buy(text, int) to authenticated;
grant execute on function public.bazaar_stock_sell(text, int) to authenticated;

grant execute on function public.generate_casino_link_code(text) to anon;
grant execute on function public.generate_casino_link_code(text) to authenticated;
grant execute on function public.link_casino_to_account(text, text) to authenticated;
grant execute on function public.bazaar_deposit_coins(int) to authenticated;
grant execute on function public.bazaar_withdraw_coins(int) to authenticated;
grant execute on function public.bazaar_import_aura_from_casino(bigint) to authenticated;
grant execute on function public.bazaar_import_all_from_casino() to authenticated;
grant execute on function public.bazaar_create_listing(bigint, int) to authenticated;
grant execute on function public.bazaar_buy_listing(bigint) to authenticated;
grant execute on function public.bazaar_cancel_listing(bigint) to authenticated;
grant execute on function public.bazaar_withdraw_aura_to_casino(bigint) to authenticated;
