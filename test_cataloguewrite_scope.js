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

  // 1. The "Peut ajouter ses propres produits au catalogue" checkbox no longer appears on
  //    particulier-role plan cards (CPS, Propriétaire) since it has zero effect there.
  const cpsCheckbox = await page.locator('.plan-edit-cataloguewrite[data-id="cps"]').count();
  const proprietaireCheckbox = await page.locator('.plan-edit-cataloguewrite[data-id="proprietaire"]').count();
  console.log('CPS plan card no longer shows the catalogue-write checkbox:', cpsCheckbox === 0);
  console.log('Propriétaire plan card no longer shows the catalogue-write checkbox:', proprietaireCheckbox === 0);

  // 2. It's still present and functional for business-role plans
  const installateurCheckbox = await page.locator('.plan-edit-cataloguewrite[data-id="installateur"]').count();
  const businessCheckbox = await page.locator('.plan-edit-cataloguewrite[data-id="business"]').count();
  console.log('Installateur/Business plan cards still show it:', installateurCheckbox === 1 && businessCheckbox === 1);

  // 3. Even if catalogueWrite were somehow true on a particulier plan (e.g. old saved data),
  //    the public pricing page never advertises the catalogue feature for it.
  await page.evaluate(() => { STATE.plans.cps.catalogueWrite = true; saveState(); doLogout(); STATE.publicView = 'pricing'; render(); });
  await page.waitForTimeout(120);
  const cpsCardText = await page.evaluate(() => {
    const card = [...document.querySelectorAll('.pricing-card-public')].find(c => c.querySelector('.card-title').textContent.trim() === 'CPS');
    return card ? card.textContent : '';
  });
  console.log('Public CPS pricing card never shows the catalogue feature line even if the flag is set:', !cpsCardText.includes('catalogue'));

  console.log('----ERRORS----');
  console.log(errors.length ? errors.join('\n') : 'NONE');
  await browser.close();
})();
