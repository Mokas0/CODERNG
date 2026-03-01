-- Add bazaar_withdraw_aura_to_client RPC (withdraw Bazaar aura directly to Locked storage)
-- Run in Supabase SQL Editor if you need to add this to an existing deployment.

create or replace function public.bazaar_withdraw_aura_to_client(p_inventory_id bigint)
returns table(success boolean, item_json jsonb, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_json jsonb;
begin
  if auth.uid() is null then
    return query select false, null::jsonb, 'Not signed in'::text;
    return;
  end if;
  select bazaar_seller_inventory.item_json into v_json from bazaar_seller_inventory
  where id = p_inventory_id and user_id = auth.uid();
  if not found then
    return query select false, null::jsonb, 'Item not in your Bazaar inventory'::text;
    return;
  end if;
  delete from bazaar_seller_inventory where id = p_inventory_id and user_id = auth.uid();
  return query select true, v_json, ''::text;
end;
$$;

grant execute on function public.bazaar_withdraw_aura_to_client(bigint) to authenticated;
