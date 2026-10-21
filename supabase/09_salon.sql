-- Salon: change hair / beard AFTER sign-up. Run after 01_schema.sql and 03_activities.sql.
-- One atomic call: it runs the server activity 'get_hair' (must be standing in a salon, cooldown, the price from the activities table is taken
-- from the pocket through the ledger) AND saves the new hair/beard. If anything fails the whole call rolls back, so a player is never charged
-- without getting the haircut. Only hair and beard are taken from p_look; every other part of the saved look is kept as it is.
-- (public.save_avatar refuses hair/beard changes once a player is onboarded, so this is the only paid way to change them.)
create or replace function public.save_hair(p_look jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); cur jsonb; nxt jsonb; clean jsonb; st jsonb;
begin
  if pg_column_size(p_look) > 8000 then raise exception 'look_too_large'; end if;
  select avatar_json into cur from public.profiles where id = u for update;
  if cur is null then raise exception 'finish_sign_up'; end if;
  nxt := cur;
  if p_look ? 'hair' then nxt := jsonb_set(nxt, '{hair}', p_look -> 'hair'); end if;
  if p_look ? 'beard' then nxt := jsonb_set(nxt, '{beard}', p_look -> 'beard'); end if;
  clean := public.validate_avatar(nxt, false);
  if clean -> 'hair' is not distinct from cur -> 'hair' and clean -> 'beard' is not distinct from cur -> 'beard' then raise exception 'nothing_changed'; end if;   -- no change, no charge
  st := public.do_activity('get_hair');                                  -- wrong_place / cooldown / insufficient_funds are raised here; charges the ledger
  update public.profiles set avatar_json = clean, avatar_hash = md5(clean::text) where id = u;
  return jsonb_build_object('look', clean, 'stats', st);
end $$;
revoke execute on function public.save_hair(jsonb) from public, anon;
grant execute on function public.save_hair(jsonb) to authenticated;
