const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  let xssFired = false;
  page.on('dialog', async d => { xssFired = true; await d.dismiss(); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('ERR_TUNNEL')) errors.push('CONSOLE: ' + msg.text()); });

  await page.goto('file://' + path.resolve('/home/claude/index.html'));
  await page.waitForTimeout(150);
  await page.evaluate(() => { STATE.auth.loggedIn = true; STATE.role = 'admin'; saveState(); render(); });
  await page.waitForTimeout(150);
  await page.click('.nav-item[data-view="admin.plans"]');
  await page.waitForTimeout(150);

  const payload = '<img src=x onerror="window.__xss=true">';
  await page.fill('.plan-edit-name[data-id="proprietaire"]', payload);
  await page.locator('.plan-edit-name[data-id="proprietaire"]').dispatchEvent('change');
  await page.waitForTimeout(150);

  const xssRan = await page.evaluate(() => window.__xss === true);
  console.log('Injected <img onerror> in plan name executed on Admin > Plans card:', xssRan);

  const cardTitleHTML = await page.evaluate(() => document.querySelector('.plan-edit-name[data-id="proprietaire"]').closest('.card').querySelector('.card-title').innerHTML);
  console.log('Admin card-title innerHTML (should be text-escaped, not a live <img> tag):', cardTitleHTML);

  // Also check the public pricing page and the admin businesses plan-select dropdown
  await page.evaluate(() => { doLogout(); STATE.publicView = 'pricing'; render(); });
  await page.waitForTimeout(120);
  const xssRanPublic = await page.evaluate(() => window.__xss === true);
  const publicCardTitleHTML = await page.evaluate(() => {
    const card = [...document.querySelectorAll('.pricing-card-public')].find(c => c.innerHTML.includes('img'));
    return card ? card.querySelector('.card-title').innerHTML : 'NOT FOUND AS RAW HTML';
  });
  console.log('XSS fired on public pricing page:', xssRanPublic, '| card-title innerHTML:', publicCardTitleHTML);

  // Check the admin businesses plan-select dropdown and the sidebar quick-switcher too
  await page.evaluate(() => { STATE.auth.loggedIn = true; STATE.role = 'admin'; saveState(); render(); });
  await page.waitForTimeout(120);
  await page.click('.nav-item[data-view="admin.particuliers"]');
  await page.waitForTimeout(120);
  const optionHTML = await page.evaluate(() => [...document.querySelectorAll('.plan-select option')].find(o => o.value === 'proprietaire')?.outerHTML);
  console.log('Admin particuliers plan-select option is a real <option> (not broken out of the tag):', optionHTML);
  const switcherHTML = await page.evaluate(() => document.querySelector('[data-action="switch-role-plan"][data-plan="proprietaire"]')?.innerHTML);
  console.log('Sidebar quick-switcher button text is escaped:', switcherHTML);

  // Sanity: a normal plan name with an ampersand/apostrophe still displays correctly (no double-escaping)
  await page.click('.nav-item[data-view="admin.plans"]');
  await page.waitForTimeout(120);
  await page.fill('.plan-edit-name[data-id="business"]', "R&D & L'Entreprise");
  await page.locator('.plan-edit-name[data-id="business"]').dispatchEvent('change');
  await page.waitForTimeout(120);
  const normalNameDisplayed = await page.evaluate(() => document.querySelector('.plan-edit-name[data-id="business"]').closest('.card').querySelector('.card-title').textContent);
  console.log('Plan name with & and \' displays correctly, not double-escaped:', normalNameDisplayed);

  console.log('----ERRORS----');
  console.log(errors.length ? errors.join('\n') : 'NONE');
  await browser.close();
})();
