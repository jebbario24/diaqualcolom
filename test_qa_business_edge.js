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

  // ---- Installateur test account: catalogueWrite=false -> catalogue read-only, no crash ----
  await page.click('[data-action="switch-role-plan"][data-plan="installateur"]');
  await page.waitForTimeout(150);
  await page.click('.nav-item[data-view="business.clients"]');
  await page.waitForTimeout(120);
  const clientsRowCount = await page.locator('table tbody tr').count();
  console.log('Fresh Installateur test account "Mes clients" (should be empty, no crash):', clientsRowCount);

  await page.click('.nav-item[data-view="business.catalogue"]');
  await page.waitForTimeout(120);
  const readonlyCallout = await page.locator('.callout.info').count();
  const addProductBtnCount = await page.locator('[data-action="add-product"]').count();
  console.log('Installateur (no catalogueWrite) catalogue is read-only:', readonlyCallout > 0, '| add-product control absent:', addProductBtnCount === 0);

  await page.click('.nav-item[data-view="business.devis"]');
  await page.waitForTimeout(120);
  const devisTabTitle = await page.$eval('.topbar-title', el => el.textContent);
  console.log('Installateur Devis & CPS tab opens:', devisTabTitle);
  // switch to the CPS sub-tab
  const cpsTabBtn = page.locator('[data-action="devis-tab"][data-tab="cps"]');
  if (await cpsTabBtn.count() > 0) {
    await cpsTabBtn.click();
    await page.waitForTimeout(120);
    // Installateur plan has 0 CPS quota included, so the correct behavior is a "not included"
    // callout instead of a print button (not a bug).
    const notIncludedCallout = await page.locator('.callout.warn').count();
    console.log('Installateur CPS sub-tab correctly shows "not included" (installateur has 0 CPS quota):', notIncludedCallout > 0);
  } else {
    console.log('Installateur CPS sub-tab button not found (unexpected)');
  }

  await page.click('.nav-item[data-view="business.abonnement"]');
  await page.waitForTimeout(120);
  const abonPrice = await page.locator('.card-sub').first().textContent();
  console.log('Installateur Mon abonnement shows price info:', abonPrice);

  // ---- Business test account: catalogueWrite=true -> can add a product without crash ----
  await page.click('[data-action="exit-plan-test"]');
  await page.waitForTimeout(120);
  await page.click('[data-action="switch-role-plan"][data-plan="business"]');
  await page.waitForTimeout(150);
  await page.click('.nav-item[data-view="business.catalogue"]');
  await page.waitForTimeout(120);
  const addProductBtnPresent = await page.locator('[data-action="toggle-add-product"]').count();
  console.log('Business test account (catalogueWrite=true) can see add-product control:', addProductBtnPresent > 0);

  // ---- Devis & CPS for the Business test account: add a line then print (quota check) ----
  await page.evaluate(() => { STATE.devisTab = 'devis'; saveState(); });
  await page.click('.nav-item[data-view="business.devis"]');
  await page.waitForTimeout(120);
  const addLineBtn = page.locator('[data-action="toggle-add-line"]');
  console.log('Business test account devis add-line control present:', await addLineBtn.count() > 0);

  // ---- Mon abonnement: change plan dropdown for the Business test account works without crash ----
  await page.click('.nav-item[data-view="business.abonnement"]');
  await page.waitForTimeout(120);
  await page.selectOption('#abon-plan-select', 'installateur');
  await page.waitForTimeout(150);
  const planAfterChange = await page.evaluate(() => accountForRole('business').plan);
  console.log('Changing plan via Mon abonnement dropdown works:', planAfterChange);

  console.log('----ERRORS----');
  console.log(errors.length ? errors.join('\n') : 'NONE');
  await browser.close();
})();
