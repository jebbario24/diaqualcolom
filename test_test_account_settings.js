const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('ERR_TUNNEL')) errors.push('CONSOLE: ' + msg.text()); });

  await page.goto('file://' + path.resolve('/home/claude/index.html'));
  await page.waitForTimeout(150);
  await page.evaluate(() => { STATE.auth.loggedIn = true; STATE.role = 'admin'; saveState(); render(); });
  await page.waitForTimeout(150);

  // 1. Switch into a particulier test account (CPS plan) via the sidebar switcher, then open Account Settings
  await page.click('[data-action="switch-role-plan"][data-plan="cps"]');
  await page.waitForTimeout(150);
  await page.click('.nav-item[data-view="particulier.account"]');
  await page.waitForTimeout(150);
  const cpsEmailField = await page.locator('#acct-email').inputValue().catch(()=>null);
  console.log('CPS test account Account Settings renders with a synthesized email:', cpsEmailField);

  // 2. Saving a new email on the test account works normally (no crash), and persists
  await page.fill('#acct-email', 'preview-cps@example.com');
  await page.click('[data-action="save-email"]');
  await page.waitForTimeout(150);
  const savedOk = await page.locator('.callout.ok').count();
  console.log('Email save on test account succeeds:', savedOk > 0);

  // 3. Re-entering the SAME CPS test account later reuses its (now-saved) credential, doesn't wipe it
  await page.click('[data-action="exit-plan-test"]');
  await page.waitForTimeout(120);
  await page.click('[data-action="switch-role-plan"][data-plan="cps"]');
  await page.waitForTimeout(120);
  await page.click('.nav-item[data-view="particulier.account"]');
  await page.waitForTimeout(120);
  const reEnteredEmail = await page.locator('#acct-email').inputValue();
  console.log('Re-entering the same CPS test account keeps its saved email:', reEnteredEmail);

  // 4. Same check for a BUSINESS test account (Installateur) — Account Settings must not crash either
  await page.click('[data-action="exit-plan-test"]');
  await page.waitForTimeout(120);
  await page.click('[data-action="switch-role-plan"][data-plan="installateur"]');
  await page.waitForTimeout(150);
  await page.click('.nav-item[data-view="business.account"]');
  await page.waitForTimeout(150);
  const bizEmailField = await page.locator('#acct-email').inputValue().catch(()=>null);
  console.log('Installateur test account Account Settings renders with a synthesized email:', bizEmailField);

  // 5. Real (non-test) accounts are completely unaffected by the self-heal logic
  await page.evaluate(() => { doLogout(); });
  await page.waitForTimeout(100);
  await page.click('[data-action="public-go"][data-view="login"]');
  await page.waitForTimeout(100);
  await page.click('[data-action="demo-login"][data-role="business"]');
  await page.waitForTimeout(150);
  await page.click('.nav-item[data-view="business.account"]');
  await page.waitForTimeout(150);
  const realBizEmail = await page.locator('#acct-email').inputValue();
  console.log('Real demo business account still shows its own real email (unaffected):', realBizEmail);

  console.log('----ERRORS----');
  console.log(errors.length ? errors.join('\n') : 'NONE');
  await browser.close();
})();
