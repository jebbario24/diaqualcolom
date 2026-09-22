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

  // 1. Full particulier signup end-to-end on a non-default plan (CPS), not just business
  await page.click('[data-action="public-go"][data-view="pricing"]');
  await page.waitForTimeout(120);
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('.pricing-card-public')].find(c => c.querySelector('.card-title').textContent.trim() === 'CPS');
    card.querySelector('[data-action="choose-plan"]').click();
  });
  await page.waitForTimeout(120);
  await page.fill('#signup-nom', 'Nouvelle Cliente CPS');
  await page.fill('#signup-ville', 'Fès');
  await page.fill('#signup-email', 'cliente.cps@example.com');
  await page.fill('#signup-password', 'motdepasse1');
  await page.fill('#signup-password-confirm', 'motdepasse1');
  await page.click('[data-action="do-signup"]');
  await page.waitForTimeout(150);
  const cpsSignupResult = await page.evaluate(() => ({ loggedIn: STATE.auth.loggedIn, role: STATE.role, acc: accountForRole('particulier') }));
  console.log('Particulier CPS-plan signup completes:', JSON.stringify(cpsSignupResult));

  // 2. Re-login with the new particulier credentials
  await page.evaluate(() => { doLogout(); });
  await page.waitForTimeout(100);
  await page.click('[data-action="public-go"][data-view="login"]');
  await page.waitForTimeout(100);
  await page.fill('#login-email', 'cliente.cps@example.com');
  await page.fill('#login-password', 'motdepasse1');
  await page.click('[data-action="do-login"]');
  await page.waitForTimeout(150);
  const relogin = await page.evaluate(() => ({ role: STATE.role, nom: accountForRole('particulier')?.nom, plan: accountForRole('particulier')?.plan }));
  console.log('Re-login with new particulier CPS credentials works:', JSON.stringify(relogin));

  // 3. Reload mid-signup (publicView='signup' persisted, but signupDraft is transient) doesn't crash
  await page.evaluate(() => { doLogout(); STATE.publicView = 'signup'; STATE.signupPlan = 'proprietaire'; saveState(); });
  await page.reload();
  await page.waitForTimeout(200);
  const signupFormOk = await page.locator('#signup-plan').count();
  console.log('Reload mid-signup (transient draft reset) still renders the signup form:', signupFormOk > 0);

  // 4. Quota-exhaustion callouts for OTHER categories (not just devis): chauffage, régulateur/électrolyseur
  await page.evaluate(() => { doLogout(); STATE.auth.loggedIn = true; STATE.role = 'particulier'; STATE.auth.currentParticulierId = 'p1'; STATE.particuliers.find(p=>p.id==='p1').plan = 'proprietaire'; saveState(); render(); });
  await page.waitForTimeout(100);
  await page.evaluate(() => { tryConsume('particulier','chauffage'); tryConsume('particulier','regulateur'); tryConsume('particulier','electrolyseur'); });
  await page.click('.nav-item[data-view="particulier.etude"]');
  await page.waitForTimeout(120);
  const etudeExhausted = await page.locator('.callout.danger').count();
  console.log('Étude page shows exhausted-quota callout after using the 1x chauffage quota:', etudeExhausted > 0);
  await page.click('.nav-item[data-view="particulier.sterilisation"]');
  await page.waitForTimeout(120);
  const sterilExhausted = await page.locator('.callout.danger').count();
  console.log('Stérilisation page shows exhausted-quota callout after using its 1x quota:', sterilExhausted > 0);

  // 5. Business plan's bundled CPS quota (monthly, not per-unit) shows the normal "remaining/quota" hint via the real UI flow
  await page.evaluate(() => { doLogout(); STATE.auth.loggedIn = true; STATE.role = 'business'; STATE.auth.currentBusinessId = 'b1'; STATE.businesses.find(b=>b.id==='b1').plan = 'business'; STATE.devisTab = 'cps'; saveState(); render(); });
  await page.waitForTimeout(100);
  await page.click('.nav-item[data-view="business.devis"]');
  await page.waitForTimeout(120);
  const cpsHint = await page.evaluate(() => { const h = document.querySelector('[data-action="print-doc"]')?.nextElementSibling; return h ? h.textContent : null; });
  console.log('Business plan\'s bundled CPS quota hint (should be "restant", NOT per-unit pricing):', cpsHint);

  // 6. Persistence of "admin test mode" across a reload: banner + role + Retour admin still work
  await page.evaluate(() => { doLogout(); STATE.auth.loggedIn = true; STATE.role = 'admin'; saveState(); render(); });
  await page.waitForTimeout(100);
  await page.click('[data-action="switch-role-plan"][data-plan="business"]');
  await page.waitForTimeout(120);
  await page.reload();
  await page.waitForTimeout(200);
  const afterReloadTestState = await page.evaluate(() => ({ role: STATE.role, adminTestActive: STATE.auth.adminTestActive, bannerPresent: !!document.querySelector('[data-action="exit-plan-test"]') }));
  console.log('Test-mode state survives reload:', JSON.stringify(afterReloadTestState));
  await page.click('[data-action="exit-plan-test"]');
  await page.waitForTimeout(150);
  const backToAdmin = await page.evaluate(() => ({ role: STATE.role, currentBusinessId: STATE.auth.currentBusinessId }));
  console.log('"Retour admin" still works after reload:', JSON.stringify(backToAdmin));

  console.log('----ERRORS----');
  console.log(errors.length ? errors.join('\n') : 'NONE');
  await browser.close();
})();
