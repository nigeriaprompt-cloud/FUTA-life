# Player profile
- Server: `public.get_profile(p_user)` (supabase/12_profile.sql). Errors `not_found` for blocked users, other age group, unknown ids. Returns only public fields (never dob, email, money).
- Client: `phone/apps/profile.js` → `FutaProfile.open({id,username})`, `.load(root,peer,opts)`, `.render`. Hidden phone app id `profile`.
- Entry points: chat usernames, Friends/DM profile buttons, home card (self), world name card.
- Look rows come from `FutaAvatar.OPTIONS`; property/car/accessory art reuses `FutaCatalog.*` (exported by property.js, cars.js, accessories.js).
- Test: `PW_CORE=… CHROME=… node tools/test/profile-shot.js outdir tola`; SQL: `supabase/tests/run.sh`.
- Campus card: `get_profile` returns `campus` ({status, school, dept, level|year|area|exam}); the client resolves names from `onboarding/campus-options.json`. Edited in Phone → Settings → School & status.
- SQL order: 01…10, `11_campus.sql`, `11_account.sql`, `12_profile.sql`.
