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

  // 1. Landing -> pricing (both landing CTAs should send visitors to pricing to choose a plan)
  await page.click('[data-action="public-go"][data-view="pricing"]');
  await page.waitForTimeout(120);
  const onPricing = await page.locator('.pricing-card-public').count();
  console.log('Landing CTA leads to pricing page:', onPricing > 0);

  // 2. Clicking the "Installateur" (business) plan CTA -> signup, plan pre-selected
  const installateurCard = page.locator('.pricing-card-public', { hasText: 'Installateur' });
  await installateurCard.locator('[data-action="choose-plan"]').click();
  await page.waitForTimeout(120);
  const selectedPlan = await page.locator('#signup-plan').inputValue();
  const nomLabel = await page.locator('#signup-nom-label').textContent();
  console.log('Signup pre-selected plan:', selectedPlan, '| nom label (business):', nomLabel);

  // 3. Switching the plan selector to a particulier plan flips the label WITHOUT losing typed fields
  await page.fill('#signup-nom', 'Test Entreprise SARL');
  await page.fill('#signup-email', 'test.entreprise@example.com');
  await page.selectOption('#signup-plan', 'cps');
  await page.waitForTimeout(80);
  const nomLabelAfterSwitch = await page.locator('#signup-nom-label').textContent();
  const nomStillFilled = await page.locator('#signup-nom').inputValue();
  console.log('Nom label after switching to CPS (particulier):', nomLabelAfterSwitch, '| typed nom preserved:', nomStillFilled);

  // 4. Switch back to a business plan and submit a full signup
  await page.selectOption('#signup-plan', 'business');
  await page.fill('#signup-ville', 'Agadir');
  await page.fill('#signup-password', 'monmotdepasse');
  await page.fill('#signup-password-confirm', 'motdifferent');
  await page.click('[data-action="do-signup"]');
  await page.waitForTimeout(120);
  let errShown = await page.locator('.callout.danger').count();
  console.log('Mismatched password blocked at signup:', errShown > 0);

  await page.fill('#signup-password-confirm', 'monmotdepasse');
  await page.click('[data-action="do-signup"]');
  await page.waitForTimeout(150);

  // 5. Signup should log the visitor straight in, on the business plan they chose, with real data
  const sidebarVisible = await page.locator('.sidebar').count();
  const newAccount = await page.evaluate(() => {
    const acc = accountForRole('business');
    return acc ? { nom: acc.nom, ville: acc.ville, plan: acc.plan, statut: acc.statut } : null;
  });
  console.log('Logged in immediately after signup:', sidebarVisible > 0, '| new business record:', JSON.stringify(newAccount));

  // 6. The new account is a REAL, independently addressable account: admin sees it in the businesses list
  await page.evaluate(() => { STATE.role = 'admin'; saveState(); render(); });
  await page.waitForTimeout(120);
  await page.click('.nav-item[data-view="admin.businesses"]');
  await page.waitForTimeout(120);
  const adminSeesIt = await page.locator('tr', { hasText: 'Test Entreprise SARL' }).count();
  console.log('New business visible in Admin > Comptes Business:', adminSeesIt > 0);

  // 7. Duplicate email is rejected on a second signup attempt
  await page.evaluate(() => { doLogout(); });
  await page.waitForTimeout(100);
  await page.evaluate(() => { STATE.publicView = 'signup'; STATE.signupPlan = 'proprietaire'; render(); });
  await page.waitForTimeout(100);
  await page.fill('#signup-nom', 'Doublon');
  await page.fill('#signup-email', 'test.entreprise@example.com'); // already used above
  await page.fill('#signup-password', 'autremotdepasse');
  await page.fill('#signup-password-confirm', 'autremotdepasse');
  await page.click('[data-action="do-signup"]');
  await page.waitForTimeout(120);
  errShown = await page.locator('.callout.danger').count();
  console.log('Duplicate email rejected at signup:', errShown > 0);

  // 8. Log back in with the freshly created account's own credentials (not a demo account)
  await page.fill('#signup-email', 'brand.new@example.com');
  await page.fill('#signup-nom', 'Doublon');
  await page.click('[data-action="do-signup"]');
  await page.waitForTimeout(150);
  await page.evaluate(() => { doLogout(); });
  await page.waitForTimeout(100);
  await page.click('[data-action="public-go"][data-view="login"]');
  await page.waitForTimeout(100);
  await page.fill('#login-email', 'test.entreprise@example.com');
  await page.fill('#login-password', 'monmotdepasse');
  await page.click('[data-action="do-login"]');
  await page.waitForTimeout(150);
  const loggedInAsOwnAccount = await page.evaluate(() => ({ loggedIn: STATE.auth.loggedIn, role: STATE.role, businessNom: accountForRole('business')?.nom }));
  console.log('Re-login with the signed-up account works and resolves to the right business:', JSON.stringify(loggedInAsOwnAccount));

  // 9. Original demo accounts still work unaffected (existing demo flow not broken by the new signup accounts)
  await page.evaluate(() => { doLogout(); });
  await page.waitForTimeout(100);
  await page.click('[data-action="public-go"][data-view="login"]');
  await page.waitForTimeout(100);
  await page.click('[data-action="demo-login"][data-role="business"]');
  await page.waitForTimeout(150);
  const demoStillWorks = await page.evaluate(() => accountForRole('business')?.nom);
  console.log('Demo business account still resolves correctly:', demoStillWorks);

  console.log('----ERRORS----');
  console.log(errors.length ? errors.join('\n') : 'NONE');
  await browser.close();
})();
