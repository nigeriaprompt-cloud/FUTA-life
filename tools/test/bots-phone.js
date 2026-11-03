// Real phone + fake Supabase: the BOT badge + violet dot appear next to bot names (and ONLY bot names) in Global, Feed, Tutorial and Chat, and a bot chat has no "Send money".
// usage: node tools/test/bots-phone.js outdir
const { chromium } = require(process.env.PW_CORE || 'playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../../public'), out = process.argv[2] || '.'; fs.mkdirSync(out, { recursive: true });
const mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', webmanifest: 'application/manifest+json', png: 'image/png', svg: 'image/svg+xml', txt: 'text/plain', glb: 'model/gltf-binary' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': mime[path.extname(f).slice(1)] || 'application/octet-stream' }); r.end(b); }); });
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL -', m); } else console.log('ok   -', m); };
const CFG = "window.FUTA_CONFIG={demo:false,supabaseUrl:'https://x.supabase.co',supabaseAnonKey:'k',afterUrl:'/world/',minAge:13,adultAge:18,brand:{name:'FUTAlife'},previewLod:'auto'};";
const now = new Date().toISOString();
const API = `(()=>{ window.__rpcs=window.__rpcs||[]; const T={
  global_messages:[{id:2,user_id:'u3',username:'kunle_x',body:'anyone at the library?',created_at:'${now}'},{id:1,user_id:'u2',username:'tolu_ade',body:'Cafeteria jollof is sold out again',created_at:'${now}'}],
  feed_posts:[{id:5,user_id:'u2',username:'tolu_ade',body:'Small reminder: drink water and rest well today.',bg:'ocean',expires_at:'${new Date(Date.now() + 36e5 * 20).toISOString()}'},{id:4,user_id:'u3',username:'kunle_x',body:'Who is watching the match tonight?',bg:'sunset',expires_at:'${new Date(Date.now() + 36e5 * 20).toISOString()}'}],
  bulletins:[{id:9,kind:'tutorial',user_id:'u2',username:'tolu_ade',category:'Study',title:'A simple weekly study timetable',body:'Pick your two hardest courses and give each a fixed daily slot. Stick to it for two weeks.',helpful:0,created_at:'${now}'},{id:8,kind:'tutorial',user_id:'u3',username:'kunle_x',category:'Tech',title:'Charge smart during power cuts',body:'Charge your phone and power bank first when light comes back to the hostel.',helpful:2,created_at:'${now}'}],
  dms:[],waves:[{id:1,from_user:'me',to_user:'u2',status:'accepted'},{id:2,from_user:'me',to_user:'u3',status:'accepted'}],profiles:[]};
 const chain=(rows)=>{ const p=new Proxy(function(){}, { get(_,k){ if(k==='then') return (res)=>res({data:rows,error:null}); if(k==='maybeSingle'||k==='single') return ()=>Promise.resolve({data:rows[0]||null,error:null}); return ()=>p; } }); return p; };
 window.FutaApi={me:()=>Promise.resolve({user:{id:'me',username:'real_me',isTeen:false,onboarded:true,wallet:{pocket:1000,bank:0}}}),
  rpc:(n,a)=>{ window.__rpcs.push(n); if(n==='list_bots') return Promise.resolve([{username:'tolu_ade'}]);
    if(n==='get_feed_status') return Promise.resolve({daily_limit:7,posts_left:7,reward:500,min_chars:15,max_chars:280,bank:0,backgrounds:['sunset','ocean']});
    if(n==='get_bulletin_status') return Promise.resolve({left:3,daily:3,gap:300});
    if(n==='get_unread') return Promise.resolve({dms:{},groups:{},invites:0,alerts:0});
    return Promise.resolve(0); },
  onAuth(){return ()=>{}}, sb(){ return { from:(t)=>chain(T[t]||[]), channel(){const c=new Proxy({},{get(_,k){return k==='then'?undefined:()=>c}});return c}, removeChannel(){} } }, fail:(e)=>e, signOut:()=>Promise.resolve({ok:true}) };})();`;
(async () => {
  await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port;
  const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, serviceWorkers: 'block' });
  await ctx.route('**/onboarding/config.js', r => r.fulfill({ contentType: 'text/javascript', body: CFG }));
  await ctx.route('**/onboarding/api.js', r => r.fulfill({ contentType: 'text/javascript', body: API }));
  await ctx.route('**/vendor/supabase.min.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.supabase={}' }));
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  const sh = (js) => pg.evaluate('(()=>{const r=document.getElementById("futaPhoneHost").shadowRoot;' + js + '})()');
  await pg.goto(base + '/world/interior.html?id=x&n=Library&ty=office&tpl=library&hour=11&d=1'); await pg.waitForFunction('window.FutaPhone&&FutaPhone.getUser&&FutaPhone.getUser()', null, { timeout: 90000 }); await pg.waitForTimeout(1500);
  ok(await pg.evaluate(() => __rpcs.includes('list_bots')), 'the phone asks the server which names are bots (once, after sign-in)');
  ok(await pg.evaluate(() => FutaPhone.isBot('tolu_ade') && FutaPhone.isBot('TOLU_ADE') && !FutaPhone.isBot('kunle_x') && !FutaPhone.isBot('🤖 tolu_ade')), 'isBot is exact (case-insensitive) and a lookalike name is NOT a bot');
  const marks = (sel) => sh(`return [...r.querySelectorAll('${sel}')].map(e => e.textContent.replace(/\\s+/g,' ').trim())`);
  await pg.evaluate(() => FutaPhone.open('global')); await pg.waitForTimeout(1200);
  let m = await marks('.ph-who'); ok(m.some(x => /^tolu_ade\s*BOT$/.test(x)) && m.some(x => x === 'kunle_x'), 'Global: tolu_ade has the BOT badge, kunle_x does not (' + m.join(' | ') + ')');
  ok(await sh(`return r.querySelectorAll('.ph-bot').length`) === 1, 'Global: exactly one badge'); await pg.screenshot({ path: out + '/bots-1-global.png' });
  await pg.evaluate(() => { FutaPhone.home(); FutaPhone.open('feed'); }); await pg.waitForTimeout(1200);
  m = await marks('.fd-head b'); ok(m.some(x => /^tolu_ade\s*BOT$/.test(x)) && m.some(x => x === 'kunle_x'), 'Feed: BOT only on the bot post (' + m.join(' | ') + ')'); await pg.screenshot({ path: out + '/bots-2-feed.png' });
  await pg.evaluate(() => { FutaPhone.home(); FutaPhone.open('tutorial'); }); await pg.waitForTimeout(1200);
  m = await marks('.tu-meta'); ok(m.some(x => /by tolu_ade\s*BOT/.test(x)) && m.some(x => /by kunle_x/.test(x) && !/BOT/.test(x)), 'Tutorial: BOT only on the bot guide (' + m.join(' | ').slice(0, 120) + ')'); await pg.screenshot({ path: out + '/bots-3-tutorial.png' });
  // the badge has the violet dot and cannot be made from typed text: a player named with the word BOT gets nothing
  const css = await sh(`const e = r.querySelector('.ph-bot'); if (!e) return null; const c = getComputedStyle(e.querySelector('i')); return { dot: c.backgroundColor, title: e.title }`);
  ok(css && /139, 61, 255/.test(css.dot) && /automated/.test(css.title), 'badge has the violet dot and the "automated" tooltip (' + JSON.stringify(css) + ')');
  // chat with a bot
  await pg.evaluate(() => { FutaPhone.home(); FutaPhone.open('chat'); }); await pg.waitForTimeout(800);
  const opened = await pg.evaluate(() => { try { if (window.FutaChat && FutaChat.openWith) { FutaChat.openWith({ id: 'u2', username: 'tolu_ade' }); return true; } } catch (e) { return String(e); } return false; }); await pg.waitForTimeout(1500);
  const txt = await sh('return r.textContent');
  ok(opened === true && /Campus bot: replies are automated/.test(txt), 'Chat with a bot shows the "replies are automated" note'); ok(await sh("return !!r.querySelector('.ph-bot')") && await sh("const h=r.querySelector('h2'); return !!(h && h.querySelector('.ph-bot'))"), 'and the BOT badge is in the chat header too');
  ok(!/Send money/.test(txt), 'and offers no "Send money" button'); await pg.screenshot({ path: out + '/bots-4-chat.png' });
  await pg.evaluate(() => { FutaChat.openWith({ id: 'u3', username: 'kunle_x' }); }); await pg.waitForTimeout(1200);
  ok(/Send money/.test(await sh('return r.textContent')) && !/automated/.test(await sh('return r.textContent')), 'a normal player chat still has Send money and no bot note');
  ok(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' | '));
  await b.close(); srv.close(); console.log(bad ? bad + ' FAILED' : 'ALL OK');
})();
