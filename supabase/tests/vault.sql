-- LOCAL TEST for 13_vault.sql: run after test.sql (it re-uses the users test.sql created).   psql -v ON_ERROR_STOP=1 -f vault.sql
-- A "solver" reads the secret answers as the database owner (the browser can never do that) and plays through the public RPCs as a real player.
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true); execute 'set local role authenticated'; end $$;
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

-- the right next answer for an attempt, read from the secrets
create or replace function pg_temp.right_answer(p_attempt bigint) returns jsonb language plpgsql as $$
declare cur jsonb; st jsonb; k text;
begin
  select puzzles -> step into cur from public.vault_attempts where id = p_attempt; k := cur ->> 'kind'; st := cur -> 'st';
  return case k
    when 'lock' then jsonb_build_object('codes', st -> 'codes')
    when 'cracker' then jsonb_build_object('guess', st ->> 'secret')
    when 'wires' then jsonb_build_object('cut', (st -> 'sol') -> jsonb_array_length(st -> 'cut'))
    when 'pattern' then jsonb_build_object('pick', st -> 'ans')
    when 'lights' then case when (st ->> 'shown')::int < jsonb_array_length(st -> 'seq') then '{"op":"show"}'::jsonb
                            else jsonb_build_object('op', 'tap', 'c', st -> 'seq' ->> (st ->> 'pos')::int) end
    when 'match' then jsonb_build_object('pick', st -> 'target') end;
end $$;
create or replace function pg_temp.wrong_answer(p_attempt bigint) returns jsonb language plpgsql as $$
declare cur jsonb; st jsonb; k text; i int;
begin
  select puzzles -> step into cur from public.vault_attempts where id = p_attempt; k := cur ->> 'kind'; st := cur -> 'st';
  return case k
    when 'lock' then '{"codes":[111,222,333]}'::jsonb
    when 'cracker' then '{"guess":"9999"}'::jsonb
    when 'wires' then jsonb_build_object('cut', (select x from generate_series(0, 5) x where not ((st -> 'sol') @> to_jsonb(x)) limit 1))
    when 'pattern' then jsonb_build_object('pick', (((st ->> 'ans')::int + 1) % 4))
    when 'lights' then case when (st ->> 'shown')::int < jsonb_array_length(st -> 'seq') then '{"op":"show"}'::jsonb
                            else jsonb_build_object('op', 'tap', 'c', (select c from unnest(array['red','green','blue','yellow']) c where c <> st -> 'seq' ->> (st ->> 'pos')::int limit 1)) end
    when 'match' then jsonb_build_object('pick', (select x from generate_series(0, 5) x where x <> (st ->> 'target')::int and not ((st -> 'eliminated') @> to_jsonb(x)) limit 1)) end;
end $$;
-- play an attempt to the end as player u. mode 'win' = always right; 'lose' = always wrong
create or replace function pg_temp.play(u uuid, p_attempt bigint, mode text) returns jsonb language plpgsql as $$
declare ans jsonb; res jsonb; n int := 0;
begin
  loop
    n := n + 1; if n > 80 then raise exception 'play: stuck'; end if;
    execute 'reset role';
    ans := case when mode = 'win' then pg_temp.right_answer(p_attempt) else pg_temp.wrong_answer(p_attempt) end;
    perform pg_temp.as_user(u);
    res := public.vault_answer(p_attempt, ans);
    if n > 70 then raise notice 'stuck: ans=% res=%', ans, res; end if;
    if res ->> 'status' not in ('continue', 'solved') then execute 'reset role'; return res; end if;
  end loop;
end $$;

do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000000a'; b uuid := '00000000-0000-0000-0000-00000000000b';
  c uuid := '00000000-0000-0000-0000-00000000000c'; t uuid := '00000000-0000-0000-0000-0000000000d1';
  hb text := 'building_mv0q4b841p'; r jsonb; r2 jsonb; att bigint; amt bigint; before_ bigint; i int; n int; k text; kinds text[]; st jsonb; g record; ok_ boolean; cnt int; puz jsonb; ans jsonb;
begin
  -- ---------------------------------------------------------------- the browser can never read the vault
  perform pg_temp.as_user(a);
  perform pg_temp.fails('select * from public.vault_state', 'permission denied', 'vault amount table is unreadable');
  perform pg_temp.fails('select * from public.vault_attempts', 'permission denied', 'puzzle answers table is unreadable');
  perform pg_temp.fails('select * from public.vault_cooldowns', 'permission denied', 'cooldown table is unreadable');
  perform pg_temp.fails('select * from public.jail', 'permission denied', 'jail table is not directly readable (use get_jail)');
  perform pg_temp.fails('select public.vault_status()', 'wrong_place', 'vault status refused outside a bank');
  perform public.enter_building('wema_bank_1', 'bank');
  perform pg_temp.fails('select public.vault_status()', 'wrong_place', 'no vault in Wema Bank (only the Bank has one)');
  perform pg_temp.fails('select public.vault_start()', 'wrong_place', 'cannot start a robbery in Wema Bank');
  perform public.enter_building(hb, 'bank');
  r := public.vault_status();
  perform pg_temp.ok(r ->> 'vault' = 'full' and not (r ? 'amount') and (r ->> 'cooldownSecs')::int = 0 and (r ->> 'jailSecs')::int = 0, 'Bank vault is full; status shows no amount');
  reset role;
  perform pg_temp.ok((select amount from public.vault_state where id = 'heritage') between 7000000 and 14000000, 'hidden vault amount is 7m–14m');

  -- ---------------------------------------------------------------- amount distribution: always 500k..1m, whole thousands, mostly medium
  select count(*) filter (where v between 7000000 and 14000000 and v % 1000 = 0), count(*) filter (where v < 10000000), count(*) filter (where v >= 12500000) into n, cnt, i
    from (select private.vault_roll() v from generate_series(1, 2000)) s;
  perform pg_temp.ok(n = 2000, '2000 random vault amounts: all within 7m–14m and whole thousands');
  perform pg_temp.ok(cnt between 1000 and 1400 and i between 80 and 330, 'most are medium (' || cnt || '/2000 under 10m), a few are huge (' || i || '/2000 over 12.5m)');

  -- ---------------------------------------------------------------- generators: uniqueness / sanity over many runs
  ok_ := true; for i in 1..60 loop
    st := private.vgen_lock();
    for n in 0..2 loop
      if private.vclue_count(st -> 'clues' -> n) <> 1 or not private.vclue_ok((st -> 'codes' ->> n)::int, (st -> 'clues' -> n -> 0)) then ok_ := false; end if;
      if jsonb_array_length(st -> 'clues' -> n) < 3 then ok_ := false; end if;
    end loop;
  end loop;
  perform pg_temp.ok(ok_, 'code lock: 60 locks, every code is the ONLY number matching its clues (3+ clues each)');
  select avg(jsonb_array_length(x))::numeric(4,2) into g from (select jsonb_array_elements(private.vgen_lock() -> 'clues') x from generate_series(1, 30)) s;
  raise notice 'info - average clues per code: %', g;

  ok_ := true; for i in 1..200 loop
    st := private.vgen_wires();
    if jsonb_array_length(st -> 'sol') not between 2 and 5 or jsonb_array_length(st -> 'wires') <> 6 then ok_ := false; end if;
    if (select count(distinct x) from jsonb_array_elements(st -> 'sol') x) <> jsonb_array_length(st -> 'sol') then ok_ := false; end if;
  end loop;
  perform pg_temp.ok(ok_, 'wires: 200 panels, 2–5 wires to cut, no duplicates');

  ok_ := true; for i in 1..300 loop
    st := private.vgen_pattern_round();
    if jsonb_array_length(st -> 'options') <> 4 or (select count(distinct x) from jsonb_array_elements_text(st -> 'options') x) <> 4 or (st ->> 'ans')::int not between 0 and 3 or jsonb_array_length(st -> 'series') <> 5 then ok_ := false; raise notice 'bad pattern %', st; end if;
  end loop;
  perform pg_temp.ok(ok_, 'pattern: 300 rounds, 5 terms, 4 different options, valid answer index');

  ok_ := true; for i in 1..200 loop
    st := private.vgen_match();
    if jsonb_array_length(st -> 'items') <> 6 or jsonb_array_length(st -> 'clues') not between 3 and 8 or private.vmatch_count(st -> 'items', st -> 'defs') <> 1
       or private.vmatch_count(jsonb_build_array(st -> 'items' -> (st ->> 'target')::int), st -> 'defs') <> 1 then ok_ := false; end if;
  end loop;
  perform pg_temp.ok(ok_, 'match: 200 sets, 6 distinct items, 3–8 clues, exactly ONE item fits (the target)');

  -- ---------------------------------------------------------------- each puzzle type: wrong answers cost strikes, right answers solve it
  foreach k in array array['lock', 'cracker', 'wires', 'pattern', 'lights', 'match'] loop
    st := private.vgen(k);
    puz := private.vview(k, st);
    perform pg_temp.ok(puz ->> 'kind' = k and not (puz::text ~ '"(secret|sol|ans|target|seq|codes)"'), k || ': browser view contains no secret fields');
  end loop;

  -- ---------------------------------------------------------------- a full winning robbery
  perform pg_temp.as_user(a);
  select pocket into before_ from public.wallets where id = a;
  r := public.vault_start(); att := (r ->> 'attempt')::bigint;
  perform pg_temp.ok((r ->> 'count')::int = 3 and (r ->> 'secsLeft')::int between 115 and 120 and r -> 'puzzle' ? 'kind', 'vault_start: 3 puzzles, one countdown ~120s, first puzzle shown');
  perform pg_temp.ok(public.vault_start() ->> 'attempt' = att::text, 'starting again resumes the same attempt');
  r2 := public.vault_status();
  perform pg_temp.ok(r2 ->> 'vault' = 'robbery' and (r2 ->> 'mine')::boolean, 'status: robbery in progress (mine)');
  reset role;
  select array_agg(p ->> 'kind' order by ord) into kinds from public.vault_attempts, jsonb_array_elements(puzzles) with ordinality x(p, ord) where id = att;
  perform pg_temp.ok(cardinality(kinds) = 3 and (select count(distinct x) from unnest(kinds) x) = 3, 'the 3 puzzles are different kinds: ' || array_to_string(kinds, ', '));
  select amount into amt from public.vault_state where id = 'heritage';
  perform pg_temp.as_user(b);
  perform public.enter_building(hb, 'bank');
  r2 := public.vault_status();
  perform pg_temp.ok(r2 ->> 'vault' = 'robbery' and not (r2 ->> 'mine')::boolean, 'other players see "robbery in progress"');
  perform pg_temp.fails('select public.vault_start()', 'vault_busy', 'a second player cannot start while it is locked');
  perform pg_temp.fails(format('select public.vault_answer(%s, ''{"pick":0}'')', att), 'bad_attempt', 'cannot answer someone else''s attempt');
  reset role;
  r := pg_temp.play(a, att, 'win');
  perform pg_temp.ok(r ->> 'status' = 'win' and (r ->> 'payout')::bigint = amt, 'solved all 3: win, payout = the whole vault (' || amt || ')');
  perform pg_temp.ok((select pocket from public.wallets where id = a) = before_ + amt, 'whole amount landed in the POCKET');
  perform pg_temp.ok((select count(*) from public.ledger where user_id = a and kind = 'vault_heist' and d_pocket = amt and d_bank = 0) = 1, 'ledger has one vault_heist entry');
  perform pg_temp.ok((select status from public.vault_state where id = 'heritage') = 'empty' and (select amount from public.vault_state where id = 'heritage') = 0, 'vault is now empty');
  perform pg_temp.as_user(b);
  r2 := public.vault_status();
  perform pg_temp.ok(r2 ->> 'vault' = 'empty' and (r2 ->> 'refillSecs')::int between 1190 and 1200, 'others see empty, refill in about 20 minutes');
  perform pg_temp.fails('select public.vault_start()', 'vault_empty', 'cannot rob an empty vault');
  reset role;
  perform pg_temp.as_user(a);
  r2 := public.vault_status();
  perform pg_temp.ok((r2 ->> 'cooldownSecs')::int between 10790 and 10800, 'winner gets a 3 hour personal cooldown');
  select pocket into before_ from public.wallets where id = a;
  r2 := public.vault_answer(att, '{"pick":0}');
  reset role;
  perform pg_temp.ok(r2 ->> 'status' = 'win' and (select pocket from public.wallets where id = a) = before_, 'a finished attempt just repeats its result: it cannot pay out twice');
  -- refill after 20 minutes: new random amount, same winner still cooling down
  update public.vault_state set refill_at = now() - interval '1 second' where id = 'heritage';
  perform pg_temp.as_user(b);
  r2 := public.vault_status();
  perform pg_temp.ok(r2 ->> 'vault' = 'full', 'after the 20 minutes the vault is full again');
  reset role;
  perform pg_temp.ok((select amount from public.vault_state where id = 'heritage') between 7000000 and 14000000, 'refilled with a new amount in range');
  perform pg_temp.as_user(a);
  perform pg_temp.fails('select public.vault_start()', 'vault_cooldown', 'winner cannot go again until the personal cooldown ends');
  reset role;

  -- ---------------------------------------------------------------- a failed robbery = arrest (adult)
  perform pg_temp.as_user(b);
  r := public.vault_start(); att := (r ->> 'attempt')::bigint;
  reset role;
  r := pg_temp.play(b, att, 'lose');
  perform pg_temp.ok(r ->> 'status' = 'caught' and (r ->> 'jailSecs')::int between 170 and 180, 'wrong answers run out: caught, 3 minutes in jail');
  perform pg_temp.as_user(b);
  perform pg_temp.ok((public.get_jail() ->> 'inJail')::boolean and (public.get_jail() ->> 'secsLeft')::int between 170 and 180, 'get_jail shows the sentence');
  perform pg_temp.ok((public.get_stats() ->> 'jailSecs')::int between 170 and 180, 'get_stats carries jailSecs');
  perform pg_temp.fails('select public.atm_withdraw(10)', 'in_jail', 'no ATM in jail');
  perform pg_temp.fails($q$select public.enter_building('library_1', 'library')$q$, 'in_jail', 'cannot enter buildings in jail');
  perform pg_temp.fails('select public.vault_start()', 'in_jail', 'cannot rob again while in jail');
  perform pg_temp.fails($q$select public.do_activity('drink_water')$q$, 'in_jail', 'no activities in jail');
  reset role;
  perform pg_temp.ok((select status from public.vault_state where id = 'heritage') = 'full', 'after a failure the vault unlocks, still full');
  update public.jail set until = now() - interval '1 second' where user_id = b;
  perform pg_temp.as_user(b);
  perform pg_temp.ok(not (public.get_jail() ->> 'inJail')::boolean, 'released when the 3 minutes are over');
  perform public.enter_building(hb, 'bank');
  reset role;

  -- ---------------------------------------------------------------- time runs out (player just leaves) => arrested, vault unlocks on its own
  perform pg_temp.as_user(b);
  r := public.vault_start(); att := (r ->> 'attempt')::bigint;
  reset role;
  update public.vault_attempts set deadline = now() - interval '10 seconds' where id = att;
  update public.vault_state set lock_expires = now() - interval '7 seconds' where id = 'heritage';
  perform pg_temp.as_user(c); perform public.enter_building(hb, 'bank');
  r2 := public.vault_status();
  perform pg_temp.ok(r2 ->> 'vault' = 'full', 'someone else looking: the abandoned robbery has been cleared, vault is full');
  reset role;
  perform pg_temp.ok((select status from public.vault_attempts where id = att) = 'expired' and exists (select 1 from public.jail where user_id = b and until > now() - interval '1 hour'), 'the robber who vanished was arrested');
  -- answering after the clock ran out
  update public.jail set until = now() - interval '1 second' where user_id = b;
  perform pg_temp.as_user(b);
  r := public.vault_start(); att := (r ->> 'attempt')::bigint;
  reset role;
  update public.vault_attempts set deadline = now() - interval '10 seconds' where id = att;
  update public.vault_state set lock_expires = now() - interval '7 seconds' where id = 'heritage';
  ans := pg_temp.right_answer(att);
  perform pg_temp.as_user(b);
  r := public.vault_answer(att, ans);
  perform pg_temp.ok(r ->> 'status' = 'caught', 'answering after time is up = caught, even with the right answer');
  reset role;
  update public.jail set until = now() - interval '1 second' where user_id = b;

  -- ---------------------------------------------------------------- giving up counts as caught
  perform pg_temp.as_user(c);
  r := public.vault_start(); att := (r ->> 'attempt')::bigint;
  r := public.vault_giveup(att);
  perform pg_temp.ok(r ->> 'status' = 'caught', 'giving up = caught (no free re-rolls of the puzzles)');
  reset role;
  update public.jail set until = now() - interval '1 second' where user_id = c;

  -- ---------------------------------------------------------------- under 18: "Vault Challenge" — same puzzles, no arrest, only a cooldown
  perform pg_temp.as_user(t); perform public.enter_building(hb, 'bank');
  r2 := public.vault_status();
  perform pg_temp.ok((r2 ->> 'teen')::boolean, 'teen accounts are flagged so the game can say "Vault Challenge"');
  r := public.vault_start(); att := (r ->> 'attempt')::bigint;
  perform pg_temp.ok((r ->> 'teen')::boolean, 'attempt marked as a challenge');
  reset role;
  r := pg_temp.play(t, att, 'lose');
  perform pg_temp.ok(r ->> 'status' = 'failed' and (r ->> 'cooldownSecs')::int between 590 and 600 and not r ? 'jailSecs', 'teen fails the challenge: cooldown only, no arrest');
  perform pg_temp.ok(not exists (select 1 from public.jail where user_id = t), 'no jail row for a teen');
  perform pg_temp.as_user(t);
  perform pg_temp.fails('select public.vault_start()', 'vault_cooldown', 'teen must wait out the cooldown');
  perform public.enter_building('library_1', 'library');                -- not jailed: can still go anywhere
  reset role;
  update public.vault_cooldowns set until = now() - interval '1 second' where user_id = t;
  perform pg_temp.as_user(t); perform public.enter_building(hb, 'bank');
  r := public.vault_start(); att := (r ->> 'attempt')::bigint; reset role;
  select pocket into before_ from public.wallets where id = t;
  select amount into amt from public.vault_state where id = 'heritage';
  r := pg_temp.play(t, att, 'win');
  perform pg_temp.ok(r ->> 'status' = 'win' and (select pocket from public.wallets where id = t) = before_ + amt, 'teen can win the challenge and receives the vault');

  -- ---------------------------------------------------------------- ATM cap raised to hold a vault payout
  update public.wallets set pocket = 25000000 where id = b;
  perform pg_temp.as_user(b); perform public.enter_building(hb, 'bank');
  r := public.atm_deposit(25000000);
  perform pg_temp.ok((r ->> 'pocket')::bigint = 0, 'ATM can deposit a pocket bigger than ₦1m (vault payouts)');
  reset role;
  -- ---------------------------------------------------------------- stress: 60 random robberies, every puzzle kind gets played to the end
  perform pg_temp.as_user(c); perform public.enter_building(hb, 'bank'); reset role;
  update public.vault_cooldowns set until = now() - interval '1 second' where user_id = c;
  n := 0; cnt := 0;
  for i in 1..60 loop
    update public.vault_state set status = 'full', amount = private.vault_roll(), locked_by = null, lock_expires = null, attempt_id = null, refill_at = null where id = 'heritage';
    delete from public.vault_cooldowns where user_id = c; delete from public.jail where user_id = c;
    perform pg_temp.as_user(c); r := public.vault_start(); att := (r ->> 'attempt')::bigint; reset role;
    r := pg_temp.play(c, att, case when i % 2 = 0 then 'win' else 'lose' end);
    if i % 2 = 0 and r ->> 'status' = 'win' then n := n + 1; end if;
    if i % 2 = 1 and r ->> 'status' = 'caught' then cnt := cnt + 1; end if;
  end loop;
  perform pg_temp.ok(n = 30 and cnt = 30, 'stress: 30 of 30 solver runs win, 30 of 30 wrong-answer runs get caught');
  perform pg_temp.ok((select count(distinct p ->> 'kind') from public.vault_attempts, jsonb_array_elements(puzzles) p where user_id = c) = 6, 'stress: all 6 puzzle kinds appeared');
  raise notice 'ALL VAULT TESTS PASSED';
end $$;
