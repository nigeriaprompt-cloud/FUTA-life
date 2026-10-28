# FUTA Phone

The phone that floats over the map on `public/world/index.html` (one `<link>` + one `<script>` at the bottom of that file load it).

- `phone.js` / `phone.css` — shell: frame, status bar, home screen, dock, show/hide, app registry, sign-in loading, `FutaPhone.logout()`.
- `apps/manifest.js` — list of apps to load (one id per entry; add yours here).
- `apps/<id>.js` — one file per app. Each calls `FutaPhone.registerApp({ id, name, icon, color:[c1,c2], mount(body, ctx){ … return {destroy(), back()} } })`.
- `apps/shop.js` — shared marketplace screen used by `property`, `cars`, `clothes`, `accessories` (placeholders; look for `LISTINGS HOOK`).
- `apps/settings.js` — account, privacy, phone options, **Log out**.
- `apps/chat.js` — tabs Campus / Building (private, only while inside a building) / Friends (search by username, wave requests, DMs) / Groups (create, invite + accept, member-only). Needs `supabase/10_chat_social.sql`. `FutaChat.openWith({id, username})` opens a conversation from anywhere (used by the name-label profile card). Browser test: `node tools/test/chat-phone.js`.
- `apps/profile.js` — classic-modern player profile (3D portrait, gender, property, cars, accessories, latest post). Hidden app; open with `FutaProfile.open({id, username})`. Needs `supabase/12_profile.sql`. See docs/PROFILE.md.

Helpers: `FutaPhone.show(temp) / hide(keepPref) / toggle() / open(id, {hideOnClose}) / home() / toast(msg) / badge(id, n) / getUser() / api() / demo()`; `ctx.setTitle(t)`. `show(true)` / `hide(true)` open/close without changing the remembered open/closed choice; `open(id,{hideOnClose:true})` puts the phone away again when that app is closed (used by the interior wardrobe).
Rules: user text only via `textContent`; writes only through Supabase RPCs (the server decides); money/prices never computed in the browser.
Merge tip for multi-account work: touch only your own `apps/<id>.js` and add one line to `manifest.js`.
- `apps/feed.js` — text feed (Feed / Write / Earn). Needs `supabase/05_feed.sql`; rules in `docs/FEED.md`.
- `apps/property.js` — Property app: 5 levels, 19 listings, minimum ₦500,000, buy from pocket or bank, daily rent. Needs `supabase/06_property.sql`.
- `apps/cars.js` — Cars app: 5 levels, 19 vehicles (okada to helicopter), minimum ₦500,000, daily hire income. Needs `supabase/07_cars.sql`.
- `apps/accessories.js` — Accessories app: 5 levels, 20 items (watches, bags, shades, jewellery), minimum ₦50,000, no income (style only), buy from pocket or bank. Needs `supabase/08_accessories.sql`. Items carry a `slot`/`look` ready for a future "wear it on my avatar" step.
- `apps/clothes.js` — Clothes app: live 3D preview + the same Clothes (top, bottom, dress, layer, shoes) and Extras (headwear, glasses, bag, neck, wrist, ears) pickers as sign-up. Changes ONLY `look.wear`; gender/skin/body/face/hair stay as saved. Free (no money). Saves through `FutaApi.saveAvatar` → `save_avatar` RPC. Loads the 3D engine (`avatar/*.js`) on first open. No new SQL.
- `prompt-ads.js` — The Prompt advert card on the home screen (apps → advert → WhatsApp card): 4 swipeable items (food combos + products) from the website's active Homepage Campaigns via `<site>/feed/phone_ads.php`. Hidden when no campaign is on or the site is unreachable. Tapping opens the item inside The Prompt app. Loaded by `phone.js`; test: `node tools/test/prompt-ads.js outdir` (needs port 8000).
- `apps/theprompt.js` — The Prompt app: opens https://theprompt.org.ng inside the phone (sandboxed iframe, no top navigation) with Home, Reload and Open-in-browser buttons. Accepts a deep link (`FutaPhone.open('theprompt',{url})`) and the phone's Back button walks back through site pages (needs the site's `assets/js/embed.js`). Logo is an inline SVG in the file. If the page is blank the site must allow framing (CSP `frame-ancestors`). Change the address in `SITE`.
- `apps/nepa.js` + `apps/tutorial.js` (+ shared `apps/bulletin-core.js`, not an app) — power-updates board and how-to guides, anyone signed in can post. Need `supabase/18_bulletins.sql`; rules in `docs/BULLETINS.md`.
- Home screen also shows the online strip (just below the clock) and the FUTAlife WhatsApp card (below the apps) from `game/community/community.js` (`FutaCommunity.home(homeEl)` is called at the end of `renderHome`); Settings gets a Community group from `FutaCommunity.settingsHtml()`. See `docs/COMMUNITY.md`.
- `apps/unread-badges.js` — not an app: red unread numbers for Feed, NEPA and Tutorial (Global and Chat count themselves). See `docs/UNREAD_AND_OFFLINE.md`. Realtime needs `supabase/25_unread_realtime.sql` (optional; a 60 s recount covers it).
