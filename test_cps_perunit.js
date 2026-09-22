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

  // 1. Admin > Plans: CPS plan's price unit reads "MAD / CPS", not "MAD / mois"
  const cpsUnit = await page.evaluate(() => document.querySelector('.plan-edit-price[data-id="cps"]').closest('.field').querySelector('span').textContent);
  console.log('CPS plan price unit label:', cpsUnit);

  // 2. Other plans (e.g. Business) still read "MAD / mois" — only CPS is pay-per-use
  const businessUnit = await page.evaluate(() => document.querySelector('.plan-edit-price[data-id="business"]').closest('.field').querySelector('span').textContent);
  console.log('Business plan price unit label (should stay monthly):', businessUnit);

  // 3. The CPS plan's own "CPS" quota field is replaced by an "unlimited / billed per use" note, not an editable number
  const cpsQuotaInputGone = await page.locator('.plan-edit-quota[data-id="cps"][data-cat="cps"]').count();
  const cpsNoteText = await page.evaluate(() => {
    const label = [...document.querySelectorAll('.card')].find(c => c.querySelector('.plan-edit-price[data-id="cps"]'));
    return label ? label.textContent.includes('Illimité') : false;
  });
  console.log('CPS plan\'s own quota input removed:', cpsQuotaInputGone === 0, '| replaced by "Illimité" note:', cpsNoteText);

  // 4. Business plan's CPS quota field is untouched (still an editable monthly cap, e.g. 50)
  const businessCpsQuota = await page.locator('.plan-edit-quota[data-id="business"][data-cat="cps"]').inputValue();
  console.log('Business plan CPS quota still editable monthly cap:', businessCpsQuota);

  // 5. Public pricing page: CPS card shows the per-unit unit label and an "unlimited, billed per use" feature line, not "1 CPS / mois"
  await page.evaluate(() => { doLogout(); STATE.publicView = 'pricing'; render(); });
  await page.waitForTimeout(120);
  const cpsCardText = await page.evaluate(() => {
    const card = [...document.querySelectorAll('.pricing-card-public')].find(c => c.querySelector('.card-title').textContent.trim() === 'CPS');
    return card ? card.textContent.replace(/\s+/g,' ').trim() : null;
  });
  console.log('Public CPS pricing card text:', cpsCardText);

  // 6. Signup dropdown: CPS option shows "MAD / CPS"
  await page.click('[data-action="public-go"][data-view="pricing"]');
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('.pricing-card-public')].find(c => c.querySelector('.card-title').textContent.trim() === 'CPS');
    card.querySelector('[data-action="choose-plan"]').click();
  });
  await page.waitForTimeout(120);
  const cpsOptionText = await page.evaluate(() => [...document.querySelectorAll('#signup-plan option')].find(o => o.value === 'cps').textContent);
  console.log('Signup dropdown CPS option text:', cpsOptionText);

  // 7. A particulier on the CPS plan can generate CPS documents without limit — tryConsume never blocks
  await page.evaluate(() => { doLogout(); STATE.auth.loggedIn = true; STATE.role = 'particulier'; STATE.auth.currentParticulierId = STATE.particuliers.find(p=>p.plan==='cps').id; saveState(); render(); });
  await page.waitForTimeout(120);
  const consumeResults = await page.evaluate(() => { const out = []; for (let i=0;i<10;i++) out.push(tryConsume('particulier','cps')); return out; });
  console.log('10 consecutive CPS generations, all succeed (pay-per-use, no cap):', consumeResults.every(r => r === true));

  // 8. The "Mon CPS" print button shows a per-unit usage/cost hint, not a "remaining/quota" message
  await page.click('.nav-item[data-view="particulier.cps"]');
  await page.waitForTimeout(150);
  const hintText = await page.evaluate(() => { const h = document.querySelector('[data-action="print-doc"]')?.nextElementSibling; return h ? h.textContent : null; });
  console.log('CPS page hint (should mention price per CPS and usage, not "restant"):', hintText);

  // 9. A business account on a bundled-CPS plan ("Business", 50/month) is still capped by its monthly quota — unaffected by CPS's per-use change
  await page.evaluate(() => { doLogout(); STATE.auth.loggedIn = true; STATE.role = 'business'; STATE.auth.currentBusinessId = 'b1'; STATE.plans.business.quotas.cps = 2; saveState(); render(); });
  await page.waitForTimeout(100);
  const bizConsume = await page.evaluate(() => [tryConsume('business','cps'), tryConsume('business','cps'), tryConsume('business','cps')]);
  console.log('Business plan (50->2/month for this test) CPS quota still caps at the set limit:', JSON.stringify(bizConsume));

  console.log('----ERRORS----');
  console.log(errors.length ? errors.join('\n') : 'NONE');
  await browser.close();
})();
