-- Casino: coinflip (coins) and itemflip (auras). Run in Supabase SQL Editor after supabase-schema.sql.
-- Then enable Realtime for: coinflip_challenges, itemflip_challenges (Database → Replication).

-- Wallets: casino coin balance per display name
create table if not exists public.casino_wallets (
  username text primary key,
  coins_balance int not null default 0 check (coins_balance >= 0),
  updated_at timestamptz default now()
);

-- Aura inventory: auras deposited for itemflip (stored as JSON: text, font, color, rarity, etc.)
create table if not exists public.casino_aura_inventory (
  id bigint generated always as identity primary key,
  username text not null,
  item_json jsonb not null,
  created_at timestamptz default now()
);

-- Coinflip: creator stakes amount on heads/tails; acceptor takes the other side; winner takes all
create table if not exists public.coinflip_challenges (
  id bigint generated always as identity primary key,
  creator_username text not null,
  creator_side text not null check (creator_side in ('heads', 'tails')),
  amount int not null check (amount > 0),
  status text not null default 'open' check (status in ('open', 'matched', 'settled')),
  acceptor_username text,
  result text check (result in ('heads', 'tails')),
  created_at timestamptz default now(),
  settled_at timestamptz
);

-- Itemflip: each player stakes one aura; winner gets both
create table if not exists public.itemflip_challenges (
  id bigint generated always as identity primary key,
  creator_username text not null,
  creator_aura_id bigint not null references public.casino_aura_inventory(id) on delete restrict,
  status text not null default 'open' check (status in ('open', 'matched', 'settled')),
  acceptor_username text,
  acceptor_aura_id bigint references public.casino_aura_inventory(id) on delete restrict,
  result_winner text,
  created_at timestamptz default now(),
  settled_at timestamptz
);

alter table public.casino_wallets enable row level security;
alter table public.casino_aura_inventory enable row level security;
alter table public.coinflip_challenges enable row level security;
alter table public.itemflip_challenges enable row level security;

drop policy if exists "Allow read casino_wallets" on public.casino_wallets;
drop policy if exists "Allow read casino_aura_inventory" on public.casino_aura_inventory;
drop policy if exists "Allow insert casino_aura_inventory" on public.casino_aura_inventory;
drop policy if exists "Allow update casino_aura_inventory" on public.casino_aura_inventory;
drop policy if exists "Allow delete casino_aura_inventory" on public.casino_aura_inventory;
drop policy if exists "Allow read coinflip_challenges" on public.coinflip_challenges;
drop policy if exists "Allow insert coinflip_challenges" on public.coinflip_challenges;
drop policy if exists "Allow update coinflip_challenges" on public.coinflip_challenges;
drop policy if exists "Allow read itemflip_challenges" on public.itemflip_challenges;
drop policy if exists "Allow insert itemflip_challenges" on public.itemflip_challenges;
drop policy if exists "Allow update itemflip_challenges" on public.itemflip_challenges;

create policy "Allow read casino_wallets" on public.casino_wallets for select using (true);
create policy "Allow read casino_aura_inventory" on public.casino_aura_inventory for select using (true);
create policy "Allow insert casino_aura_inventory" on public.casino_aura_inventory for insert with check (true);
create policy "Allow update casino_aura_inventory" on public.casino_aura_inventory for update using (true);
create policy "Allow delete casino_aura_inventory" on public.casino_aura_inventory for delete using (true);
create policy "Allow read coinflip_challenges" on public.coinflip_challenges for select using (true);
create policy "Allow insert coinflip_challenges" on public.coinflip_challenges for insert with check (true);
create policy "Allow update coinflip_challenges" on public.coinflip_challenges for update using (true);
create policy "Allow read itemflip_challenges" on public.itemflip_challenges for select using (true);
create policy "Allow insert itemflip_challenges" on public.itemflip_challenges for insert with check (true);
create policy "Allow update itemflip_challenges" on public.itemflip_challenges for update using (true);

-- Upsert wallet (used by deposit and by resolve)
create or replace function public.casino_upsert_wallet(p_username text, p_delta int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into casino_wallets (username, coins_balance)
  values (p_username, greatest(0, p_delta))
  on conflict (username) do update set
    coins_balance = greatest(0, casino_wallets.coins_balance + p_delta),
    updated_at = now();
end;
$$;

-- Deposit coins from game into casino (client deducts from localStorage; we add here)
create or replace function public.casino_deposit_coins(p_username text, p_amount int)
returns table(success boolean, new_balance int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance int;
begin
  if p_username is null or p_username = '' or p_amount is null or p_amount <= 0 then
    return query select false, 0;
    return;
  end if;
  insert into casino_wallets (username, coins_balance)
  values (p_username, p_amount)
  on conflict (username) do update set
    coins_balance = casino_wallets.coins_balance + p_amount,
    updated_at = now();
  select coins_balance into v_balance from casino_wallets where username = p_username;
  return query select true, v_balance;
end;
$$;

-- Withdraw coins from casino to game (we deduct; client adds to localStorage)
create or replace function public.casino_withdraw_coins(p_username text, p_amount int)
returns table(success boolean, new_balance int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance int;
begin
  if p_username is null or p_username = '' or p_amount is null or p_amount <= 0 then
    return query select false, 0;
    return;
  end if;
  update casino_wallets
  set coins_balance = coins_balance - p_amount, updated_at = now()
  where username = p_username and coins_balance >= p_amount;
  if not found then
    return query select false, (select coins_balance from casino_wallets where username = p_username);
    return;
  end if;
  select coins_balance into v_balance from casino_wallets where username = p_username;
  return query select true, coalesce(v_balance, 0);
end;
$$;

-- Create coinflip: deduct creator's balance and insert challenge
create or replace function public.casino_create_coinflip(p_username text, p_side text, p_amount int)
returns table(success boolean, challenge_id bigint, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_bal int;
begin
  if p_username is null or p_username = '' or p_amount is null or p_amount <= 0
     or p_side not in ('heads', 'tails') then
    return query select false, null::bigint, 'Invalid input'::text;
    return;
  end if;
  select coins_balance into v_bal from casino_wallets where username = p_username;
  v_bal := coalesce(v_bal, 0);
  if v_bal < p_amount then
    return query select false, null::bigint, 'Not enough coins'::text;
    return;
  end if;
  update casino_wallets set coins_balance = coins_balance - p_amount, updated_at = now()
  where username = p_username and coins_balance >= p_amount;
  if not found then
    return query select false, null::bigint, 'Not enough coins'::text;
    return;
  end if;
  insert into coinflip_challenges (creator_username, creator_side, amount, status)
  values (p_username, p_side, p_amount, 'open')
  returning id into v_id;
  return query select true, v_id, ''::text;
end;
$$;

-- Accept coinflip: lock challenge, then deduct acceptor and set acceptor (so only one can accept; stakes enforced)
create or replace function public.casino_accept_coinflip(p_challenge_id bigint, p_username text)
returns table(success boolean, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount int;
  v_creator text;
begin
  if p_username is null or p_username = '' then
    return query select false, 'Need display name'::text;
    return;
  end if;
  -- Lock the row so only one acceptor wins; both must put up coins (creator already deducted on create)
  select amount, creator_username into v_amount, v_creator
  from coinflip_challenges where id = p_challenge_id and status = 'open' for update;
  if not found then
    return query select false, 'Challenge not found or already taken'::text;
    return;
  end if;
  if v_creator = p_username then
    return query select false, 'Cannot accept your own challenge'::text;
    return;
  end if;
  -- Enforce stake: acceptor must have balance >= amount before we assign them
  update casino_wallets set coins_balance = coins_balance - v_amount, updated_at = now()
  where username = p_username and coins_balance >= v_amount;
  if not found then
    insert into casino_wallets (username, coins_balance) values (p_username, 0) on conflict do nothing;
    return query select false, 'Not enough coins'::text;
    return;
  end if;
  update coinflip_challenges
  set acceptor_username = p_username, status = 'matched'
  where id = p_challenge_id and status = 'open';
  return query select true, ''::text;
end;
$$;

-- Resolve coinflip: random result, pay winner 2*amount
create or replace function public.casino_resolve_coinflip(p_challenge_id bigint)
returns table(success boolean, result_side text, winner_username text, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator text;
  v_creator_side text;
  v_acceptor text;
  v_amount int;
  v_result text;
  v_winner text;
begin
  select creator_username, creator_side, acceptor_username, amount
  into v_creator, v_creator_side, v_acceptor, v_amount
  from coinflip_challenges where id = p_challenge_id and status = 'matched';
  if not found then
    return query select false, null::text, null::text, 'Challenge not ready to resolve'::text;
    return;
  end if;
  v_result := case when random() < 0.5 then 'heads' else 'tails' end;
  v_winner := case when v_creator_side = v_result then v_creator else v_acceptor end;
  perform casino_upsert_wallet(v_winner, v_amount * 2);
  update coinflip_challenges
  set status = 'settled', result = v_result, settled_at = now()
  where id = p_challenge_id;
  return query select true, v_result, v_winner, ''::text;
end;
$$;

-- Deposit aura: insert into casino_aura_inventory (caller removes from locked storage locally)
create or replace function public.casino_deposit_aura(p_username text, p_item_json jsonb)
returns table(success boolean, aura_id bigint, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if p_username is null or p_username = '' or p_item_json is null then
    return query select false, null::bigint, 'Invalid input'::text;
    return;
  end if;
  insert into casino_aura_inventory (username, item_json)
  values (p_username, p_item_json)
  returning id into v_id;
  return query select true, v_id, ''::text;
end;
$$;

-- Withdraw aura: delete from inventory and return item_json (caller adds to locked storage)
create or replace function public.casino_withdraw_aura(p_username text, p_aura_id bigint)
returns table(success boolean, item_json jsonb, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_json jsonb;
  v_in_use boolean;
  v_deleted int;
begin
  if p_username is null or p_username = '' or p_aura_id is null then
    return query select false, null::jsonb, 'Invalid input'::text;
    return;
  end if;
  select ai.item_json into v_json
  from casino_aura_inventory ai
  where ai.id = p_aura_id and ai.username = p_username;
  if not found then
    return query select false, null::jsonb, 'Aura not found'::text;
    return;
  end if;
  select exists(
    select 1 from itemflip_challenges i
    where (i.creator_aura_id = p_aura_id or i.acceptor_aura_id = p_aura_id)
      and i.status in ('open', 'matched')
  ) into v_in_use;
  if v_in_use then
    return query select false, null::jsonb, 'Aura is in a challenge'::text;
    return;
  end if;
  delete from casino_aura_inventory where id = p_aura_id and username = p_username;
  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then
    return query select false, null::jsonb, 'Withdraw failed'::text;
    return;
  end if;
  return query select true, v_json, ''::text;
end;
$$;

-- Create itemflip: lock creator's aura (challenge references it)
create or replace function public.casino_create_itemflip(p_username text, p_aura_id bigint)
returns table(success boolean, challenge_id bigint, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if p_username is null or p_username = '' or p_aura_id is null then
    return query select false, null::bigint, 'Invalid input'::text;
    return;
  end if;
  if not exists (select 1 from casino_aura_inventory where id = p_aura_id and username = p_username) then
    return query select false, null::bigint, 'Aura not found'::text;
    return;
  end if;
  if exists (select 1 from itemflip_challenges where (creator_aura_id = p_aura_id or acceptor_aura_id = p_aura_id) and status in ('open', 'matched')) then
    return query select false, null::bigint, 'Aura already in a challenge'::text;
    return;
  end if;
  insert into itemflip_challenges (creator_username, creator_aura_id, status)
  values (p_username, p_aura_id, 'open')
  returning id into v_id;
  return query select true, v_id, ''::text;
end;
$$;

-- Accept itemflip: lock challenge so only one acceptor wins; acceptor stakes their aura (risk on resolve)
create or replace function public.casino_accept_itemflip(p_challenge_id bigint, p_username text, p_aura_id bigint)
returns table(success boolean, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator text;
begin
  if p_username is null or p_username = '' or p_aura_id is null then
    return query select false, 'Invalid input'::text;
    return;
  end if;
  -- Lock row so only one acceptor can win; both auras at risk (transferred to winner on resolve)
  select creator_username into v_creator
  from itemflip_challenges where id = p_challenge_id and status = 'open' for update;
  if not found then
    return query select false, 'Challenge not found or already taken'::text;
    return;
  end if;
  if v_creator = p_username then
    return query select false, 'Cannot accept your own challenge'::text;
    return;
  end if;
  if not exists (select 1 from casino_aura_inventory where id = p_aura_id and username = p_username) then
    return query select false, 'Aura not found'::text;
    return;
  end if;
  if exists (select 1 from itemflip_challenges where (creator_aura_id = p_aura_id or acceptor_aura_id = p_aura_id) and status in ('open', 'matched') and id != p_challenge_id) then
    return query select false, 'Aura already in a challenge'::text;
    return;
  end if;
  update itemflip_challenges
  set acceptor_username = p_username, acceptor_aura_id = p_aura_id, status = 'matched'
  where id = p_challenge_id and status = 'open';
  return query select true, ''::text;
end;
$$;

-- Resolve itemflip: random winner gets both auras (transfer both to winner's inventory)
create or replace function public.casino_resolve_itemflip(p_challenge_id bigint)
returns table(success boolean, result_winner text, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator text;
  v_acceptor text;
  v_creator_aura bigint;
  v_acceptor_aura bigint;
  v_winner text;
begin
  select creator_username, acceptor_username, creator_aura_id, acceptor_aura_id
  into v_creator, v_acceptor, v_creator_aura, v_acceptor_aura
  from itemflip_challenges where id = p_challenge_id and status = 'matched';
  if not found then
    return query select false, null::text, 'Challenge not ready to resolve'::text;
    return;
  end if;
  v_winner := case when random() < 0.5 then v_creator else v_acceptor end;
  update casino_aura_inventory set username = v_winner where id in (v_creator_aura, v_acceptor_aura);
  update itemflip_challenges
  set status = 'settled', result_winner = v_winner, settled_at = now()
  where id = p_challenge_id;
  return query select true, v_winner, ''::text;
end;
$$;

-- Grant execute to anon (and authenticated if you use auth later)
grant execute on function public.casino_deposit_coins(text, int) to anon;
grant execute on function public.casino_withdraw_coins(text, int) to anon;
grant execute on function public.casino_create_coinflip(text, text, int) to anon;
grant execute on function public.casino_accept_coinflip(bigint, text) to anon;
grant execute on function public.casino_resolve_coinflip(bigint) to anon;
grant execute on function public.casino_deposit_aura(text, jsonb) to anon;
grant execute on function public.casino_withdraw_aura(text, bigint) to anon;
grant execute on function public.casino_create_itemflip(text, bigint) to anon;
grant execute on function public.casino_accept_itemflip(bigint, text, bigint) to anon;
grant execute on function public.casino_resolve_itemflip(bigint) to anon;
