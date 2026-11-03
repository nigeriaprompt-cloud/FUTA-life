# Admin: send money to one player or to all players

**Where:** `/admin` → the **💸 Send money** card (above the metric tiles). **Files:** `supabase/26_admin_send_money.sql` (+ `supabase/tests/test_admin_money.sql`), `public/admin/index.html`.
**Setup:** run `26_admin_send_money.sql` once in the Supabase SQL Editor (after 14, 17 and 18_celebrations; or paste `ALL_IN_ONE.sql` again). Safe to re-run.

## How to use it
1. Open `/admin` (signed in to the game), type the admin password.
2. Pick **One player** (type the username, with or without `@`) or **All players**.
3. Type the amount in whole naira (or tap ₦1,000 / 5,000 / 10,000 / 50,000 / 100,000) and an optional note (80 characters, shown in the player's phone alert).
4. **Review** shows exactly what will happen ("Send ₦5,000 to @tola_ade" or "₦1,000 to EACH of 120 players, ₦120,000 in total"). **Yes, send it** pays. Nothing is paid before that.
5. **Recent sends** lists the last 15 sends (when, to whom, each, total).

## What the player gets
The money is **added to the player's bank** (not taken from anybody; the admin creates it), the same place feed rewards go, so they withdraw it at an ATM. The phone shows the usual money pop-down "FUTAlife sent you ₦5,000" (with the note), even while the phone is hidden, plus the red number on Chat. "All players" = everyone who finished sign-up (has a username and a wallet); players who have not finished are skipped.

## Safety rules (all enforced by the server, never by the page)
- Signed in **and** the admin password, checked on every call (`private.admin_gate`: 5 wrong tries in 15 minutes = locked for the rest of the 15 minutes). Players cannot call these functions without the password, and cannot read the audit table.
- Whole naira only, at least 1. Ceilings (change without code, see below): **₦10,000,000** per player for a one-player send, **₦1,000,000** per player for an all-players send.
- "All players": the page sends the player count it showed you; if the count changed in between, nothing is sent (`count_changed`). A second "all players" send within 60 seconds is refused (`slow_down`), so a double tap can never pay everybody twice.
- The whole send is one database transaction: everybody is paid or nobody is.
- Every payment is a `public.ledger` row (kind `admin_grant`, ref `admin:<id>`) and every send is one row in `public.admin_grants` (who, scope, amount, number of players, total, note, time). Audit: `select * from public.admin_grants order by id desc;`

## Change the ceilings
```sql
insert into public.app_config(key,value) values ('admin_money.max_single','20000000') on conflict (key) do update set value = excluded.value;
insert into public.app_config(key,value) values ('admin_money.max_all','2000000') on conflict (key) do update set value = excluded.value;
```

## Functions (all `security definer`, granted to signed-in players but useless without the password)
`admin_money_preview(p_password)` · `admin_send_money(p_password, p_username, p_amount, p_note)` · `admin_send_money_all(p_password, p_amount, p_expected, p_note)` · `admin_money_history(p_password)`. Errors come back as `{ok:false, error:…}`: `bad_password`, `locked`, `bad_amount`, `too_much`, `too_long`, `player_not_found`, `count_changed`, `slow_down`, `no_players`.

## Tests
`supabase/tests/run.sh` (SQL: 34 checks in `test_admin_money.sql`: wrong password pays nothing, anon refused, per-player and all-players totals match ledger and alerts, unfinished players skipped, ceilings, double-send guard) · `node tools/test/admin-money.js` (the card in demo mode at phone and desktop width: validation, review/confirm, history, no sideways scroll, no page errors).
