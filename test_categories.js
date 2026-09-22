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

  // 1. Add a new category
  await page.fill('#new-cat-name', 'Robotique');
  await page.click('[data-action="add-category"]');
  await page.waitForTimeout(150);
  const catBadges = await page.$$eval('.badge.neutral', els => els.map(e => e.textContent.trim()));
  console.log('Categories after add:', catBadges);

  // 2. Try deleting a category that has products (should be disabled/no-op)
  const filtrationBtn = await page.locator('[data-action="delete-category"][data-cat="Filtration"]');
  const isDisabled = await filtrationBtn.isDisabled();
  console.log('Filtration delete button disabled (has products):', isDisabled);

  // 3. Delete the empty "Robotique" category
  await page.click('[data-action="delete-category"][data-cat="Robotique"]');
  await page.waitForTimeout(150);
  const catBadgesAfter = await page.$$eval('.badge.neutral', els => els.map(e => e.textContent.trim()));
  console.log('Categories after deleting empty Robotique:', catBadgesAfter);

  // 4. Add a product using the new category dropdown (re-add Robotique first)
  await page.fill('#new-cat-name', 'Robotique');
  await page.click('[data-action="add-category"]');
  await page.waitForTimeout(150);
  await page.click('[data-action="toggle-add-product"]');
  await page.fill('#np-nom', 'Robot Dolphin E20');
  await page.selectOption('#np-cat', 'Robotique');
  await page.fill('#np-unite', 'u');
  await page.fill('#np-prix', '5600');
  await page.click('[data-action="save-product"]');
  await page.waitForTimeout(150);
  const robotRow = await page.locator('tr[data-id]', { hasText: 'Robot Dolphin E20' }).count();
  console.log('Robot Dolphin row created:', robotRow);

  // 5. Edit an existing product's name, unit, price, and reassign its category
  const firstRow = page.locator('tr[data-id]').first();
  const rowId = await firstRow.getAttribute('data-id');
  await page.fill(`.cat-nom[data-id="${rowId}"]`, 'Filtre à sable Ø400 (modifié)');
  await page.locator(`.cat-nom[data-id="${rowId}"]`).blur();
  await page.fill(`.cat-unite[data-id="${rowId}"]`, 'unité');
  await page.locator(`.cat-unite[data-id="${rowId}"]`).blur();
  await page.fill(`.cat-price[data-id="${rowId}"]`, '2500');
  await page.locator(`.cat-price[data-id="${rowId}"]`).blur();
  await page.selectOption(`.cat-cat[data-id="${rowId}"]`, 'Robotique');
  await page.waitForTimeout(150);
  const movedRow = await page.locator('tr[data-id]', { hasText: 'Filtre à sable Ø400 (modifié)' }).count();
  console.log('Renamed/reassigned product still findable after re-render:', movedRow);

  console.log('----ERRORS----');
  console.log(errors.length ? errors.join('\n') : 'NONE');
  await page.screenshot({ path: 'shot_categories.png', fullPage: true });
  await browser.close();
})();
