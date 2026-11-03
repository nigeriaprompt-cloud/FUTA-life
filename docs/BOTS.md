# Campus bots (labelled, scripted, free)

Thirty Nigerian-named accounts (15 female, 15 male) that make the game feel alive before there are many players. **They are labelled** (a violet dot + `BOT` badge everywhere their name shows), they run **inside your Supabase database** (no server, no AI, no extra cost) and they add **nothing** for a player's phone to download.

## What they do
| Where | What a bot does |
|---|---|
| **Feed** | posts a short tip/thought every 1½–3½ hours in the daytime (144 posts in rotation, never more than 8 bot posts live; each expires after 24 h like any post; no reward is paid) |
| **Tutorial** | drops a ready-made guide: two straight after install, then one every 24–48 hours until the 30 guides are used (add more in `tools/bots/build-content.py`) |
| **Global chat** | 68 short "scenes" (library, food, NEPA, exams, DLS, freshers, scams…) played between 2–3 bots with threaded replies, plus a lone message now and then (74 one-liners). Busy by day, nearly silent from midnight to 5 a.m. (Lagos), and **quiet whenever real players are chatting** |
| **Waves** | a wave at a bot is accepted at once, and the bot says hello a few seconds later |
| **Personal messages** | replies to the **latest** message of a conversation after a 20–120 s "human" delay (4–12 s for a crisis message) |
| **Global tags** | when a player tags `@tolu_ade` or replies to a bot, it answers in Global, threaded, tagging the player back |

Bots **only reply**: they never start a private chat. Every line is safe for a 13-year-old, so **the same rules apply at every age** (a teen can wave at and talk to a bot, and sees the bots in the teen Global chat). The normal rule that keeps real teens and real adults apart is unchanged.

## How a reply is chosen (no AI)
`private.bot_intent(text)` matches the message against keyword lists, **most important first**: crisis → money request → "are you a bot?" → romance → insult → sad → exams → thanks → bye → greeting → money talk → hostel → light (NEPA) → food → football/DLS → the game's apps → friends/social → "how do I…" → default. Then `private.bot_line(pack, bot, name, avoid)` picks a random line of that pack in the bot's tone (`chill`, `jokes`, `serious`, `sporty`), never repeating the last 8 lines sent to that person. ~400 lines in 25 packs, with random openers ("Haha,") and closers ("🙏", "You've got this.") mixed in and word slots (below).

Safety behaviour (all in the data, easy to edit):
* **crisis words** (self-harm, abuse…): a short, caring message pointing to a trusted person, a counsellor and local emergency services; answered within seconds; the message is logged for the admin. The bot never plays therapist.
* **money request**: politely declined; reminds the player never to share bank details.
* **romance / flirting**: deflected; "I'm a bot, let's keep it friendly".
* **"are you a bot?"**: always answers honestly: yes.
* **unknown text**: asks for more, and is logged (`unmatched`) so you can see what the library is missing.
* **limit**: 12 bot replies per player per hour (`bots.reply_per_hour`), then one polite "let me catch my breath" and silence until the hour is up.

## Why it does not run out quickly
The library is built to stretch, not just to be big:
* **Word slots.** A line can contain `{food}` `{place}` `{course}` `{team}` `{drink}` `{game}` `{day}` (also `{food2}` `{team2}` for a second, different word). The word is picked when the line is sent, and a chat scene keeps **one** word per slot for all its lines. 28 of the 68 scenes and many Feed posts use slots, which gives about **2,800 scene variants and 1,100 Feed variants** instead of 68 and 144.
* **Openers and closers.** Replies on chatty topics get a random opener and/or closer (35% / 30% of the time), so one pack produces dozens of different sentences.
* **No repeats to the same person.** A bot never sends a line that any bot sent to that person in their last 30 bot messages (compared *after* the name and slots are filled in).
* **Rotation, not random.** Feed posts and scenes are used least-recently-first, so nothing repeats until everything has been used once.
* **Slow pace.** Scenes every ~8–30 minutes by day (not every few minutes), a Feed post every 1½–3½ hours, a lone message every 30–90 minutes.
* **Real players first.** When 3+ real messages arrived in Global in the last 20 minutes the bots speak less, and with 8+ they stay silent. The busier the real chat, the longer the library lasts, and the less the bots are needed.
Rough numbers: every scene plays about once every 1½–2 days at the start (and the words differ when it plays again), every Feed post about once every 3 weeks, the guides last 1½–2 months. It still is a finite script, so top it up now and then:
* look at `select public.admin_bots('<admin password>', 'log');` to see what people say that the bots do not understand, and write lines for it;
* add content in `tools/bots/content_more.py` / `content_more2.py` (or `build-content.py`) and re-run the build; **or add a line live, with no deploy**, e.g.
  `insert into private.bot_lines (pack, tone, body) values ('exam', null, 'Sleep early tonight, {name}. Your brain needs it.');`
  `insert into private.bot_feed (body, bg) values ('A new tip about {course}…', 'ocean');`
  `insert into private.bot_slots (slot, val) values ('food', 'ofada rice and ayamase');`
* an optional free-AI fallback (below) can be added later for the messages the scripts cannot match.

## Nobody can fake a bot, nobody can pay one
* The badge and dot come from `profiles.is_bot`, which **only you** (SQL editor/cron) can set (a trigger and the table grants refuse everyone else). The phone asks the server `list_bots()` once after sign-in and draws the badge itself, so typing "🤖" or "BOT" in a name or message gives nothing.
* Names that look like bots or staff (`campus_bot`, `futa_bot`, `official_x`, `support`, `admin…`, `bot_1`…) are refused for normal players (`private.profiles_guard`). Ordinary names that merely contain the letters (`robotics_x`) are fine.
* A bot wallet **cannot go up** (trigger `bot_wallet_guard`): sending money to a bot is refused with `bots_cannot_receive_money`. In a bot chat the app also hides the "₦ Send money" button and shows "Campus bot: replies are automated. Never share your password or bank details."
* Bots never play the Arcade, never appear on rankings, and are never counted in "N online" (that counter is presence from real phones).

## Install (Supabase)
1. Dashboard → **Database → Extensions → enable `pg_cron`** (free).
2. SQL Editor: run `supabase/21_bots.sql`, then `supabase/21b_bots_content.sql` (or just re-run `ALL_IN_ONE.sql`). Safe to re-run; re-running the content file replaces the library and keeps the bots and anything they already posted.
3. Done. After about a minute the first bot posts and a Tutorial guide appear. If `pg_cron` was not enabled, the file prints a notice: enable it and run `21_bots.sql` again.

Jobs it creates: `bots-tick` (every minute: chat scenes, feed posts, guides), `bots-inbox` (every 15 s: waves, messages, tags → replies; falls back to every minute on older pg_cron) and `bots-cleanup` (hourly).

## Admin (no code)
Use the same password as the admin dashboard, signed in as any player:
```sql
select public.admin_bots('<admin password>', 'status');            -- on/off, how many bots, replies in the last 24 h, crisis messages in the last 24 h
select public.admin_bots('<admin password>', 'off');               -- ALL bots go silent at once (also stops replies)
select public.admin_bots('<admin password>', 'on');
select public.admin_bots('<admin password>', 'bot_off:tolu_ade'); -- one bot only ('bot_on:tolu_ade' to bring it back)
select public.admin_bots('<admin password>', 'log');               -- the last 40 crisis / unmatched messages (who, text, when)
```
(From the SQL editor you can also just `update public.app_config set value='false' where key='bots.enabled'`.) Tunables in `app_config` (no code): `bots.enabled` (true), `bots.reply_per_hour` (12).

## Editing the words
All content lives in **`tools/bots/build-content.py`** (roster, reply lines per pack and tone, feed posts, chat scenes, tutorial guides, with the rules at the top). Edit (the extra lines live in `content_more.py` and `content_more2.py`, loaded by the build script), run `python3 tools/bots/build-content.py`, then run the regenerated `supabase/21b_bots_content.sql` in the SQL Editor. Add a new reply pack by adding a regex to `private.bot_intent` in `21_bots.sql` and a `P('mypack', …)` block in the python file.

## Privacy note (put one line in your privacy text)
Messages a player sends **to a bot** that the bot did not understand, and crisis messages, are kept for 30 days in `private.bot_log` so the admin can improve the bot and follow up on safety. Only the admin function can read them. Suggested wording: *"Messages you send to campus bots may be reviewed to improve them and keep players safe."*

## What was changed in existing SQL
`21_bots.sql` redefines three existing objects (re-run it after re-running `01_schema.sql` / `18_global_chat.sql`): `private.same_age_group` (true when either side is a bot; used by Global tags, waves, DMs, search), the RLS policy `global_read` on `global_messages` (a bot's messages are visible to both age groups) and it adds triggers on `profiles`, `wallets` and `waves`. `profiles` gains the column `is_bot`.

## Cost / load
No AI, no API key, no paid service. One tiny `select` every minute, one every 15 s for the inbox, a few small inserts per hour; old bot rows are cleaned hourly. Players download no new file except the ~1 KB of badge code in `phone.js`. Realtime: bot messages reach phones the same way real ones do.
**Free Supabase projects pause after ~1 week with no activity.** Real players keep it awake; check the project before launch week.

## Later (not built, on purpose)
An optional AI fallback for messages the scripts cannot match (`unmatched` log shows how often that is). It would be an Edge Function called only from `private.bot_queue`, switched off by default, with a timeout and a script fallback; check the provider's free-tier data terms first (student private chats, under-18s).

## Tests
* SQL: `supabase/tests/test_bots.sql` (93 checks across roster, anti-fake guards, waves, intents, replies, delays, crisis, caps, Global threading, wallet guard, scheduler, night quiet, slots and variety (no repeats, scene consistency, no unfilled slot), real-player quiet mode, feed rotation, admin switch, cleanup); it runs at the end of `supabase/tests/run.sh`.
* Browser: `node tools/test/bots-phone.js outdir` (real phone + fake Supabase: badge only on bot names in Global, Feed, Tutorial and chat; violet dot; no "Send money" in a bot chat).
