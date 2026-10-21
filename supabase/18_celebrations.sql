-- ============================================================================
-- FUTA World — CELEBRATIONS (convocation, matriculation, …). Run AFTER 01..17.   Doc: docs/CELEBRATIONS.md   Admin page: /admin
-- The admin switches a celebration ON or OFF. While it is ON, every player sees festive decorations on the map and on the phone.
-- Rules (.clinerules: the SERVER decides, no secrets in the client):
--   * ONE celebration row (id = 1): which event, on/off, a title, a short message, and an optional start and end time.
--   * Everybody (even signed-out visitors) may READ it through public.get_celebration() — it holds only public text.
--   * Only the admin may CHANGE it, through public.admin_set_celebration(password, …). It uses the SAME admin password and the SAME
--     lock-out (5 wrong tries in 15 minutes) as the metrics dashboard (17_admin_metrics.sql). The table itself has no grants.
--   * Titles and messages are plain text; the apps insert them with textContent, never as HTML.
--   * It switches itself OFF when the end time passes (get_celebration checks the clock), even if the admin forgets.
-- ============================================================================

create table if not exists public.celebration (
  id int primary key default 1 check (id = 1),
  event text not null default 'convocation' check (event in ('convocation', 'matriculation', 'independence', 'christmas', 'party')),
  is_on boolean not null default false,
  title text,
  message text,
  starts_at timestamptz,
  ends_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.celebration enable row level security;
insert into public.celebration (id) values (1) on conflict (id) do nothing;
revoke all on public.celebration from anon, authenticated;

-- what everybody may see ---------------------------------------------------------------------------------------------
create or replace function public.get_celebration() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'on', c.is_on and (c.starts_at is null or now() >= c.starts_at) and (c.ends_at is null or now() < c.ends_at),
    'event', c.event, 'title', c.title, 'message', c.message,
    'startsAt', c.starts_at, 'endsAt', c.ends_at, 'updatedAt', c.updated_at)
  from public.celebration c where c.id = 1
$$;
revoke execute on function public.get_celebration() from public;
grant execute on function public.get_celebration() to anon, authenticated;

-- the admin check (same password + same lock-out as admin_metrics). Returns NULL when the password is right, else an error code.
create or replace function private.admin_gate(u uuid, p_password text) returns text
language plpgsql security definer set search_path = '' as $$
declare pwh text; fails int; ok boolean;
begin
  select count(*) into fails from private.admin_attempts where user_id = u and at > now() - interval '15 minutes';
  if fails >= 5 then return 'locked'; end if;
  select pw_hash into pwh from private.admin_secret where id = 1;
  ok := pwh is not null and p_password is not null and length(p_password) <= 200 and extensions.crypt(p_password, pwh) = pwh;
  if not ok then
    insert into private.admin_attempts (user_id) values (u);
    delete from private.admin_attempts where at < now() - interval '2 days';
    return 'bad_password';
  end if;
  delete from private.admin_attempts where user_id = u;
  return null;
end $$;
revoke all on function private.admin_gate(uuid, text) from public, anon, authenticated;

-- the admin switch ---------------------------------------------------------------------------------------------------
create or replace function public.admin_set_celebration(p_password text, p_event text, p_on boolean, p_title text default null, p_message text default null,
                                                       p_starts timestamptz default null, p_ends timestamptz default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); err text; t text; m text;
begin
  if u is null then raise exception 'auth_required'; end if;
  err := private.admin_gate(u, p_password);
  if err is not null then return jsonb_build_object('ok', false, 'error', err); end if;
  if p_event is null or p_event not in ('convocation', 'matriculation', 'independence', 'christmas', 'party') then return jsonb_build_object('ok', false, 'error', 'bad_event'); end if;
  t := nullif(btrim(regexp_replace(coalesce(p_title, ''), '[[:cntrl:]]', '', 'g')), '');
  m := nullif(btrim(regexp_replace(coalesce(p_message, ''), '[[:cntrl:]]', '', 'g')), '');
  if length(coalesce(t, '')) > 60 or length(coalesce(m, '')) > 160 then return jsonb_build_object('ok', false, 'error', 'too_long'); end if;
  if p_ends is not null and (p_ends > now() + interval '90 days' or (p_on and p_ends <= now()) or (p_starts is not null and p_ends <= p_starts)) then return jsonb_build_object('ok', false, 'error', 'bad_dates'); end if;
  update public.celebration set event = p_event, is_on = coalesce(p_on, false), title = t, message = m, starts_at = p_starts, ends_at = p_ends, updated_at = now(), updated_by = u where id = 1;
  return jsonb_build_object('ok', true, 'celebration', public.get_celebration());
end $$;
revoke execute on function public.admin_set_celebration(text, text, boolean, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_set_celebration(text, text, boolean, text, text, timestamptz, timestamptz) to authenticated;
