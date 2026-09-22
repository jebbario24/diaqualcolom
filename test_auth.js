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

  // 1. Fresh load -> landing page, not logged in
  let heroVisible = await page.locator('.hero h1').count();
  console.log('Fresh load shows landing hero:', heroVisible > 0);
  let sidebarVisible = await page.locator('.sidebar').count();
  console.log('App sidebar NOT shown while logged out:', sidebarVisible === 0);

  // 2. Nav to pricing
  await page.click('.public-nav-link[data-view="pricing"]');
  await page.waitForTimeout(120);
  const pricingCards = await page.$$eval('.pricing-card-public .card-title', els => els.map(e => e.textContent.trim()));
  console.log('Public pricing cards:', pricingCards);

  // 3. Nav to login
  await page.click('[data-action="public-go"][data-view="login"]');
  await page.waitForTimeout(120);
  const loginFormVisible = await page.locator('#login-email').count();
  console.log('Login form visible:', loginFormVisible > 0);

  // 4. Wrong credentials -> error shown
  await page.fill('#login-email', 'wrong@example.com');
  await page.fill('#login-password', 'wrongpass');
  await page.click('[data-action="do-login"]');
  await page.waitForTimeout(120);
  const errShown = await page.locator('.callout.danger').count();
  console.log('Login error shown for bad creds:', errShown > 0);

  // 5. Correct credentials (business demo account) -> logs in
  await page.fill('#login-email', 'contact@aquatech.ma');
  await page.fill('#login-password', 'business123');
  await page.click('[data-action="do-login"]');
  await page.waitForTimeout(150);
  sidebarVisible = await page.locator('.sidebar').count();
  console.log('App sidebar shown after successful login:', sidebarVisible > 0);
  const topbarTitle = await page.locator('.topbar-title').textContent();
  console.log('Dashboard title after login:', topbarTitle);

  // 6. Reload -> still logged in (persisted)
  await page.reload();
  await page.waitForTimeout(150);
  sidebarVisible = await page.locator('.sidebar').count();
  console.log('Still logged in after reload:', sidebarVisible > 0);

  // 7. Account settings: change email
  await page.click('.nav-item[data-view="business.account"]');
  await page.waitForTimeout(120);
  await page.fill('#acct-email', 'nouveau@aquatech.ma');
  await page.click('[data-action="save-email"]');
  await page.waitForTimeout(120);
  const emailSavedMsg = await page.locator('.callout.ok').count();
  const emailSaved = await page.evaluate(() => STATE.auth.accounts.businesses.find(a => a.businessId === 'b1').email);
  console.log('Email save confirmation shown:', emailSavedMsg > 0, '| new email persisted:', emailSaved);

  // 8. Account settings: wrong current password blocked
  await page.fill('#acct-pwd-current', 'WRONGCURRENT');
  await page.fill('#acct-pwd-new', 'newpass123');
  await page.fill('#acct-pwd-confirm', 'newpass123');
  await page.click('[data-action="save-password"]');
  await page.waitForTimeout(120);
  let pwdErrShown = await page.locator('.callout.danger').count();
  console.log('Wrong current-password blocked with error:', pwdErrShown > 0);

  // 9. Mismatch confirm blocked
  await page.fill('#acct-pwd-current', 'business123');
  await page.fill('#acct-pwd-new', 'newpass123');
  await page.fill('#acct-pwd-confirm', 'DIFFERENT');
  await page.click('[data-action="save-password"]');
  await page.waitForTimeout(120);
  pwdErrShown = await page.locator('.callout.danger').count();
  console.log('Mismatched confirm blocked with error:', pwdErrShown > 0);

  // 10. Correct password change succeeds
  await page.fill('#acct-pwd-current', 'business123');
  await page.fill('#acct-pwd-new', 'newpass123');
  await page.fill('#acct-pwd-confirm', 'newpass123');
  await page.click('[data-action="save-password"]');
  await page.waitForTimeout(120);
  const pwdOkShown = await page.locator('.callout.ok').count();
  const newPwd = await page.evaluate(() => STATE.auth.accounts.businesses.find(a => a.businessId === 'b1').password);
  console.log('Password change succeeded, confirmation shown:', pwdOkShown > 0, '| new password persisted:', newPwd === 'newpass123');

  // 11. Logout via account settings page button
  await page.click('[data-action="logout-account"]');
  await page.waitForTimeout(150);
  heroVisible = await page.locator('.hero h1').count();
  console.log('Logout returns to landing page:', heroVisible > 0);

  // 12. Log back in with the NEW password + new email to confirm persistence end-to-end
  await page.click('[data-action="public-go"][data-view="login"]');
  await page.waitForTimeout(100);
  await page.fill('#login-email', 'nouveau@aquatech.ma');
  await page.fill('#login-password', 'newpass123');
  await page.click('[data-action="do-login"]');
  await page.waitForTimeout(150);
  sidebarVisible = await page.locator('.sidebar').count();
  console.log('Re-login with new email+password works:', sidebarVisible > 0);

  // 13. Sidebar quick-logout icon works too
  await page.click('[data-action="logout"]');
  await page.waitForTimeout(150);
  heroVisible = await page.locator('.hero h1').count();
  console.log('Sidebar quick-logout returns to landing:', heroVisible > 0);

  // 14. Demo quick-login buttons (admin/business/particulier)
  await page.click('[data-action="public-go"][data-view="login"]');
  await page.waitForTimeout(100);
  await page.click('[data-action="demo-login"][data-role="particulier"]');
  await page.waitForTimeout(150);
  const roleChipCount = await page.locator('.role-btn.active').count();
  console.log('Demo quick-login as particulier -> role-switcher panel correctly hidden (admin-only now):', roleChipCount === 0);

  // 15. i18n leak scan across public pages (landing/pricing/login) — French-only app now
  await page.evaluate(() => { doLogout(); });
  await page.waitForTimeout(100);
  const leakedAll = [];
  for (const lang of ['fr']) {
    await page.waitForTimeout(80);
    for (const view of ['landing','pricing','login']) {
      await page.evaluate((v) => { STATE.publicView = v; render(); }, view);
      await page.waitForTimeout(80);
      const leaked = await page.evaluate(() => {
        const all = document.querySelectorAll('body *');
        const found = new Set();
        const re = /^[a-z]+(\.[a-z0-9]+){1,4}$/;
        all.forEach(el => {
          if (el.children.length === 0) {
            const txt = (el.textContent||'').trim();
            if (re.test(txt)) found.add(txt);
          }
        });
        return [...found];
      });
      leaked.forEach(k => leakedAll.push(lang+'/'+view+': '+k));
    }
  }
  console.log('Leaked raw i18n keys on public pages:', leakedAll);

  // 16. Language switcher removed (French-only app)
  const langSwitchCount = await page.locator('.lang-switch').count();
  console.log('Language switcher absent from UI:', langSwitchCount === 0);

  console.log('----ERRORS----');
  console.log(errors.length ? errors.join('\n') : 'NONE');
  await browser.close();
})();
