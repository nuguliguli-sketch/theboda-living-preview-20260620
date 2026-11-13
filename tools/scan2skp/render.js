// headless render of the viewer (three.js served from local node_modules)
const { chromium } = require('playwright');
const path = require('path');
const [html, out, view = 'persp'] = process.argv.slice(2);
const lib = path.resolve(__dirname, process.env.THREE_DIR || '../viewerlib/node_modules/three');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1200, height: 850 }, deviceScaleFactor: 1 });
  p.on('pageerror', e => console.error('pageerror', e.message));
  await p.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', r => {
    const rel = r.request().url().split('three@0.160.0/')[1];
    r.fulfill({ path: path.join(lib, rel), contentType: 'application/javascript' });
  });
  await p.goto('file://' + path.resolve(html) + '?view=' + view);
  await p.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });
  await p.waitForTimeout(600);
  await p.screenshot({ path: out });
  await b.close();
})();
