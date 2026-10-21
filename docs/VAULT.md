# Bank vault + jail

Only **the Bank** (formerly labelled "Heritage Bank"; renamed to avoid clashing with a real bank; map building `building_mv0q4b841p`) has a vault door; it keeps its ATMs. Wema, First Bank and UBA are plain ATM banks.

## Rules
- Hard mode: the player takes the WHOLE vault. Hidden amount ₦7,000,000–₦14,000,000 (60% ₦7–10m, 30% ₦10–12.5m, 10% ₦12.5–14m) (integers), paid to the **pocket** (ledger kind `vault_heist`), then deposited at an ATM. Players see "vault full", never the amount.
- 3 random puzzles from 6 (code lock, number safe-cracker, wire cutting, pattern, light memory, key-card match) share one countdown (120 s) and 2 strikes. Time or strikes out = arrested.
- The server picks puzzles and keeps answers. The browser only sees clues; guessing and light puzzles are answered one step at a time.
- Vault locks for the one robber ("robbery in progress"). On failure it unlocks, still full. After a success it is empty and refills with a new random amount after 20 minutes (lazy settlement in `vault_tick`, no cron).
- Personal cooldown after a win: 3 h. Roll is "mostly medium, sometimes huge".
- Jail: 3 minutes, animated cell scene (`jail.js`) with a release countdown. While jailed, `enter_building`, ATM and `do_activity` raise `in_jail`.
- Under 18: called "Vault Challenge", same puzzles, no arrest, only a 10-minute cooldown after failing.

## Where the numbers live
`app_config` key `'vault'` in `supabase/13_vault.sql` (seconds 120, grace 3, strikes 2, lock_tries 3, cracker_guesses 8, refill_secs 1200, cooldown_secs 10800, jail_secs 180, teen_fail_cooldown_secs 600). Demo twin: `public/world/game/interiors/vault-core.js`. Change both together.

## RPCs
`vault_status`, `vault_start`, `vault_answer(p_attempt, p_answer)`, `vault_giveup`, `get_jail`. Run `01_schema.sql`, `03_activities.sql`, `13_vault.sql` in that order.

## Files
`tpl_vault.js` (door, LED panel, jail cell), `vault-puzzles.js`, `vault-ui.js`, `jail.js`, `vault-core.js`, edits in `tpl_bank.js` and `engine.js`. The 790KB map file is untouched.

## Choices to confirm
- 120 s countdown (your example said 90 s).
- 3 h personal cooldown and the "mostly medium" roll were my suggestions.
- ATM deposit cap raised to ₦1,000,000,000 so vault money can be banked.
- Money flood (increased on request): up to 72 payouts/day, ~₦1bn/day at most (average ~₦9.6m each). The personal cooldown limits one player; tune `cooldown_secs` / `refill_secs` if the economy inflates.

## Tests
`sh supabase/tests/run.sh <psql args>` (includes `tests/vault.sql`, 153 checks) and `node tools/test/vault-e2e.js` (all six puzzles, payout, refill, jail, teen path, 390px layout).
