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

  // 1. Fields are pre-filled with the current defaults
  const proprietairePrice = await page.locator('.plan-edit-price[data-id="proprietaire"]').inputValue();
  console.log('Proprietaire price field pre-filled:', proprietairePrice);

  // 2. Admin changes the price of the "Propriétaire" plan (200 -> 350)
  await page.fill('.plan-edit-price[data-id="proprietaire"]', '350');
  await page.locator('.plan-edit-price[data-id="proprietaire"]').dispatchEvent('change');
  await page.waitForTimeout(100);

  // 3. Admin raises the "devis" quota for Propriétaire from 1 to 5
  await page.fill('.plan-edit-quota[data-id="proprietaire"][data-cat="devis"]', '5');
  await page.locator('.plan-edit-quota[data-id="proprietaire"][data-cat="devis"]').dispatchEvent('change');
  await page.waitForTimeout(100);

  // 4. Admin grants catalogue-write to the "Installateur" plan (normally false)
  await page.click('.plan-edit-cataloguewrite[data-id="installateur"]');
  await page.waitForTimeout(150);

  const persisted = await page.evaluate(() => JSON.parse(JSON.stringify(STATE.plans)));
  console.log('Propriétaire plan after edits:', JSON.stringify({priceMAD: persisted.proprietaire.priceMAD, quotaDevis: persisted.proprietaire.quotas.devis}));
  console.log('Installateur catalogueWrite after toggle:', persisted.installateur.catalogueWrite);

  // 5. Reload -> edits must persist (localStorage), not reset to hardcoded defaults
  await page.reload();
  await page.waitForTimeout(200);
  const afterReload = await page.evaluate(() => JSON.parse(JSON.stringify(STATE.plans)));
  console.log('After reload -> Propriétaire price:', afterReload.proprietaire.priceMAD, '| devis quota:', afterReload.proprietaire.quotas.devis, '| Installateur catalogueWrite:', afterReload.installateur.catalogueWrite);

  // 6. The public pricing page must reflect the new price immediately (live data, not frozen)
  await page.evaluate(() => { doLogout(); STATE.publicView = 'pricing'; render(); });
  await page.waitForTimeout(150);
  const publicPrices = await page.$$eval('.pricing-card-public', cards => cards.map(c => c.querySelector('.card-title').textContent.trim() + ': ' + c.querySelector('.mono').textContent.trim()));
  console.log('Public pricing page prices:', publicPrices);

  // 7. Quota enforcement actually uses the new limit: Karim (proprietaire plan) can now consume devis quota 5 times, not 1
  await page.evaluate(() => { STATE.auth.loggedIn = true; STATE.role = 'particulier'; saveState(); render(); });
  await page.waitForTimeout(100);
  const results = await page.evaluate(() => {
    const out = [];
    for (let i = 0; i < 6; i++) out.push(tryConsume('particulier', 'devis'));
    return out;
  });
  console.log('6 consecutive devis-quota consumptions for Karim (new limit 5):', results);

  console.log('----ERRORS----');
  console.log(errors.length ? errors.join('\n') : 'NONE');
  await browser.close();
})();
