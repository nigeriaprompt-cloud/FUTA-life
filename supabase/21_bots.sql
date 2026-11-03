-- 21_bots.sql — "Campus bots": labelled, scripted, free helpers that make the game feel alive before there are many players.
-- Run in the Supabase SQL Editor AFTER 01_schema.sql … 20_forum.sql, then run 21b_bots_content.sql (the names, lines, scenes and guides). Safe to re-run.
--
-- WHAT THEY ARE (decided, see docs/BOTS.md):
--   • about 30 Nigerian-named accounts (male + female), flagged profiles.is_bot. The app draws a "BOT" badge + violet dot from THAT flag, so nobody can fake it by typing.
--   • NO AI and NO server: everything is plain SQL inside your Supabase project, run by pg_cron. Phones download nothing extra.
--   • they post on the Feed, drop Tutorial guides, talk to each other in Global chat (small "scenes"), accept waves, and REPLY when a real player
--     tags them in Global or sends them a personal message. Replies are picked from a library of lines by keyword (see private.bot_intent).
--   • one rule set for every age: bots only ever REPLY (never start a private chat), and every line they say is safe for a 13-year-old.
--   • they never touch money (the wallet guard below), never appear on rankings, never count as "online", and an admin switch turns them all off.
-- Admin switch (no code):  select public.admin_bots('<admin password>', 'off');   -- and 'on', 'status', 'log', 'bot_off:<username>', 'bot_on:<username>'
-- Tunables (app_config, no code):  bots.enabled (true) · bots.reply_per_hour (12 replies per player per hour)

-- ------------------------------------------------------------------ the flag + the roster
alter table public.profiles add column if not exists is_bot boolean not null default false;

create table if not exists public.bots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  gender text not null check (gender in ('f', 'm')),
  tone text not null default 'chill' check (tone in ('chill', 'jokes', 'serious', 'sporty')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.bots enable row level security;            -- no policy, no grant: only the functions below touch it

create table if not exists private.bot_lines    (id bigserial primary key, pack text not null, tone text, body text not null);
create table if not exists private.bot_feed     (id bigserial primary key, body text not null, bg text not null default 'sunset', used_at timestamptz);
create table if not exists private.bot_tutorials(id bigserial primary key, title text not null, category text not null, body text not null, used_at timestamptz);
create table if not exists private.bot_scenes   (scene text not null, step int not null, role int not null, body text not null, reply_step int, primary key (scene, step));
create table if not exists private.bot_state    (key text primary key, value jsonb);
create table if not exists private.bot_slots    (slot text not null, val text not null);      -- word lists that fill {place} {food} {course} {team} {drink} {game} {day} in any line, so one line reads many ways
create table if not exists private.bot_outbox   (id bigserial primary key, kind text not null check (kind in ('dm', 'global')), bot uuid not null, to_user uuid not null,
                                                 reply_to bigint, body text not null, due_at timestamptz not null, sent boolean not null default false, created_at timestamptz not null default now());
create table if not exists private.bot_handled  (kind text not null, ref bigint not null, primary key (kind, ref), at timestamptz not null default now());
create table if not exists private.bot_log      (id bigserial primary key, kind text not null, user_id uuid, body text, at timestamptz not null default now());
create index if not exists bot_outbox_due_idx on private.bot_outbox (due_at) where not sent;
create index if not exists bot_outbox_to_idx on private.bot_outbox (to_user, created_at desc);
revoke all on private.bot_slots, private.bot_lines, private.bot_feed, private.bot_tutorials, private.bot_scenes, private.bot_state, private.bot_outbox, private.bot_handled, private.bot_log from public, anon, authenticated;

-- ------------------------------------------------------------------ small helpers
create or replace function private.bots_on() returns boolean language sql stable set search_path = '' as $$
  select coalesce((select (value #>> '{}')::boolean from public.app_config where key = 'bots.enabled'), true) $$;

create or replace function private.is_bot(u uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_bot from public.profiles where id = u), false) $$;

-- the app asks "is this name a bot?" through this (it is public information, like the name itself); the RLS policy below uses it too
create or replace function public.is_bot_user(u uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.bots where user_id = u and active) $$;

create or replace function public.list_bots() returns table (username text) language sql stable security definer set search_path = '' as $$
  select b.username from public.bots b where b.active order by b.username $$;

-- bots are "in every age group" so they can talk to everyone; this one function is what Global tags, waves and DMs all ask
create or replace function private.same_age_group(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_bot(a) or private.is_bot(b)
      or (select is_teen from public.private_profiles where id = a) is not distinct from (select is_teen from public.private_profiles where id = b) $$;

drop policy if exists global_read on public.global_messages;
create policy global_read on public.global_messages for select to authenticated
  using ((teen is not distinct from (select q.is_teen from public.private_profiles q where q.id = auth.uid()) or public.is_bot_user(user_id))
         and not public.is_blocked_between(auth.uid(), user_id));

-- ------------------------------------------------------------------ nobody can fake a bot, and nobody can send a bot money
create or replace function private.profiles_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.is_bot is distinct from old.is_bot and auth.uid() is not null then raise exception 'not_allowed'; end if;     -- only you (SQL editor / cron) can make a bot
  if tg_op = 'INSERT' and new.is_bot and auth.uid() is not null then raise exception 'not_allowed'; end if;
  if new.username is not null and not new.is_bot and (tg_op = 'INSERT' or new.username is distinct from old.username)
     and (new.username ~ '^(admin|support|moderator|staff|official|system|security|futalife|futa_?bot|campus_?bot|bot[0-9_]|bot$)' or new.username ~ '(^|_)(bot|admin|official|staff|support)(_|[0-9]*$)') then
    raise exception 'That name is reserved.';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_trg on public.profiles;
create trigger profiles_guard_trg before insert or update on public.profiles for each row execute function private.profiles_guard();

create or replace function private.bot_wallet_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.pocket + new.bank) > (old.pocket + old.bank) and private.is_bot(new.id) then raise exception 'bots_cannot_receive_money'; end if;
  return new;
end $$;
drop trigger if exists bot_wallet_guard_trg on public.wallets;
create trigger bot_wallet_guard_trg before update on public.wallets for each row execute function private.bot_wallet_guard();

-- a wave at a bot is accepted at once (so the chat opens straight away) and the bot says hello a moment later
create or replace function private.bot_wave_trg() returns trigger language plpgsql security definer set search_path = '' as $$
declare un text; ln text;
begin
  if exists (select 1 from public.bots b where b.user_id = new.to_user and b.active) and private.bots_on() then
    new.status := 'accepted';
    select p.username into un from public.profiles p where p.id = new.from_user;
    ln := private.bot_line('wave', new.to_user, un, '{}');
    if ln is not null then
      insert into private.bot_outbox (kind, bot, to_user, body, due_at) values ('dm', new.to_user, new.from_user, ln, now() + make_interval(secs => 8 + floor(random() * 25)::int));
    end if;
  end if;
  return new;
end $$;
drop trigger if exists bot_wave_trg on public.waves;
create trigger bot_wave_trg before insert on public.waves for each row execute function private.bot_wave_trg();

-- ------------------------------------------------------------------ making a bot account
create or replace function private.bot_make(p_username text, p_gender text, p_tone text, p_dept text, p_level text, p_school text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare bid uuid := md5('futalife-bot:' || p_username)::uuid; nm text := p_username; av jsonb;
begin
  if exists (select 1 from public.profiles where username = nm and id <> bid) then nm := left(nm, 17) || '_ng'; end if;
  insert into auth.users (id, email) values (bid, 'bot+' || p_username || '@bots.invalid') on conflict (id) do nothing;
  begin   -- real Supabase columns: confirmed, cannot sign in, no NULL tokens (the test database has none of these)
    execute 'update auth.users set aud = ''authenticated'', role = ''authenticated'', email_confirmed_at = coalesce(email_confirmed_at, now()), banned_until = ''infinity'',
             confirmation_token = '''', recovery_token = '''', email_change_token_new = '''', email_change = '''' where id = $1' using bid;
  exception when undefined_column then null; end;
  insert into public.profiles (id) values (bid) on conflict do nothing;
  insert into public.private_profiles (id) values (bid) on conflict do nothing;
  insert into public.wallets (id) values (bid) on conflict do nothing;
  insert into public.player_stats (id) values (bid) on conflict do nothing;
  av := public.validate_avatar(jsonb_build_object('body', jsonb_build_object('frame', p_gender, 'height', 0.95 + random() * 0.1, 'build', random(), 'bust', random(), 'hips', random(), 'shoulders', random()),
                                                  'skin', 3 + floor(random() * 6)::int, 'face', jsonb_build_object('shape', floor(random() * 4)::int, 'eyes', floor(random() * 4)::int, 'nose', floor(random() * 3)::int, 'lips', floor(random() * 3)::int)));
  update public.profiles set username = nm, is_bot = true, avatar_json = av,
         campus = jsonb_strip_nulls(jsonb_build_object('status', 'student', 'school', p_school, 'dept', p_dept, 'level', p_level)) where profiles.id = bid;
  update public.private_profiles set dob = date '2001-01-01', is_teen = false, onboarded = true, accept_waves = true where private_profiles.id = bid;
  insert into public.bots (user_id, username, gender, tone) values (bid, nm, p_gender, p_tone)
    on conflict (user_id) do update set username = excluded.username, gender = excluded.gender, tone = excluded.tone;
  return bid;
end $$;

-- ------------------------------------------------------------------ what a bot says
-- {place} {food} {course} {team} {drink} {game} {day} in a text are replaced by a random word of that list (or by the value p_fixed already chose for it, so a whole chat scene stays consistent)
create or replace function private.bot_fill(p_text text, p_fixed jsonb default '{}'::jsonb) returns text language plpgsql stable set search_path = '' as $$
declare t text := coalesce(p_text, ''); m text; v text;
begin
  for m in select distinct x[1] from regexp_matches(t, '\{([a-z]+)\}', 'g') x loop
    continue when m = 'name';
    v := p_fixed ->> m;
    if v is null then select s.val into v from private.bot_slots s where s.slot = m order by random() limit 1; end if;
    if v is not null then t := replace(t, '{' || m || '}', v); end if;
  end loop;
  return t;
end $$;

-- one random line of a pack, in the bot's tone, with {name} and the slots filled in, never one of p_avoid (compared AFTER filling, so repeats are really avoided).
-- p_dress: sometimes put a short opener ("Haha,") in front and a closer (a 🙏 or "You got this.") at the end, which multiplies the number of different sentences.
create or replace function private.bot_line(p_pack text, p_bot uuid, p_name text, p_avoid text[], p_dress boolean default false) returns text language plpgsql stable set search_path = '' as $$
declare tn text; r text; c text; first text; op text; cl text; nm text := coalesce(nullif(p_name, ''), 'friend');
begin
  select tone into tn from public.bots where user_id = p_bot;
  for c in select l.body from private.bot_lines l where l.pack = p_pack and (l.tone is null or l.tone = tn) order by random() limit 80 loop
    c := private.bot_fill(replace(c, '{name}', nm));
    first := coalesce(first, c);
    if c <> all (coalesce(p_avoid, '{}'::text[])) then r := c; exit; end if;
  end loop;
  if r is null then   -- every candidate was used recently: take any line of the pack at all
    select private.bot_fill(replace(l.body, '{name}', nm)) into r from private.bot_lines l where l.pack = p_pack order by random() limit 1;
    r := coalesce(r, first);
  end if;
  if r is not null and p_dress then
    if random() < 0.35 then select l.body into op from private.bot_lines l where l.pack = 'open' order by random() limit 1; if op is not null and char_length(r) < 170 then r := op || ' ' || r; end if; end if;
    if random() < 0.30 then select l.body into cl from private.bot_lines l where l.pack = 'close' order by random() limit 1; if cl is not null and char_length(r) + char_length(cl) < 225 then r := r || ' ' || cl; end if; end if;
  end if;
  return r;
end $$;

-- which pack answers this message? first match wins, most important first
create or replace function private.bot_intent(p_text text) returns text language plpgsql immutable set search_path = '' as $$
declare t text := ' ' || lower(btrim(coalesce(p_text, ''))) || ' ';
begin
  if t ~ '(kill myself|suicid|end my life|end it all|want to die|wanna die|dont want to live|don''t want to live|no reason to live|cut myself|hurt myself|self.?harm|raped|molest|abuses me|abusing me|beats me|beating me)' then return 'crisis'; end if;
  if t ~ '(send me|give me|lend me|borrow|loan|transfer me|pay me|fund me|i need money|need some money|abeg.*(money|naira)|₦ ?[0-9]|[0-9] ?naira|account number)' then return 'money_ask'; end if;
  if t ~ '(are you (a |an )?(bot|real|human|robot|ai|person)|you.?re (a |an )?(bot|robot)|real person|is this a bot|talking to a (bot|human|robot)|who (made|built|created) you)' then return 'bot_q'; end if;
  if t ~ '(i love you|love you|be my (girl|boy)friend|girlfriend|boyfriend|date me|kiss|sex|nude|naked|horny|sexy|hook ?up|sugar (daddy|mummy|mommy)|send pic|your pic|crush on)' then return 'romance'; end if;
  if t ~ '(stupid|idiot|fool|useless|mumu|dumb|shut up|bastard|rubbish|nonsense)' then return 'insult'; end if;
  if t ~ '(depress|lonely|crying|homesick|miss home|anxious|anxiety|overwhelm|hopeless|worthless|heartbreak|broke up|heartbroken| sad |feel low|no friends|feeling down|cant cope|can.t cope)' then return 'sad'; end if;
  if t ~ '(exam|carryover|cgpa|gpa|result|resit|assignment|lecturer|lecture|attendance|defence|siwes|quiz|semester|test |course reg|timetable|study|reading|textbook|past question)' then return 'exam'; end if;
  if t ~ '(thank|thanks|thx|tnx|appreciate)' then return 'thanks'; end if;
  if t ~ '( bye|goodnight|good night|see you|catch you|ttyl|gtg|later )' then return 'bye'; end if;
  if t ~ '(^ ?(hi|hello|hey|yo|sup|wassup|howdy)\M|good (morning|afternoon|evening)|how far|hw far|wetin dey|how you dey|how u dey|how are you|how.s it going|what.s up)' then return 'greet'; end if;
  if t ~ '(money|broke|allowance|naira|budget|school fees|data |airtime|feeding|upkeep|savings|hustle|side ?gig|pocket|debt)' then return 'money_talk'; end if;
  if t ~ '(hostel|roommate|room ?mate|bunk|bed ?space|landlord|rent |off.?campus|mattress|bucket|bathroom|noise)' then return 'hostel'; end if;
  if t ~ '(light|nepa|power|current|phcn|blackout|generator|charging|battery|power ?bank|voltage)' then return 'light'; end if;
  if t ~ '(food|hungry|jollof|rice|buka|indomie|beans|amala|suya|snack|cafeteria|cook|bread|chicken|eat )' then return 'food'; end if;
  if t ~ '(football|dls|efootball|e-?football|arsenal|chelsea|liverpool|man ?city|man ?u|barca|madrid|premier league|epl|champions league|ucl|super eagles|fifa|pes |squad)' then return 'football'; end if;
  if t ~ '(arcade|campus dash|score|feed|tutorial|forum|channel|atm|map|phone|app |building|wave|game)' then return 'game_app'; end if;
  if t ~ '(friend|bestie|link ?up|hang ?out|party|gist|church|mosque|fellowship|society|weekend|movie|music|burna|wizkid|davido|asake|dance|vibe)' then return 'social'; end if;
  if t ~ '(how (do|can|to)|where (is|can)|help me|can you help|what (is|are)|which )' then return 'help'; end if;
  return 'default';
end $$;

-- the reply to one message: returns the text (and the pack name through p_pack)
create or replace function private.bot_reply(p_bot uuid, p_to uuid, p_text text, out p_pack text, out p_body text) language plpgsql security definer set search_path = '' as $$
declare un text; recent text[]; extra text;
begin
  select username into un from public.profiles where id = p_to;
  select coalesce(array_agg(o.body), '{}') into recent from (select body from private.bot_outbox where to_user = p_to order by id desc limit 30) o;
  p_pack := private.bot_intent(p_text);
  p_body := private.bot_line(p_pack, p_bot, un, recent, p_pack in ('exam', 'money_talk', 'hostel', 'light', 'food', 'football', 'game_app', 'social', 'help', 'default', 'thanks', 'bye'));
  if p_pack in ('greet', 'default', 'social', 'thanks') and random() < 0.5 then
    extra := private.bot_line('ask', p_bot, un, recent);
    if extra is not null and p_body is not null then p_body := left(p_body, 150) || ' ' || extra; end if;
  end if;
  if p_pack in ('crisis', 'default') then insert into private.bot_log (kind, user_id, body) values (case p_pack when 'crisis' then 'crisis' else 'unmatched' end, p_to, left(p_text, 300)); end if;
end $$;

-- ------------------------------------------------------------------ posting as a bot (no limits, no rewards — bots earn nothing)
create or replace function private.bot_global(p_bot uuid, p_body text, p_reply_to bigint default null, p_to uuid default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare nm text; rn text; rb text; nid bigint; tn text; txt text := left(btrim(p_body), 240);
begin
  select username into nm from public.profiles where id = p_bot;
  if nm is null or txt = '' then return null; end if;
  if p_reply_to is not null then select g.username, left(g.body, 80) into rn, rb from public.global_messages g where g.id = p_reply_to; end if;
  if p_to is not null then select username into tn from public.profiles where id = p_to; end if;
  insert into public.global_messages (user_id, username, teen, body, reply_to, reply_name, reply_body, mentions)
    values (p_bot, nm, false, txt, case when rn is null then null else p_reply_to end, rn, rb, case when tn is null then '{}' else array[tn] end) returning id into nid;
  if p_to is not null and not exists (select 1 from public.blocks x where (x.blocker = p_to and x.blocked = p_bot) or (x.blocker = p_bot and x.blocked = p_to)) then
    insert into public.notifications (user_id, kind, from_user, title, body, app, ref)
      values (p_to, 'info', p_bot, '@' || nm || ' replied to you in Global', left(txt, 120), 'global', nid);
  end if;
  update public.bots set active = active where user_id = p_bot;
  return nid;
end $$;

create or replace function private.bot_dm(p_bot uuid, p_to uuid, p_body text) returns bigint language plpgsql security definer set search_path = '' as $$
declare nid bigint;
begin
  if exists (select 1 from public.blocks x where (x.blocker = p_to and x.blocked = p_bot) or (x.blocker = p_bot and x.blocked = p_to)) then return null; end if;
  insert into public.dms (sender, recipient, body) values (p_bot, p_to, left(btrim(p_body), 240)) returning id into nid;
  return nid;
end $$;

create or replace function private.bot_pick(p_not uuid[] default '{}') returns uuid language sql stable set search_path = '' as $$
  select b.user_id from public.bots b where b.active and b.user_id <> all (p_not) order by random() limit 1 $$;

-- ------------------------------------------------------------------ the minute tick: scenes, feed posts, guides
create or replace function private.bot_tick() returns void language plpgsql security definer set search_path = '' as $$
declare
  h int := coalesce((select (value #>> '{}')::int from public.app_config where key = 'bots.force_hour'), extract(hour from now() at time zone 'Africa/Lagos')::int); st jsonb; nxt timestamptz; sc text; s record; ids jsonb; roles jsonb; bt uuid; rid bigint; chance numeric;
  f record; t record; used int; live int; recent jsonb; nb int; real_n int; pace numeric; slots jsonb; sm text; fb text;
begin
  if not private.bots_on() then return; end if;

  -- 1) Global chat "scenes": a short back-and-forth between 2–3 bots
  select value into st from private.bot_state where key = 'scene';
  if st is not null and st <> 'null'::jsonb then
    if (st ->> 'next_at')::timestamptz <= now() then
      select * into s from private.bot_scenes where scene = st ->> 'scene' and step = (st ->> 'step')::int + 1;
      if not found then
        delete from private.bot_state where key = 'scene';
        insert into private.bot_state (key, value) values ('next_scene_at', to_jsonb(now() + make_interval(mins => case when h between 8 and 22 then 8 + floor(random() * 22)::int else 30 + floor(random() * 60)::int end)))
          on conflict (key) do update set value = excluded.value;
      else
        bt := (st -> 'bots' ->> (s.role - 1))::uuid; ids := coalesce(st -> 'ids', '{}'::jsonb);
        rid := case when s.reply_step is null then null else (ids ->> s.reply_step::text)::bigint end;
        rid := private.bot_global(bt, private.bot_fill(s.body, st -> 'slots'), rid, null);
        ids := ids || jsonb_build_object(s.step::text, rid);
        update private.bot_state set value = st || jsonb_build_object('step', s.step, 'ids', ids, 'next_at', now() + make_interval(secs => 25 + floor(random() * 80)::int)) where key = 'scene';
      end if;
    end if;
  else
    select (value #>> '{}')::timestamptz into nxt from private.bot_state where key = 'next_scene_at';
    chance := case when h between 0 and 5 then 0.03 when h between 6 and 7 then 0.3 when h between 8 and 21 then 0.7 else 0.3 end;
    -- real players first: when people are already chatting in Global the bots keep quiet (this also makes the library last 3-5 times longer)
    select count(*) into real_n from public.global_messages g where g.created_at > now() - interval '20 minutes' and not exists (select 1 from public.bots b where b.user_id = g.user_id);
    pace := case when real_n >= 8 then 0 when real_n >= 3 then 0.4 else 1 end;
    if (nxt is null or nxt <= now()) and random() < chance * pace then
      select coalesce(value, '[]'::jsonb) into recent from private.bot_state where key = 'recent_scenes';
      select scene into sc from (select distinct scene from private.bot_scenes) x where not (coalesce(recent, '[]'::jsonb) ? scene) order by random() limit 1;
      if sc is null then delete from private.bot_state where key = 'recent_scenes'; recent := '[]'::jsonb;
        select scene into sc from (select distinct scene from private.bot_scenes) x order by random() limit 1; end if;
      if sc is not null then
        select max(role) into nb from private.bot_scenes where scene = sc;
        roles := '[]'::jsonb;
        for i in 1..coalesce(nb, 2) loop
          bt := private.bot_pick(coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(roles) x), '{}'::uuid[]));
          roles := roles || to_jsonb(bt::text);
        end loop;
        slots := '{}'::jsonb;      -- one word per {slot} for the WHOLE scene, so "the {food} is finished" and "try {food} at the gate" agree
        for sm in select distinct x[1] from private.bot_scenes b, regexp_matches(b.body, '\{([a-z]+)\}', 'g') x where b.scene = sc and x[1] <> 'name' loop
          slots := slots || jsonb_build_object(sm, (select val from private.bot_slots where slot = sm order by random() limit 1));
        end loop;
        insert into private.bot_state (key, value) values ('scene', jsonb_build_object('scene', sc, 'step', 0, 'bots', roles, 'ids', '{}'::jsonb, 'slots', slots, 'next_at', now()))
          on conflict (key) do update set value = excluded.value;
        insert into private.bot_state (key, value) values ('recent_scenes', (coalesce(recent, '[]'::jsonb) || to_jsonb(sc)))
          on conflict (key) do update set value = excluded.value;
      end if;
    end if;
    -- sometimes just one bot says something on its own
    if (select coalesce((value #>> '{}')::timestamptz, now() - interval '1 day') from private.bot_state where key = 'next_ambient_at') <= now() or not exists (select 1 from private.bot_state where key = 'next_ambient_at') then
      if h between 7 and 23 and real_n < 3 and random() < 0.4 then
        bt := private.bot_pick(); perform private.bot_global(bt, private.bot_line('ambient', bt, null, '{}'));
      end if;
      insert into private.bot_state (key, value) values ('next_ambient_at', to_jsonb(now() + make_interval(mins => 30 + floor(random() * 60)::int)))
        on conflict (key) do update set value = excluded.value;
    end if;
  end if;

  -- 2) a Feed post every 1½–3½ hours (daytime), never more than 8 bot posts live
  select (value #>> '{}')::timestamptz into nxt from private.bot_state where key = 'next_feed_at';
  if (nxt is null or nxt <= now()) and h between 7 and 23 then
    select count(*) into live from public.feed_posts p join public.bots b on b.user_id = p.user_id where p.expires_at > now();
    if live < 8 then
      select * into f from private.bot_feed order by used_at nulls first, random() limit 1;       -- least recently used first: nothing repeats until everything has been used
      if found then
        fb := private.bot_fill(f.body);
        if not exists (select 1 from public.feed_posts x where x.body_hash = md5(lower(fb)) and x.expires_at > now()) then
          bt := private.bot_pick();
          insert into public.feed_posts (user_id, username, body, bg, body_hash) values (bt, (select username from public.profiles where id = bt), fb, f.bg, md5(lower(fb)));
        end if;
        update private.bot_feed set used_at = now() where id = f.id;
      end if;
    end if;
    insert into private.bot_state (key, value) values ('next_feed_at', to_jsonb(now() + make_interval(mins => 90 + floor(random() * 120)::int)))
      on conflict (key) do update set value = excluded.value;
  end if;

  -- 3) a Tutorial guide: two straight away on a fresh install, then one every 24–48 hours until the library is used up
  select (value #>> '{}')::timestamptz into nxt from private.bot_state where key = 'next_tut_at';
  if (nxt is null or nxt <= now()) then
    select * into t from private.bot_tutorials where used_at is null and not exists (select 1 from public.bulletins x where x.kind = 'tutorial' and not x.hidden and lower(x.title) = lower(private.bot_tutorials.title)) order by random() limit 1;
    if found then
      bt := private.bot_pick();
      insert into public.bulletins (kind, user_id, username, category, title, body, body_hash) values ('tutorial', bt, (select username from public.profiles where id = bt), t.category, t.title, t.body, md5(lower(t.body)));
      update private.bot_tutorials set used_at = now() where id = t.id;
    end if;
    select count(*) into used from private.bot_tutorials where used_at is not null;
    insert into private.bot_state (key, value) values ('next_tut_at', to_jsonb(now() + case when used < 3 then interval '3 minutes' else make_interval(hours => 24 + floor(random() * 24)::int) end))
      on conflict (key) do update set value = excluded.value;
  end if;
end $$;

-- ------------------------------------------------------------------ the 15-second inbox: waves, personal messages, Global tags -> replies
create or replace function private.bot_queue(p_kind text, p_bot uuid, p_to uuid, p_text text, p_ref bigint) returns void language plpgsql security definer set search_path = '' as $$
declare cap int := coalesce((select (value #>> '{}')::int from public.app_config where key = 'bots.reply_per_hour'), 12); n int; r record; delay int; gb text;
begin
  select count(*) into n from private.bot_outbox where to_user = p_to and created_at > now() - interval '1 hour';
  if n >= cap then
    if n = cap then    -- say it once, kindly, then go quiet until the hour is up
      insert into private.bot_outbox (kind, bot, to_user, reply_to, body, due_at) values (p_kind, p_bot, p_to, p_ref, coalesce(private.bot_line('busy', p_bot, (select username from public.profiles where id = p_to), '{}'), 'Let me catch my breath, talk soon!'), now() + interval '10 seconds');
    end if;
    return;
  end if;
  select * into r from private.bot_reply(p_bot, p_to, p_text);
  if r.p_body is null then return; end if;
  delay := case r.p_pack when 'crisis' then 4 + floor(random() * 8)::int else 20 + floor(random() * 100)::int end;
  gb := case when p_kind = 'global' then '@' || (select username from public.profiles where id = p_to) || ' ' || left(r.p_body, 200) else r.p_body end;
  insert into private.bot_outbox (kind, bot, to_user, reply_to, body, due_at) values (p_kind, p_bot, p_to, p_ref, gb, now() + make_interval(secs => delay));
end $$;

create or replace function private.bot_send_due() returns void language plpgsql security definer set search_path = '' as $$
declare o record;
begin
  for o in select * from private.bot_outbox where not sent and due_at <= now() order by due_at limit 40 for update skip locked loop
    update private.bot_outbox set sent = true where id = o.id;
    if o.kind = 'dm' then perform private.bot_dm(o.bot, o.to_user, o.body);
    else perform private.bot_global(o.bot, o.body, o.reply_to, o.to_user); end if;
  end loop;
end $$;

create or replace function private.bot_inbox() returns void language plpgsql security definer set search_path = '' as $$
declare d record; n record;
begin
  if not private.bots_on() then return; end if;
  -- personal messages: answer the LATEST unanswered one of each conversation
  for d in
    select distinct on (m.sender, m.recipient) m.id, m.sender, m.recipient, m.body
      from public.dms m join public.bots b on b.user_id = m.recipient and b.active
     where m.created_at > now() - interval '3 hours' and not private.is_bot(m.sender)
       and not exists (select 1 from private.bot_handled h where h.kind = 'dm' and h.ref = m.id)
     order by m.sender, m.recipient, m.id desc limit 30
  loop
    insert into private.bot_handled (kind, ref) select 'dm', m.id from public.dms m where m.sender = d.sender and m.recipient = d.recipient and m.created_at > now() - interval '3 hours' on conflict do nothing;
    perform private.bot_queue('dm', d.recipient, d.sender, d.body, null);
  end loop;
  -- Global tags / replies: the existing notification row is the trigger
  for n in
    select x.id, x.user_id as bot, x.from_user, x.ref, g.body
      from public.notifications x join public.bots b on b.user_id = x.user_id and b.active join public.global_messages g on g.id = x.ref
     where x.app = 'global' and x.read_at is null and x.created_at > now() - interval '3 hours' and x.from_user is not null and not private.is_bot(x.from_user)
     order by x.id limit 30
  loop
    update public.notifications set read_at = now() where id = n.id;
    if not exists (select 1 from private.bot_handled h where h.kind = 'global' and h.ref = n.ref) then
      insert into private.bot_handled (kind, ref) values ('global', n.ref) on conflict do nothing;
      perform private.bot_queue('global', n.bot, n.from_user, n.body, n.ref);
    end if;
  end loop;
  update public.notifications set read_at = now() where app = 'global' and read_at is null and user_id in (select user_id from public.bots) and created_at <= now() - interval '3 hours';
  perform private.bot_send_due();
end $$;

create or replace function private.bot_cleanup() returns void language sql security definer set search_path = '' as $$
  delete from private.bot_handled where at < now() - interval '2 days';
  delete from private.bot_outbox where created_at < now() - interval '2 days';
  delete from private.bot_log where at < now() - interval '30 days';
  delete from public.notifications where user_id in (select user_id from public.bots) and created_at < now() - interval '1 day';
$$;

-- ------------------------------------------------------------------ admin switch (same password as the admin dashboard)
create or replace function public.admin_bots(p_password text, p_action text default 'status') returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); pwh text; fails int; ok boolean; a text := lower(coalesce(p_action, 'status')); nm text; n int;
begin
  if u is null then raise exception 'auth_required'; end if;
  select count(*) into fails from private.admin_attempts where user_id = u and at > now() - interval '15 minutes';
  if fails >= 5 then return jsonb_build_object('ok', false, 'error', 'locked'); end if;
  select pw_hash into pwh from private.admin_secret where id = 1;
  ok := pwh is not null and p_password is not null and length(p_password) <= 200 and extensions.crypt(p_password, pwh) = pwh;
  if not ok then insert into private.admin_attempts (user_id) values (u); return jsonb_build_object('ok', false, 'error', 'bad_password'); end if;
  delete from private.admin_attempts where user_id = u;
  if a = 'on' then insert into public.app_config (key, value) values ('bots.enabled', 'true') on conflict (key) do update set value = excluded.value;
  elsif a = 'off' then insert into public.app_config (key, value) values ('bots.enabled', 'false') on conflict (key) do update set value = excluded.value;
  elsif a like 'bot_off:%' or a like 'bot_on:%' then
    nm := split_part(a, ':', 2); update public.bots set active = (a like 'bot_on:%') where username = nm; get diagnostics n = row_count;
    if n = 0 then return jsonb_build_object('ok', false, 'error', 'no_such_bot'); end if;
  end if;
  return jsonb_build_object('ok', true, 'enabled', private.bots_on(), 'bots', (select count(*) from public.bots where active), 'botsOff', (select coalesce(jsonb_agg(username), '[]'::jsonb) from public.bots where not active),
    'repliesSent24h', (select count(*) from private.bot_outbox where sent and created_at > now() - interval '1 day'),
    'crisis24h', (select count(*) from private.bot_log where kind = 'crisis' and at > now() - interval '1 day'),
    'log', case when a = 'log' then coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'who', (select username from public.profiles where id = l.user_id), 'text', body, 'at', at) order by id desc)
                                              from (select * from private.bot_log order by id desc limit 40) l), '[]'::jsonb) else null end);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on public.bots from anon, authenticated;
revoke execute on function public.list_bots(), public.is_bot_user(uuid), public.admin_bots(text, text) from public, anon;
grant execute on function public.list_bots(), public.is_bot_user(uuid), public.admin_bots(text, text) to authenticated;

-- ------------------------------------------------------------------ schedule (needs the pg_cron extension: Dashboard > Database > Extensions > pg_cron, then re-run this file)
do $$ begin
  begin create extension if not exists pg_cron; exception when others then raise notice 'pg_cron is not available here: enable it in Dashboard > Database > Extensions, then run this file again'; end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('bots-tick', 'bots-inbox', 'bots-cleanup');
    perform cron.schedule('bots-tick', '* * * * *', 'select private.bot_tick()');
    begin perform cron.schedule('bots-inbox', '15 seconds', 'select private.bot_inbox()');
    exception when others then perform cron.schedule('bots-inbox', '* * * * *', 'select private.bot_inbox()'); end;
    perform cron.schedule('bots-cleanup', '23 * * * *', 'select private.bot_cleanup()');
  end if;
end $$;
