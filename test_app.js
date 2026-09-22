const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text()); });

  await page.goto('file://' + path.resolve('index.html'));
  await page.waitForTimeout(300);
  // Bypass the login gate — these tests exercise the app internals, not auth.
  await page.evaluate(() => { STATE.auth.loggedIn = true; STATE.role = 'business'; saveState(); render(); });
  await page.waitForTimeout(150);

  const roles = ['admin', 'business', 'particulier'];
  for (const role of roles) {
    await page.evaluate((r) => { STATE.role = r; saveState(); render(); }, role);
    await page.waitForTimeout(150);
    const navItems = await page.$$eval('.nav-item', els => els.map(e => e.dataset.view));
    for (const view of navItems) {
      await page.click(`.nav-item[data-view="${view}"]`);
      await page.waitForTimeout(150);
      const title = await page.$eval('.topbar-title', el => el.textContent).catch(()=> 'N/A');
      console.log(`[${role}] -> ${view} :: ${title}`);
    }
  }

  // Exercise some interactive bits: étude calculator inputs, entretien, devis logo, print buttons existence
  await page.evaluate(() => { STATE.role = 'business'; saveState(); render(); });
  await page.click('.nav-item[data-view="business.etude"]');
  await page.waitForTimeout(150);
  await page.fill('.et-input[data-k="longueur"]', '10');
  await page.fill('.et-input[data-k="largeur"]', '5');
  await page.waitForTimeout(150);
  const volText = await page.$eval('.metric-tile .v', el => el.textContent);
  console.log('Volume tile after edit:', volText);

  await page.click('[data-action="add-to-devis"]');
  await page.waitForTimeout(150);
  const devisTitle = await page.$eval('.topbar-title', el => el.textContent);
  console.log('After add-to-devis, view title:', devisTitle);
  const rowCount = await page.$$eval('#content table tbody tr', rows => rows.length);
  console.log('Devis rows:', rowCount);

  await page.click('.nav-item[data-view="business.entretien"]');
  await page.waitForTimeout(150);
  await page.fill('.en-input[data-k="ph"]', '8.2');
  await page.fill('.en-input[data-k="chlore"]', '0.3');
  await page.waitForTimeout(150);

  await page.click('.nav-item[data-view="business.hydraulique"]');
  await page.waitForTimeout(150);
  await page.click('.nav-item[data-view="business.sterilisation"]');
  await page.waitForTimeout(150);
  await page.click('.nav-item[data-view="business.catalogue"]');
  await page.waitForTimeout(150);
  await page.click('.nav-item[data-view="business.devis"]');
  await page.waitForTimeout(150);

  await page.click('[data-action="toggle-theme"]');
  await page.waitForTimeout(150);

  console.log('----ERRORS----');
  console.log(errors.length ? errors.join('\n') : 'NONE');

  await browser.close();
})();
