// usage: node shot.js "<query>" out.png [w h]
const { chromium } = require('/tmp/claude-0/-home-claude/b6df642c-fc58-5872-93e1-2ed5df482e76/scratchpad/pw/node_modules/playwright-core');
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../../public');
const srv=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);const f=path.join(root,p);fs.readFile(f,(e,b)=>{if(e){res.writeHead(404);res.end();return}res.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':f.endsWith('.html')?'text/html':f.endsWith('.json')?'application/json':'application/octet-stream'});res.end(b)})});
(async()=>{await new Promise(r=>srv.listen(0,r));const port=srv.address().port;
const [,, qs,out,w,h,page]=process.argv;
const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const pg=await b.newPage({viewport:{width:+w||1400,height:+h||520}});
pg.on('console',m=>console.log('console:',m.text().slice(0,300)));pg.on('pageerror',e=>console.log('PAGEERROR',e.message.slice(0,500)));
await pg.goto(`http://localhost:${port}/${page||'world/game/avatar/test-lineup.html'}?${qs}&w=${w||1400}&h=${h||520}`);
await pg.waitForFunction('window.__done',null,{timeout:40000}).catch(e=>console.log('timeout'));
console.log(JSON.stringify(await pg.evaluate('window.__stats||window.__done')));
await pg.screenshot({path:out});await b.close();srv.close();})();
