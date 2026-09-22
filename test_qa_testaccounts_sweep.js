// Comprehensive QA sweep: every test-plan preview account (CPS, Propriétaire, Installateur,
// Business) x every nav page visible to it. Flags: JS errors, blank #content, raw i18n key leaks.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const path = require('path');

const I18N_LEAK_RE = /^[a-z]+(\.[a-z0-9]+){1,4}$/;

function scanLeaks(page) {
  return page.evaluate(() => {
    const found = new Set();
    const re = /^[a-z]+(\.[a-z0-9]+){1,4}$/;
    document.querySelectorAll('#content *').forEach(el => {
      if (el.children.length === 0) {
        const txt = (el.textContent || '').trim();
        if (re.test(txt)) found.add(txt);
      }
    });
    return [...found];
  });
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const bugs = [];
  page.on('pageerror', e => bugs.push('PAGEERROR: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('ERR_TUNNEL')) bugs.push('CONSOLE: ' + msg.text()); });

  await page.goto('file://' + path.resolve('/home/claude/index.html'));
  await page.waitForTimeout(150);
  await page.evaluate(() => { STATE.auth.loggedIn = true; STATE.role = 'admin'; saveState(); render(); });
  await page.waitForTimeout(150);

  const plans = ['cps', 'proprietaire', 'installateur', 'business'];
  for (const plan of plans) {
    await page.click(`[data-action="switch-role-plan"][data-plan="${plan}"]`);
    await page.waitForTimeout(150);
    const role = await page.evaluate(() => STATE.role);
    const navItems = await page.$$eval('.nav-item', els => els.map(e => e.dataset.view));
    for (const view of navItems) {
      const before = bugs.length;
      await page.click(`.nav-item[data-view="${view}"]`);
      await page.waitForTimeout(150);
      const contentHTML = await page.evaluate(() => document.querySelector('#content')?.innerHTML?.trim() || '');
      const leaks = await scanLeaks(page);
      if (contentHTML === '') bugs.push(`BLANK CONTENT: plan=${plan} role=${role} view=${view}`);
      if (leaks.length) bugs.push(`I18N LEAK: plan=${plan} view=${view} -> ${JSON.stringify(leaks)}`);
      if (bugs.length > before) console.log(`  [FLAGGED] plan=${plan} view=${view}`);
    }
    console.log(`Swept plan=${plan} (role=${role}): ${navItems.length} views, ${bugs.length} cumulative issues`);
    // back to admin between plans
    await page.click('[data-action="exit-plan-test"]');
    await page.waitForTimeout(120);
  }

  console.log('----BUGS FOUND----');
  console.log(bugs.length ? bugs.join('\n') : 'NONE');
  await browser.close();
})();
