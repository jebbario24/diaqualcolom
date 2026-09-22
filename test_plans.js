const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text()); });

  await page.goto('file://' + path.resolve('index.html'));
  await page.waitForTimeout(150);
  await page.evaluate(() => { STATE.auth.loggedIn = true; STATE.role = 'business'; saveState(); render(); });
  await page.waitForTimeout(150);

  // ---- 1. Business role: check Sterilisation shows 2 separate régulateurs ----
  await page.evaluate(() => { STATE.role = 'business'; saveState(); render(); });
  await page.click('.nav-item[data-view="business.sterilisation"]');
  await page.waitForTimeout(150);
  const stTiles = await page.$$eval('.metric-tile .l', els => els.map(e => e.textContent.trim()));
  console.log('Sterilisation tiles:', stTiles);
  const hasPh = stTiles.some(t => /R.gulateur pH/.test(t));
  const hasCl = stTiles.some(t => /R.gulateur Chlore/.test(t));
  console.log('Has separate pH regulator tile:', hasPh, '| Has separate Chlore regulator tile:', hasCl);

  // ---- 2. Business account (b1) is on 'business' plan (500 quota) -> add-to-devis should work ----
  const addBtn = await page.locator('[data-action="add-to-devis"]');
  console.log('Add-to-devis button present (business plan, quota ok):', await addBtn.count());

  // ---- 3. Admin: switch business b2 (installateur) plan via selector, verify quota gating ----
  await page.evaluate(() => { STATE.role = 'admin'; saveState(); render(); });
  await page.click('.nav-item[data-view="admin.businesses"]');
  await page.waitForTimeout(150);
  const planSelects = await page.locator('.plan-select').count();
  console.log('Admin businesses plan-select dropdowns found:', planSelects);

  // ---- 4. Admin plans page renders 4 plans ----
  await page.click('.nav-item[data-view="admin.plans"]');
  await page.waitForTimeout(150);
  const planTitles = await page.$$eval('.card .card-title', els => els.map(e => e.textContent.trim()));
  console.log('Admin plans titles:', planTitles);

  // ---- 5. Business role -> Entretien: colour segmented control ----
  await page.evaluate(() => { STATE.role = 'business'; saveState(); render(); });
  await page.click('.nav-item[data-view="business.entretien"]');
  await page.waitForTimeout(150);
  const segButtons = await page.$$eval('#en-couleur button', els => els.map(e => e.textContent.trim()));
  console.log('Entretien colour buttons:', segButtons);
  await page.click('#en-couleur button[data-val="vert"]');
  await page.waitForTimeout(150);
  const warnCallout = await page.locator('.callout.danger').count();
  console.log('Green-water warning callout shown:', warnCallout > 0);

  // ---- 6. Particulier role: plan cps -> nav shows "Mon CPS", no Devis ----
  await page.evaluate(() => { STATE.role = 'particulier'; saveState(); render(); });
  await page.waitForTimeout(150);
  // p1 (Karim, default particulier account) - check accountForRole particulier is p1 with plan proprietaire per SEED
  let navLabels = await page.$$eval('.nav-item span', els => els.map(e => e.textContent.trim()));
  console.log('Particulier nav (p1, plan=proprietaire expected):', navLabels);

  // Switch p1's plan to 'cps' via admin, then re-check particulier nav
  await page.evaluate(() => { STATE.role = 'admin'; saveState(); render(); });
  await page.click('.nav-item[data-view="admin.particuliers"]');
  await page.waitForTimeout(150);
  const firstPlanSelect = page.locator('.plan-select').first();
  await firstPlanSelect.selectOption('cps');
  await page.waitForTimeout(150);
  await page.evaluate(() => { STATE.role = 'particulier'; saveState(); render(); });
  await page.waitForTimeout(150);
  navLabels = await page.$$eval('.nav-item span', els => els.map(e => e.textContent.trim()));
  console.log('Particulier nav after switching p1 to plan=cps:', navLabels);
  const cpsNav = await page.locator('.nav-item[data-view="particulier.cps"]').count();
  console.log('particulier.cps nav item present:', cpsNav);
  await page.click('.nav-item[data-view="particulier.cps"]');
  await page.waitForTimeout(150);
  const cpsPrintBtn = await page.locator('[data-action="print-doc"]').count();
  console.log('CPS print button present:', cpsPrintBtn);

  // ---- 7. Switch back p1 to proprietaire, check Devis self-service + Sterilisation nav ----
  await page.evaluate(() => { STATE.role = 'admin'; saveState(); render(); });
  await page.click('.nav-item[data-view="admin.particuliers"]');
  await page.waitForTimeout(150);
  await page.locator('.plan-select').first().selectOption('proprietaire');
  await page.waitForTimeout(150);
  await page.evaluate(() => { STATE.role = 'particulier'; saveState(); render(); });
  await page.waitForTimeout(150);
  navLabels = await page.$$eval('.nav-item span', els => els.map(e => e.textContent.trim()));
  console.log('Particulier nav after switching p1 back to proprietaire:', navLabels);
  await page.click('.nav-item[data-view="particulier.devis"]');
  await page.waitForTimeout(150);
  const devisAddLine = await page.locator('[data-action="toggle-add-line"]').count();
  console.log('Particulier self-service devis add-line control present:', devisAddLine);

  // ---- 8. Quota exhaustion: consume the 1x devis quota then verify blocked message ----
  const printDocBtn = page.locator('[data-action="print-doc"]');
  console.log('Print button visible before consuming quota:', await printDocBtn.count());
  if (await printDocBtn.count() > 0) {
    // Instead of real print (would open dialog), directly exercise tryConsume via page.evaluate
    const consumed = await page.evaluate(() => tryConsume('particulier', 'devis'));
    console.log('First devis quota consume (particulier/proprietaire, limit 1):', consumed);
    const consumed2 = await page.evaluate(() => tryConsume('particulier', 'devis'));
    console.log('Second devis quota consume (should be false, limit reached):', consumed2);
  }
  await page.evaluate(() => { render(); });
  await page.waitForTimeout(150);
  const exhaustedCallout = await page.locator('.callout.danger').count();
  console.log('Exhausted-quota callout visible after limit reached:', exhaustedCallout > 0);

  // ---- 9. Role smoke test across a few views, no console errors (app is French-only now) ----
  for (const role of ['admin','business','particulier']) {
    await page.evaluate((r) => { STATE.role = r; saveState(); render(); }, role);
    await page.waitForTimeout(80);
  }
  const langSwitchCount = await page.locator('.lang-switch').count();
  console.log('Language switcher absent from UI:', langSwitchCount === 0);

  console.log('----ERRORS----');
  console.log(errors.length ? errors.join('\n') : 'NONE');
  await browser.close();
})();
