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

  const planIds = ['cps', 'proprietaire', 'installateur', 'business'];

  // 1. Rename every plan
  for (const id of planIds) {
    await page.fill(`.plan-edit-name[data-id="${id}"]`, `Renamed ${id}`);
    await page.locator(`.plan-edit-name[data-id="${id}"]`).dispatchEvent('change');
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(150);
  const namesAfterRename = await page.evaluate(() => Object.fromEntries(Object.keys(STATE.plans).map(id => [id, STATE.plans[id].customLabel])));
  console.log('All 4 plans renamed:', JSON.stringify(namesAfterRename));

  // 2. Price edit every plan (including CPS, whose price now means per-unit)
  for (const id of planIds) {
    await page.fill(`.plan-edit-price[data-id="${id}"]`, '999');
    await page.locator(`.plan-edit-price[data-id="${id}"]`).dispatchEvent('change');
    await page.waitForTimeout(80);
  }
  const pricesAfter = await page.evaluate(() => Object.fromEntries(Object.keys(STATE.plans).map(id => [id, STATE.plans[id].priceMAD])));
  console.log('All 4 plan prices updated to 999:', JSON.stringify(pricesAfter));

  // 3. Negative price input is clamped to 0 (regression check on existing Math.max(0,...) guard)
  await page.fill('.plan-edit-price[data-id="proprietaire"]', '-50');
  await page.locator('.plan-edit-price[data-id="proprietaire"]').dispatchEvent('change');
  await page.waitForTimeout(100);
  const negPriceClamped = await page.evaluate(() => STATE.plans.proprietaire.priceMAD);
  console.log('Negative price input clamped to 0:', negPriceClamped);
  // restore for later checks
  await page.fill('.plan-edit-price[data-id="proprietaire"]', '250');
  await page.locator('.plan-edit-price[data-id="proprietaire"]').dispatchEvent('change');
  await page.waitForTimeout(80);

  // 4. Quota edit for every editable quota field of every plan (skip CPS plan's own CPS category, which has no input)
  const quotaCats = ['devis', 'entretien', 'chauffage', 'regulateur', 'electrolyseur'];
  for (const id of planIds) {
    for (const cat of quotaCats) {
      const sel = `.plan-edit-quota[data-id="${id}"][data-cat="${cat}"]`;
      if (await page.locator(sel).count() > 0) {
        await page.fill(sel, '77');
        await page.locator(sel).dispatchEvent('change');
      }
    }
  }
  await page.waitForTimeout(150);
  const quotasAfter = await page.evaluate(() => Object.fromEntries(Object.keys(STATE.plans).map(id => [id, STATE.plans[id].quotas.devis])));
  console.log('Quota edits (devis category, all plans) applied:', JSON.stringify(quotasAfter));

  // 5. Toggle catalogueWrite — only meaningful (and only rendered) for business-role plans
  for (const id of ['installateur', 'business']) {
    const before = await page.evaluate((i) => STATE.plans[i].catalogueWrite, id);
    await page.click(`.plan-edit-cataloguewrite[data-id="${id}"]`);
    await page.waitForTimeout(80);
    const after = await page.evaluate((i) => STATE.plans[i].catalogueWrite, id);
    if (before === after) console.log(`  [BUG] catalogueWrite toggle did not change for plan ${id}`);
  }
  console.log('catalogueWrite toggled for business-role plans without error');
  const particulierCheckboxAbsent = await page.locator('.plan-edit-cataloguewrite[data-id="cps"], .plan-edit-cataloguewrite[data-id="proprietaire"]').count();
  console.log('catalogueWrite checkbox correctly absent for particulier-role plans (CPS/Propriétaire):', particulierCheckboxAbsent === 0);

  // 6. Reload -> everything persists
  await page.reload();
  await page.waitForTimeout(200);
  const afterReload = await page.evaluate(() => JSON.parse(JSON.stringify(STATE.plans)));
  console.log('After reload, cps plan:', JSON.stringify({customLabel: afterReload.cps.customLabel, priceMAD: afterReload.cps.priceMAD, catalogueWrite: afterReload.cps.catalogueWrite}));
  console.log('After reload, business plan devis quota:', afterReload.business.quotas.devis);

  // 7. Propagation: public pricing page shows renamed labels + new prices
  await page.evaluate(() => { doLogout(); STATE.publicView = 'pricing'; render(); });
  await page.waitForTimeout(150);
  const pricingCards = await page.$$eval('.pricing-card-public', els => els.map(e => e.querySelector('.card-title').textContent.trim() + ':' + e.querySelector('.mono').textContent.trim()));
  console.log('Public pricing reflects renamed plans + new prices:', JSON.stringify(pricingCards));

  // 8. Propagation: admin businesses/particuliers plan-select dropdowns show renamed labels
  await page.evaluate(() => { STATE.auth.loggedIn = true; STATE.role = 'admin'; saveState(); render(); });
  await page.waitForTimeout(120);
  await page.click('.nav-item[data-view="admin.businesses"]');
  await page.waitForTimeout(120);
  const bizDropdownOptions = await page.$$eval('.plan-select option', els => els.map(e => e.textContent.trim()));
  console.log('Admin businesses plan dropdown shows renamed plans:', JSON.stringify([...new Set(bizDropdownOptions)]));

  console.log('----ERRORS----');
  console.log(errors.length ? errors.join('\n') : 'NONE');
  await browser.close();
})();
