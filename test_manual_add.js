const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('ERR_TUNNEL')) errors.push('CONSOLE: ' + msg.text()); });

  await page.goto('file://' + path.resolve('index.html'));
  await page.waitForTimeout(150);
  await page.evaluate(() => { STATE.auth.loggedIn = true; STATE.role = 'business'; saveState(); render(); });
  await page.waitForTimeout(150);
  await page.click('.nav-item[data-view="business.catalogue"]');
  await page.waitForTimeout(150);

  // Add a manual product to catalogue
  await page.click('[data-action="toggle-add-product"]');
  await page.fill('#np-nom', 'Robot nettoyeur électrique Pro');
  await page.selectOption('#np-cat', 'Entretien');
  await page.fill('#np-unite', 'u');
  await page.fill('#np-prix', '4200');
  await page.click('[data-action="save-product"]');
  await page.waitForTimeout(150);
  const catalogueCount = await page.$eval('.section-head h2', el => el.textContent);
  console.log('Catalogue header after add:', catalogueCount);
  const foundInTable = await page.locator('td', { hasText: 'Robot nettoyeur électrique Pro' }).count();
  console.log('Robot found in table rows:', foundInTable);

  // Delete a product
  const beforeCount = await page.$$eval('.table-wrap tbody tr', rows => rows.length);
  await page.locator('[data-action="delete-product"]').first().click();
  await page.waitForTimeout(150);
  const afterCount = await page.$$eval('.table-wrap tbody tr', rows => rows.length);
  console.log('Rows before delete:', beforeCount, 'after delete:', afterCount);

  // Devis manual line add
  await page.click('.nav-item[data-view="business.devis"]');
  await page.waitForTimeout(150);
  await page.click('[data-action="toggle-add-line"]');
  await page.selectOption('#al-catalogue', { label: (await page.$eval('#al-catalogue option:nth-child(2)', el => el.textContent)) });
  await page.waitForTimeout(100);
  const filledNom = await page.$eval('#al-nom', el => el.value);
  const filledPrix = await page.$eval('#al-prix', el => el.value);
  console.log('Auto-filled from catalogue -> nom:', filledNom, 'prix:', filledPrix);
  await page.fill('#al-qte', '3');
  await page.click('[data-action="add-manual-line"]');
  await page.waitForTimeout(150);
  const lineCount = await page.$eval('.card-title span', el => el.textContent).catch(()=>null);
  const rows = await page.$$eval('#content .table-wrap:first-of-type tbody tr, #content table tbody tr', rows => rows.map(r=>r.textContent.trim()));
  console.log('Devis line count label:', lineCount);
  console.log('Devis items rows sample:', rows.slice(0,3));

  // Free-form manual line (not from catalogue)
  await page.click('[data-action="toggle-add-line"]');
  await page.selectOption('#al-catalogue', { index: 0 });
  await page.fill('#al-nom', 'Frais de déplacement');
  await page.fill('#al-qte', '1');
  await page.fill('#al-prix', '350');
  await page.click('[data-action="add-manual-line"]');
  await page.waitForTimeout(150);
  const hasFreeform = await page.locator('td', { hasText: 'Frais de déplacement' }).count();
  console.log('Freeform line added:', hasFreeform);

  console.log('----ERRORS----');
  console.log(errors.length ? errors.join('\n') : 'NONE');
  await page.screenshot({ path: 'shot_catalogue_devis_manual.png', fullPage: true });
  await browser.close();
})();
