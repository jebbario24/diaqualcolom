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
  await page.evaluate(() => { STATE.auth.loggedIn = true; STATE.role = 'admin'; saveState(); render(); });
  await page.waitForTimeout(150);

  // 1. The switcher shows Admin + the 4 plans (5 buttons total), not the old generic Business/Particulier
  const btnTexts = await page.$$eval('.role-btn', els => els.map(e => e.textContent.trim()));
  console.log('Switcher buttons:', JSON.stringify(btnTexts));

  // 2. Clicking a plan button (Installateur) from anywhere jumps straight into a test account for that plan
  await page.click('[data-action="switch-role-plan"][data-plan="installateur"]');
  await page.waitForTimeout(150);
  const afterInstallateur = await page.evaluate(() => ({ role: STATE.role, acc: accountForRole('business'), bannerShown: !!document.querySelector('[data-action="exit-plan-test"]') }));
  console.log('After clicking Installateur ->', JSON.stringify(afterInstallateur));

  // 3. The active plan button reflects the account actually being viewed
  const activeAll = await page.$$eval('.role-btn.active', els => els.map(e=>e.textContent.trim()));
  console.log('Active buttons after switching to Installateur:', JSON.stringify(activeAll));

  // 4. Switching directly to another plan (CPS, a particulier plan) from within a business test works too
  await page.click('[data-action="switch-role-plan"][data-plan="cps"]');
  await page.waitForTimeout(150);
  const afterCps = await page.evaluate(() => ({ role: STATE.role, acc: accountForRole('particulier') }));
  console.log('After switching directly to CPS ->', JSON.stringify(afterCps));

  // 5. Admin button restores the pre-test admin session cleanly
  await page.click('[data-action="exit-plan-test"]');
  await page.waitForTimeout(150);
  const afterAdmin = await page.evaluate(() => ({ role: STATE.role, currentBusinessId: STATE.auth.currentBusinessId, currentParticulierId: STATE.auth.currentParticulierId, adminTestActive: STATE.auth.adminTestActive }));
  console.log('After returning to Admin ->', JSON.stringify(afterAdmin));

  // 6. A real (non-test) demo login still shows the correct plan highlighted, no test banner
  await page.evaluate(() => { doLogout(); });
  await page.waitForTimeout(100);
  await page.click('[data-action="public-go"][data-view="login"]');
  await page.waitForTimeout(100);
  await page.click('[data-action="demo-login"][data-role="particulier"]');
  await page.waitForTimeout(150);
  const realDemoActive = await page.$$eval('.role-btn.active', els => els.map(e=>e.textContent.trim()));
  const bannerAbsent = await page.locator('[data-action="exit-plan-test"]').count();
  console.log('Real demo particulier login -> active buttons:', JSON.stringify(realDemoActive), '| test banner absent:', bannerAbsent === 0);

  console.log('----ERRORS----');
  console.log(errors.length ? errors.join('\n') : 'NONE');
  await browser.close();
})();
