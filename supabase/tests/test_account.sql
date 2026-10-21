-- LOCAL TEST for 11_account.sql. Run by run.sh after test.sql. Throwaway Postgres only.
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true); execute 'set local role authenticated'; end $$;
create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', '', true); execute 'set local role anon'; end $$;
create or replace function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'FAIL: %', msg; end if; raise notice 'ok  - %', msg; end $$;
create or replace function pg_temp.fails(stmt text, frag text, msg text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then
    if sqlerrm like '%' || frag || '%' then raise notice 'ok  - % (%)', msg, sqlerrm; return; end if;
    raise exception 'FAIL: % — wrong error: %', msg, sqlerrm;
  end;
  raise exception 'FAIL: % — no error raised', msg;
end $$;
grant execute on all functions in schema pg_temp to public;

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000d7'; b uuid := '00000000-0000-0000-0000-0000000000d8'; n uuid := '00000000-0000-0000-0000-0000000000d9';  -- n = not finished sign-up
  r jsonb;
begin
  insert into auth.users (id, email) values (a, 'aa@x.com'), (b, 'ab@x.com'), (n, 'an@x.com');
  update public.profiles set username = 'acct_ada' where id = a;
  update public.profiles set username = 'acct_bee' where id = b;
  update public.profiles set username = 'acct_new' where id = n;
  update public.private_profiles set onboarded = true, dob = '2000-01-01' where id in (a, b);

  -- access
  perform pg_temp.as_anon();
  perform pg_temp.fails($q$select public.change_username('whatever_name')$q$, 'permission denied', 'anon cannot rename');
  perform pg_temp.fails($q$select * from public.username_history$q$, 'permission denied', 'anon cannot read the history');
  reset role;
  perform pg_temp.as_user(a);
  perform pg_temp.fails($q$select * from public.username_history$q$, 'permission denied', 'players cannot read the history table');
  perform pg_temp.fails($q$update public.profiles set username = 'sneaky_name' where id = auth.uid()$q$, 'permission denied', 'no direct rename from the browser');
  reset role;

  -- before sign-up is finished: free, unlimited, no history
  update public.profiles set username = 'acct_new2' where id = n; update public.profiles set username = 'acct_new3' where id = n;
  perform pg_temp.ok((select count(*) from public.username_history where user_id = n) = 0, 'renaming before sign-up is finished is free and not logged');
  perform pg_temp.as_user(n);
  perform pg_temp.fails($q$select public.change_username('acct_other')$q$, 'finish_sign_up', 'change_username needs a finished sign-up');
  reset role;

  -- the rename
  perform pg_temp.as_user(a);
  r := public.get_username_status();
  perform pg_temp.ok((r->>'can_change')::boolean and r->>'username' = 'acct_ada' and (r->>'cooldown_days')::int = 30, 'status: can change, 30-day cooldown');
  perform pg_temp.fails($q$select public.change_username('acct_ada')$q$, 'same_name', 'same name refused');
  perform pg_temp.fails($q$select public.change_username('ab')$q$, '3', 'too short refused');
  perform pg_temp.fails($q$select public.change_username('Bad Name!')$q$, '3', 'bad characters refused');
  perform pg_temp.fails($q$select public.change_username('admin')$q$, 'reserved', 'reserved name refused');
  perform pg_temp.fails($q$select public.change_username('ACCT_BEE')$q$, 'taken', 'taken name refused (case-insensitive)');
  r := public.change_username('  Ada_Lagos ');
  perform pg_temp.ok(r->>'username' = 'ada_lagos', 'renamed, trimmed and lower-cased; get_me returned');
  perform pg_temp.ok((select count(*) from public.profiles where id = a and username = 'ada_lagos') = 1, 'profile row updated');
  perform pg_temp.fails($q$select public.change_username('ada_again')$q$, 'username_cooldown:', 'second rename inside 30 days refused');
  r := public.get_username_status();
  perform pg_temp.ok(not (r->>'can_change')::boolean and r->>'next_change_at' is not null, 'status shows the next allowed date');
  reset role;
  perform pg_temp.ok((select old_name || '>' || new_name from public.username_history where user_id = a) = 'acct_ada>ada_lagos', 'history recorded');

  -- the cooldown also guards set_profile (the sign-up RPC)
  perform pg_temp.as_user(a);
  perform pg_temp.fails($q$select public.set_profile('via_setprofile', '2000-01-01')$q$, 'username_cooldown:', 'set_profile cannot bypass the cooldown');
  reset role;

  -- cooldown over -> allowed again; configurable; moderators via SQL editor are not limited
  update public.username_history set changed_at = now() - interval '31 days' where user_id = a;
  perform pg_temp.as_user(a);
  perform pg_temp.ok((public.get_username_status()->>'can_change')::boolean, 'after 31 days the player can rename again');
  perform public.change_username('ada_third');
  reset role;
  insert into public.app_config (key, value) values ('account.username_cooldown_days', '0'::jsonb) on conflict (key) do update set value = excluded.value;
  perform pg_temp.as_user(a);
  perform public.change_username('ada_fourth');
  reset role;
  perform pg_temp.ok((select count(*) from public.username_history where user_id = a) = 3, 'cooldown 0 allows back-to-back renames (config works)');
  reset role;
  delete from public.app_config where key = 'account.username_cooldown_days';
  perform pg_temp.as_anon(); reset role;                     -- clear the signed-in claim (it survives 'reset role' inside one transaction) = the SQL editor
  update public.profiles set username = 'mod_renamed' where id = a;
  perform pg_temp.ok((select username from public.profiles where id = a) = 'mod_renamed', 'SQL editor / moderator rename ignores the cooldown');
  raise notice 'ALL ACCOUNT TESTS PASSED';
end $$;
