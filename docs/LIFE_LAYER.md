# Lagos life layer (what makes people stay)

Goal: a player should feel "I'm living a Lagos-style campus life" within minutes: money is tight, style matters, hustle pays, friends and events pull you out, small daily rituals bring you back. **Original design — do not copy any other game's names, art or text.** (Other life-sims like it were studied only for what players enjoy.)

## 1. Core stats (kept tiny; all server-side integers)
- **Cash (₦)** — game money (not real money). Earned from gigs/jobs, spent on food, transport, rent, style.
- **Energy 0–100** — drops with activity, restores by eating/sleeping/resting. At 0 you can't work.
- **Mood 0–100** — rises from friends, events, nice outfit, home; falls from hunger, NEPA outages, bad luck. Mood changes your idle animation and small bonuses.
- **Style / Hustle / Social (skill points)** — start values come from the story the player picked (`life-start.json`). They unlock gigs, discounts, event invites.
Keep it forgiving: nothing is ever permanently lost; being broke just means "do a gig".

## 2. The daily loop (≈ 10 minutes a session)
1. Wake in your hostel room (home screen shows energy/mood/cash).
2. Do 1–3 **gigs** (mini-jobs, 30–90 s each): serve at the buka, fold clothes at the boutique, deliver a parcel across campus, tutor a mate, sell recharge cards, help at the print shop.
3. **Eat** (buka/cafeteria → real restaurants can be linked, Phase 6), **ride** (campus shuttle / okada animation costs a little cash), **shop** for outfits and hair.
4. **Meet people**: hangouts, event nights, squads (see `STYLE_AND_SOCIAL.md`).
5. Come back tomorrow: daily login chest, a new gig board, the weekly event.

## 3. Lagos-flavoured events (server timers, small and funny)
- **NEPA took light**: random short outage — lamps in the world go dark, phone battery drains, generator gigs appear (₦ bonus for helping).
- **Owambe weekend**: aso-ebi colour of the week; wearing it gives a style bonus and an event badge.
- **Fuel scarcity / strike days**: transport costs rise, walking is free and gives social XP.
- **Rainy day**: puddles, umbrellas (item), indoor hangouts get a mood bonus.
- **Exam week / Convocation**: campus is crowded with NPCs, special quests.
Each event = one row in an `events` config JSON with: id, weight, duration, effect list (e.g. `{"lamps":"off"}`, `{"transport_cost":1.5}`), banner text. Effects are applied by the server clock; the client only displays them.

## 4. Start choices (already built in the sign-up)
Fresh Student / Campus Hustler / Fashion & Vibes → cash, energy, stat points, room. Add more in `life-start.json` (the UI builds itself). Server accepts only ids listed in `api/config.php` `life_starts`.

## 5. Why it brings women in and keeps them (see `STYLE_AND_SOCIAL.md`)
Self-expression (character studio, wardrobe, hair, makeup, photo mode), safety first (wave-first DMs, blocking, Teen Mode), home & pets, events with friends, shareable looks, no looks-ranking and no pay-to-message.

## 6. Build order inside Phase 4B
1. Stats + HUD + wake/sleep loop. 2. Three gig mini-games with one shared "gig runner". 3. Eating/transport costs. 4. Events engine (NEPA first). 5. Daily rewards. 6. Squads/hangouts (7B).
**Done when:** a new player can do two gigs, buy a hair style, eat, sleep, see an event banner, and tomorrow's login gives a reward — all persisted on the server and consistent when played on two devices.

## 7. Explicitly NOT now
Group contributions / "gift me" crowdfunding (see `ROADMAP.md` Phase 8: deferred until there is traffic and legal review), real-money withdrawals, any pay-to-message.
