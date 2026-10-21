// Rasterises public/brand/*.svg into the PNG icons + favicon.ico.  Run after make_brand.py:  node tools/brand/render_brand.js
// env CHROME=/path/to/chromium PW_CORE=/path/to/playwright (defaults work in the dev sandbox)
const { chromium } = require(process.env.PW_CORE || 'playwright'); const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const B = path.resolve(__dirname, '../../public/brand');
const jobs = [['logo.svg', 'icon-192.png', 192, true], ['logo.svg', 'icon-512.png', 512, true], ['icon-maskable.svg', 'icon-maskable-512.png', 512, false], ['icon-fullbleed.svg', 'apple-touch-icon.png', 180, false],
  ['favicon.svg', 'favicon-16.png', 16, true], ['favicon.svg', 'favicon-32.png', 32, true], ['favicon.svg', 'favicon-48.png', 48, true], ['logo.svg', 'logo-1024.png', 1024, true]];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });
  for (const [src, out, size, transparent] of jobs) {
    const pg = await b.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 }); const svg = fs.readFileSync(path.join(B, src), 'utf8');
    await pg.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" style="display:block" `)}</body></html>`);
    await pg.screenshot({ path: path.join(B, out), omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } }); await pg.close(); console.log('wrote', out);
  }
  // social share card 1200x630
  const wm = fs.readFileSync(path.join(B, 'wordmark-on-dark.svg'), 'utf8').replace('<svg ', '<svg style="width:760px;height:auto" ');
  const pg = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await pg.setContent(`<html><body style="margin:0;width:1200px;height:630px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;background:radial-gradient(90% 80% at 25% 15%,#25704f 0,#12392a 50%,#091d14 100%);font-family:Georgia,'DejaVu Serif',serif;color:#fbeaa8">${wm}<div style="font-size:30px;letter-spacing:.14em;text-transform:uppercase;opacity:.9">Your campus. Your Lagos life.</div></body></html>`);
  await pg.screenshot({ path: path.join(B, 'og-image.png') }); await b.close(); console.log('wrote og-image.png');
  // favicon.ico (16/32/48) via PIL
  execFileSync('python3', ['-c', `from PIL import Image;import os;B=${JSON.stringify(B)};ims=[Image.open(os.path.join(B,f'favicon-{n}.png')).convert('RGBA') for n in (48,32,16)];ims[0].save(os.path.join(B,'favicon.ico'),sizes=[(48,48),(32,32),(16,16)],append_images=ims[1:])`]); console.log('wrote favicon.ico');
})();
