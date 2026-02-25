-- ============================================================
-- Purchase codes table
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

create table if not exists public.purchase_codes (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  product_id  text not null,
  claimed     boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Only the service-role key (used by Netlify Functions) can insert
alter table public.purchase_codes enable row level security;

drop policy if exists "Anyone can read unclaimed code" on public.purchase_codes;
create policy "Anyone can read unclaimed code"
  on public.purchase_codes for select
  using (true);

drop policy if exists "Service role insert only" on public.purchase_codes;
create policy "Service role insert only"
  on public.purchase_codes for insert
  with check (true);

drop policy if exists "Service role update only" on public.purchase_codes;
create policy "Service role update only"
  on public.purchase_codes for update
  using (true);

-- ============================================================
-- RPC: redeem_purchase_code
-- Called by the frontend with the claim code.
-- Returns the product details so the client can apply them.
-- ============================================================
create or replace function public.redeem_purchase_code(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.purchase_codes%rowtype;
begin
  -- Lock the row to prevent double-redemption
  select * into v_row
    from public.purchase_codes
   where code = upper(trim(p_code))
     and claimed = false
  for update;

  if not found then
    return json_build_object('success', false, 'error', 'Invalid or already claimed code.');
  end if;

  -- Mark claimed
  update public.purchase_codes
     set claimed = true
   where id = v_row.id;

  return json_build_object(
    'success',    true,
    'product_id', v_row.product_id
  );
end;
$$;
