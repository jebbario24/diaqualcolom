const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('ERR_TUNNEL')) errors.push('CONSOLE: ' + msg.text()); });

  await page.goto('file://' + path.resolve('/home/claude/index.html'));
  await page.waitForTimeout(150);

  // Public pages sweep (logged out)
  const publicLeaks = [];
  async function scanLeaks(tag) {
    const leaked = await page.evaluate(() => {
      const all = document.querySelectorAll('body *');
      const found = new Set();
      const re = /^[a-z]+(\.[a-z0-9]+){1,4}$/;
      all.forEach(el => {
        if (el.children.length === 0) {
          const txt = (el.textContent || '').trim();
          if (re.test(txt)) found.add(txt);
        }
      });
      return [...found];
    });
    leaked.forEach(k => publicLeaks.push(tag + ': ' + k));
  }

  for (const view of ['landing', 'pricing', 'login']) {
    await page.evaluate((v) => { STATE.publicView = v; render(); }, view);
    await page.waitForTimeout(80);
    await scanLeaks('public/' + view);
  }

  // Log in as business, then sweep every role x every nav item
  await page.evaluate(() => { STATE.auth.loggedIn = true; STATE.role = 'business'; saveState(); render(); });
  await page.waitForTimeout(150);

  const roles = ['admin', 'business', 'particulier'];
  const visited = [];
  for (const role of roles) {
    await page.evaluate((r) => { STATE.role = r; saveState(); render(); }, role);
    await page.waitForTimeout(120);
    const navItems = await page.$$eval('.nav-item', els => els.map(e => e.dataset.view));
    for (const view of navItems) {
      await page.click(`.nav-item[data-view="${view}"]`);
      await page.waitForTimeout(120);
      const title = await page.$eval('.topbar-title', el => el.textContent).catch(() => 'N/A');
      visited.push(`[${role}] ${view} :: ${title}`);
      await scanLeaks(`${role}/${view}`);
    }
  }

  console.log('---- VISITED VIEWS ----');
  visited.forEach(v => console.log(v));

  console.log('---- LEAKED RAW I18N KEYS ----');
  console.log(publicLeaks.length ? publicLeaks.join('\n') : 'NONE');

  // Reload persistence check
  await page.reload();
  await page.waitForTimeout(200);
  const stillLoggedIn = await page.evaluate(() => STATE.auth.loggedIn);
  const roleAfterReload = await page.evaluate(() => STATE.role);
  console.log('---- PERSISTENCE ----');
  console.log('Still logged in after reload:', stillLoggedIn, '| role:', roleAfterReload);

  console.log('---- ERRORS ----');
  console.log(errors.length ? errors.join('\n') : 'NONE');
  await browser.close();
})();
