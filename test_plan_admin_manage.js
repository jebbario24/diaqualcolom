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
  await page.click('.nav-item[data-view="admin.plans"]');
  await page.waitForTimeout(150);

  // 1. Plan name field pre-filled with the current (i18n) label
  const nameBefore = await page.locator('.plan-edit-name[data-id="installateur"]').inputValue();
  console.log('Plan name field pre-filled with current label:', nameBefore);

  // 2. Admin renames "Installateur" -> "Pro Terrain"
  await page.fill('.plan-edit-name[data-id="installateur"]', 'Pro Terrain');
  await page.locator('.plan-edit-name[data-id="installateur"]').dispatchEvent('change');
  await page.waitForTimeout(150);
  const cardTitle = await page.evaluate(() => document.querySelector('.plan-edit-name[data-id="installateur"]').closest('.card').querySelector('.card-title').textContent);
  console.log('Card title updates to custom name after rename:', cardTitle);

  // 3. Custom name propagates to the public pricing page and to the admin businesses plan dropdown
  await page.evaluate(() => { doLogout(); STATE.publicView = 'pricing'; render(); });
  await page.waitForTimeout(120);
  const pricingTitles = await page.$$eval('.pricing-card-public .card-title', els => els.map(e => e.textContent.trim()));
  console.log('Public pricing titles include custom name:', JSON.stringify(pricingTitles));

  await page.evaluate(() => { STATE.auth.loggedIn = true; STATE.role = 'admin'; saveState(); render(); });
  await page.waitForTimeout(120);
  await page.click('.nav-item[data-view="admin.businesses"]');
  await page.waitForTimeout(120);
  const optionTexts = await page.$$eval('.plan-select option', els => els.map(e => e.textContent.trim()));
  console.log('Admin businesses plan dropdown shows custom name:', optionTexts.includes('Pro Terrain'));

  // 4. Clearing the name field falls back to the default i18n label (not empty, not "null")
  await page.click('.nav-item[data-view="admin.plans"]');
  await page.waitForTimeout(120);
  await page.fill('.plan-edit-name[data-id="installateur"]', '');
  await page.locator('.plan-edit-name[data-id="installateur"]').dispatchEvent('change');
  await page.waitForTimeout(120);
  const nameAfterClear = await page.locator('.plan-edit-name[data-id="installateur"]').inputValue();
  console.log('Clearing custom name falls back to default label:', nameAfterClear);

  // 5. "Tester l'accès" on the Business plan card switches into a dedicated test business account
  await page.click('[data-action="test-plan-access"][data-id="business"]');
  await page.waitForTimeout(150);
  const afterTest1 = await page.evaluate(() => ({
    role: STATE.role,
    sidebarShown: !!document.querySelector('.sidebar'),
    acc: accountForRole('business'),
    quotaDevis: quotaOf('business','devis'),
  }));
  console.log('After testing Business plan -> role:', afterTest1.role, '| account:', JSON.stringify(afterTest1.acc), '| devis quota shown (should be 500):', afterTest1.quotaDevis);

  // 6. Test-mode banner is visible with an exit control
  const bannerVisible = await page.locator('[data-action="exit-plan-test"]').count();
  console.log('Exit-test banner button visible while testing:', bannerVisible > 0);

  // 7. Exiting the test returns to admin, on the admin.plans view, with the original current-business untouched
  await page.click('[data-action="exit-plan-test"]');
  await page.waitForTimeout(150);
  const afterExit = await page.evaluate(() => ({ role: STATE.role, view: STATE.view, currentBusinessId: STATE.auth.currentBusinessId, adminTestActive: STATE.auth.adminTestActive }));
  console.log('After exiting test -> role/view/currentBusinessId/adminTestActive:', JSON.stringify(afterExit));

  // 8. Testing the "Installateur" plan (different plan) re-uses the SAME dedicated test account on a second visit
  await page.click('[data-action="test-plan-access"][data-id="installateur"]');
  await page.waitForTimeout(150);
  const firstTestAccId = await page.evaluate(() => STATE.auth.currentBusinessId);
  await page.click('[data-action="exit-plan-test"]');
  await page.waitForTimeout(120);
  await page.click('.nav-item[data-view="admin.plans"]');
  await page.waitForTimeout(120);
  await page.click('[data-action="test-plan-access"][data-id="installateur"]');
  await page.waitForTimeout(150);
  const secondTestAccId = await page.evaluate(() => STATE.auth.currentBusinessId);
  console.log('Re-testing the same plan reuses the same test account (no duplicate accumulation):', firstTestAccId === secondTestAccId);

  // 9. Admin sees the test accounts flagged with a TEST badge in Comptes Business, not mixed silently with real customers
  await page.click('[data-action="exit-plan-test"]');
  await page.waitForTimeout(120);
  await page.click('.nav-item[data-view="admin.businesses"]');
  await page.waitForTimeout(120);
  const testBadges = await page.locator('.badge.accent').count();
  console.log('TEST badge(s) shown on test accounts in Comptes Business:', testBadges);

  // 10. Testing a particulier plan (CPS) switches to the particulier role correctly
  await page.click('.nav-item[data-view="admin.plans"]');
  await page.waitForTimeout(120);
  await page.click('[data-action="test-plan-access"][data-id="cps"]');
  await page.waitForTimeout(150);
  const cpsTest = await page.evaluate(() => ({ role: STATE.role, view: STATE.view, acc: accountForRole('particulier'), hasCps: hasCpsQuota('particulier') }));
  console.log('Testing CPS (particulier) plan -> role/view:', cpsTest.role, cpsTest.view, '| account plan:', cpsTest.acc && cpsTest.acc.plan, '| CPS quota granted:', cpsTest.hasCps);

  // 11. Full regression: normal demo role-switching (not via test) still works exactly as before
  await page.click('[data-action="exit-plan-test"]');
  await page.waitForTimeout(120);
  await page.evaluate(() => { STATE.role = 'business'; saveState(); render(); });
  await page.waitForTimeout(120);
  const demoBizAfter = await page.evaluate(() => accountForRole('business')?.nom);
  console.log('Normal role-switcher (outside test flow) still resolves to the real demo business:', demoBizAfter);

  console.log('----ERRORS----');
  console.log(errors.length ? errors.join('\n') : 'NONE');
  await browser.close();
})();
