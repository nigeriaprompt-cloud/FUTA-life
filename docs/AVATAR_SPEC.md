# Avatar and NPC system (look, speed, how it is built)

Code: `public/world/game/avatar/`. Classic scripts (no build step), Three.js r128, everything on `window.FutaAvatar`.
Load order: `avatar-options.js` → `avatar-core.js` → `avatar-body.js` → `avatar-wear.js` → `avatar-rig.js` → `avatar-build.js` → (`avatar-npc.js` for NPCs).

## 1. The `look` (avatar_json v1) — the only thing stored per player
```json
{ "v":1,
  "body":{"frame":"f","height":1.0,"build":0.5,"bust":0.5,"hips":0.5,"shoulders":0.5},
  "skin":5,
  "face":{"shape":0,"eyes":0,"eyeColor":0,"brows":0,"nose":0,"lips":0},
  "hair":{"style":"box_braids","color":0,"seed":7},
  "beard":"none", "makeup":{"lips":2,"lashes":true}, "nails":1,
  "wear":{"top":{"id":"blouse","c":11,"p":"ankara_a"}, "bottom":{"id":"jeans","c":16}, "shoes":{"id":"sneakers","c":0,"c2":0}} }
```
- Numbers like `skin`, `c`, `c2` are **indexes into palettes** in `avatar-options.json` (so colours can be retuned without migrating data).
- `p` = pattern name (Ankara, plaid, kente…). Patterns are drawn by a shader — no textures.
- Slots in `wear`: `top, layer, bottom, dress, shoes, head, glasses, bag, neck, wrist, ears`. A `dress` replaces `top`+`bottom`.
- `AvatarValidator.php` and `FutaAvatar.look.normalize()` implement the same rules; both read `avatar-options.json`.

## 2. Public JS API
```js
const look = FutaAvatar.look.normalize(raw, {allowRestricted:false});   // never throws
const a = FutaAvatar.create(look, {lod:1, material:'lambert'});          // → {group, setPose, update, info, dispose}
scene.add(a.group); a.setPose('walk'); /* each frame: */ a.update(dt);
FutaAvatar.look.random('f', seed);                                       // nice random look
FutaAvatar.npc.create('security', seed, {frame:'m', lod:1});             // NPC by role (uniform, props)
```
Poses (`FutaAvatar.rig.poseNames`): idle, walk, run, patrol, sit, talk, guard, sweep, teach, wave, read, phone, dance Add one in `avatar-rig.js` `POSES` (procedural: it sets bone rotations from time `t`).
NPC roles (`FutaAvatar.npc.roles`): security, cleaner, lecturer, student, staff, trader, nurse — uniforms and props the player cannot wear.

## 3. Why it loads fast on a phone
| Trick | Effect |
|---|---|
| One merged `SkinnedMesh` per look, 15 bones, one draw call | draw calls = number of characters, not number of parts |
| Geometry is **cached per look+LOD and shared**; each instance owns only its bones | 30 students with 6 distinct looks build 6 meshes |
| Colours per vertex; patterns in the fragment shader | zero texture downloads, no atlas |
| 3 LODs (`FA.LOD` in `avatar-body.js`): hero / near / far | far crowd characters are ~2.6k tris |
| Skin only where clothes don't cover; baked fake ambient occlusion | fewer triangles, still shaded |
| Engine is lazy-loaded after the first screen paints | sign-up screen visible in ~0.4 s |
| Cheap `Lambert` material for crowds, `Standard` only for the player/creator | GPU cost |

Measured in headless Chromium with a *software* GPU (so it is a size/CPU check, **not** a phone test): hero 15k tris, near 4.7k, far 2.6k; geometry build ≈ 24 ms (hero), 7 ms (near), 5 ms (far) per new look on a laptop CPU. Expect 3–5× slower on a mid phone → build looks over several frames (queue them) and never more than 1–2 per frame.
**Budgets to hold** (also `ARCHITECTURE.md`): ≤ 60 characters drawn, of which ≤ 8 at LOD 0/1 near the camera; everyone else LOD 2 or just a name label. **Test on a real Android phone before launch** and tune `FA.LOD`.

## 4. Where things are
| File | Responsibility |
|---|---|
| `avatar-options.json` (+ generated `.js`) | every choice, palette, default; source of truth |
| `avatar-core.js` | maths, body cross-section tables, `loft()`, vertex accumulator, shader patterns, materials |
| `avatar-body.js` | body proportions, head/face (eyes, brows, nose, lips, ears), hands, shoes, skin coverage, LOD table |
| `avatar-wear.js` | garments, hair, headwear, beards, glasses, bags, accessories, what-is-covered rules |
| `avatar-rig.js` | skeleton + procedural poses + props |
| `avatar-build.js` | look normalising, random looks, geometry cache, `create()` |
| `avatar-npc.js` | role → look + props |
| `lab.html` | developer page: `?mode=roles|random|lod|poses|one&lod=0&seed=3&frame=f` |

## 5. Rules for changes
- Body-section tables use **metres on a 1.78 m reference body**, +z forward, y up. Do not rescale parts ad-hoc; use `FA.tab` helpers.
- A new garment must (a) draw itself in `avatar-wear.js`, (b) report coverage in `FA.wearCover` so skin isn't drawn underneath, (c) work on both frames, (d) stay within the tri budget (check `lab.html` HUD).
- Long hair/skirts must keep clear of the shoulders/legs (`clearTorso()`, leg-swing clamp in the rig).
- Never add a texture file for patterns; add a branch in `patternColor()` and a name in `avatar-options.json` `patterns`.

## 6. Known limits (be honest with the owner)
- Faces are stylised (a believable game look, not photoreal). Biggest visible gains next: nose/cheek shaping, hairline softness at close range, more garment shapes.
- Hair is shells + tube strands: great at game distance, less so in the creator close-up.
- Skinning is rigid with joint blending; extreme poses can show creases.
- Not yet tested on real phones; Google login not yet tested against Google.
