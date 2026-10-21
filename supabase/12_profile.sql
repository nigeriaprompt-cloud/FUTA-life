-- ==========================================================================
-- 12_profile.sql — public PLAYER PROFILE (what the phone's profile view shows).   Run AFTER 01_schema.sql.
-- Better after 05 (feed) and 06/07/08 (property, cars, accessories) too — missing tables are skipped, not an error.
-- Re-run it whenever you re-run 01 (01 revokes grants).  Safe to re-run.  Test: supabase/tests/run.sh (tests/test_profile.sql).
--
-- get_profile(p_user) returns ONE json object with only what is meant to be seen by other players:
--   id, username, gender ('male'|'female'), avatar (the saved look), joined ('YYYY-MM'), start (life story id), me, relation
--   (none | waved | incoming | friends), friends (count), properties / cars / accessories (id, level, since or slot),
--   latest_post (their feed post from the last 24 h, if any).
-- It NEVER returns: age / date of birth, email, wallet or bank balance, prices paid, ledger, where they are standing, blocks.
-- Rules: you must be signed in; you can always open your own; a blocked pair, someone who hasn't finished sign-up, or the other
-- age group (teen vs adult — same rule as chat search) all answer the same 'not_found' so nothing leaks.
-- ==========================================================================
create or replace function public.get_profile(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  u uuid := private.require_user(); p public.profiles; pp public.private_profiles; rel text := 'none'; w record;
  props jsonb := '[]'::jsonb; cars jsonb := '[]'::jsonb; acc jsonb := '[]'::jsonb; post jsonb := null; nfriends int := 0; frame text;
begin
  select * into p from public.profiles where id = p_user;
  if not found or p.username is null then raise exception 'not_found'; end if;
  select * into pp from public.private_profiles where id = p_user;
  if p_user <> u then
    if public.is_blocked_between(u, p_user) or not private.same_age_group(u, p_user) then raise exception 'not_found'; end if;
    select ww.status, ww.from_user into w from public.waves ww
      where (ww.from_user = u and ww.to_user = p_user) or (ww.from_user = p_user and ww.to_user = u)
      order by (ww.status = 'accepted') desc, ww.id desc limit 1;
    rel := case when w.status = 'accepted' then 'friends' when w.status = 'pending' and w.from_user = u then 'waved' when w.status = 'pending' then 'incoming' else 'none' end;
  end if;

  select count(*) into nfriends from public.waves x where x.status = 'accepted' and p_user in (x.from_user, x.to_user);

  if to_regclass('public.property_owned') is not null then
    select coalesce(jsonb_agg(jsonb_build_object('id', o.prop_id, 'level', c.level, 'since', to_char(o.bought_at at time zone 'Africa/Lagos', 'YYYY-MM-DD')) order by c.level desc, o.bought_at), '[]'::jsonb)
      into props from public.property_owned o join public.property_catalog c on c.id = o.prop_id where o.user_id = p_user;
  end if;
  if to_regclass('public.car_owned') is not null then
    select coalesce(jsonb_agg(jsonb_build_object('id', o.car_id, 'level', c.level, 'since', to_char(o.bought_at at time zone 'Africa/Lagos', 'YYYY-MM-DD')) order by c.level desc, o.bought_at), '[]'::jsonb)
      into cars from public.car_owned o join public.car_catalog c on c.id = o.car_id where o.user_id = p_user;
  end if;
  if to_regclass('public.acc_owned') is not null then
    select coalesce(jsonb_agg(jsonb_build_object('id', o.item_id, 'level', c.level, 'slot', c.slot) order by c.level desc, o.bought_at), '[]'::jsonb)
      into acc from public.acc_owned o join public.acc_catalog c on c.id = o.item_id where o.user_id = p_user;
  end if;
  if to_regclass('public.feed_posts') is not null then
    select jsonb_build_object('body', f.body, 'bg', f.bg, 'at', f.created_at) into post
      from public.feed_posts f where f.user_id = p_user and f.expires_at > now() order by f.id desc limit 1;
  end if;

  frame := p.avatar_json -> 'body' ->> 'frame';
  return jsonb_build_object(
    'id', p.id, 'username', p.username, 'avatar', p.avatar_json,
    'gender', case frame when 'f' then 'female' when 'm' then 'male' else null end,
    'joined', to_char(p.created_at at time zone 'Africa/Lagos', 'YYYY-MM'), 'start', pp.life_start, 'campus', p.campus,
    'me', p_user = u, 'relation', rel, 'friends', nfriends,
    'properties', props, 'cars', cars, 'accessories', acc, 'latest_post', post);
end $$;

revoke execute on function public.get_profile(uuid) from public, anon;
grant execute on function public.get_profile(uuid) to authenticated;
