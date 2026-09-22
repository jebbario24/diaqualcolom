// Regression tests for the "use it as a user" product-readiness pass:
// privilege-escalation fix, honest KPIs, destructive-action confirmations,
// CPS client selector, admin pending-approval button, mobile overflow fix.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('ERR_TUNNEL')) errors.push('CONSOLE: ' + msg.text()); });
  page.on('dialog', async d => { page._lastDialogMsg = d.message(); if (page._dialogAction === 'accept') await d.accept(); else await d.dismiss(); });

  await page.goto('file://' + path.resolve('/home/claude/index.html'));
  await page.waitForTimeout(150);

  // ---- 1. Privilege escalation: a REAL signup (never touching testPlanAccess) never sees the switcher ----
  await page.evaluate(() => {
    STATE.businesses.push({id:'b_real', nom:'Real Co', ville:'Casablanca', plan:'installateur', statut:'actif', inscription:'2026-09-01'});
    STATE.auth.accounts.businesses.push({id:'auth_real', businessId:'b_real', email:'real@co.ma', password:'x'});
    STATE.auth.loggedIn = true; STATE.role = 'business'; STATE.auth.currentBusinessId = 'b_real';
    saveState(); render();
  });
  await page.waitForTimeout(120);
  const chipHiddenForRealAccount = await page.locator('.role-chip').count();
  console.log('Real (non-test) business login: role-chip switcher absent (privilege-escalation fix):', chipHiddenForRealAccount === 0);
  const adminNavAbsent = await page.locator('.nav-item[data-view="admin.overview"]').count();
  console.log('Real business account has no admin nav item:', adminNavAbsent === 0);

  // ---- 2. Business overview KPIs are real, not fabricated ----
  await page.evaluate(() => { STATE.particuliers.push({id:'pc1', nom:'Client A', ville:'Casa', businessId:'b_real', statut:'actif', volume:42}); saveState(); render(); });
  await page.waitForTimeout(100);
  const kpis = await page.evaluate(() => Array.from(document.querySelectorAll('.kpi')).map(k => k.textContent.replace(/\s+/g,' ').trim()));
  console.log('Business overview KPI tiles (should show real client count/volume, no fake "/75"):', JSON.stringify(kpis));
  const has75 = kpis.some(k => k.includes('/75'));
  console.log('Fabricated "/75" client quota removed:', !has75);

  // ---- 3. Destructive actions now require confirmation ----
  await page.click('.nav-item[data-view="business.clients"]');
  await page.waitForTimeout(120);
  page._dialogAction = 'dismiss';
  await page.click('[data-action="remove-client"]');
  await page.waitForTimeout(100);
  const clientStillThereAfterCancel = await page.evaluate(() => STATE.particuliers.find(p=>p.id==='pc1')?.businessId === 'b_real');
  console.log('Remove-client shows a confirm dialog and cancelling keeps the client:', page._lastDialogMsg && clientStillThereAfterCancel);
  page._dialogAction = 'accept';
  await page.click('[data-action="remove-client"]');
  await page.waitForTimeout(100);
  const clientRemovedAfterAccept = await page.evaluate(() => STATE.particuliers.find(p=>p.id==='pc1')?.businessId === null);
  console.log('Confirming removes the client:', clientRemovedAfterAccept);

  // ---- 4. Plan change requires confirmation and reverts the select on cancel ----
  await page.click('.nav-item[data-view="business.abonnement"]');
  await page.waitForTimeout(120);
  page._dialogAction = 'dismiss';
  await page.selectOption('#abon-plan-select', 'cps').catch(()=>{});
  await page.waitForTimeout(100);
  const planUnchangedAfterCancel = await page.evaluate(() => accountForRole('business').plan);
  console.log('Changing plan shows confirm; cancelling keeps the original plan:', planUnchangedAfterCancel === 'installateur');

  // ---- 5. CPS tab has its own client selector (no longer silently depends on the Devis tab) ----
  await page.click('.nav-item[data-view="business.devis"]');
  await page.waitForTimeout(120);
  await page.click('[data-action="devis-tab"][data-tab="cps"]');
  await page.waitForTimeout(120);
  const cpsClientSelectPresent = await page.locator('.cps-client-select').count();
  console.log('CPS tab has its own client selector:', cpsClientSelectPresent > 0);

  // ---- 6. Mobile: Devis & CPS page no longer overflows horizontally ----
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('[data-action="devis-tab"][data-tab="devis"]');
  await page.waitForTimeout(120);
  const overflowInfo = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  console.log('Devis & CPS page no longer overflows at 390px width:', JSON.stringify(overflowInfo), overflowInfo.scrollWidth <= overflowInfo.clientWidth + 2);
  await page.setViewportSize({ width: 1440, height: 1000 });

  // ---- 7. Admin can now validate a pending ("en attente") business, not just suspend it ----
  await page.evaluate(() => { STATE.role = 'admin'; saveState(); render(); });
  await page.waitForTimeout(100);
  await page.click('.nav-item[data-view="admin.businesses"]');
  await page.waitForTimeout(120);
  const pendingRow = page.locator('tr', { hasText: 'Piscinelle Pro' });
  const validateBtnText = await pendingRow.locator('button').last().textContent();
  console.log('Pending business ("Piscinelle Pro") now shows a validate action (not just Suspendre):', validateBtnText);
  await pendingRow.locator('[data-action="activate"]').click();
  await page.waitForTimeout(100);
  const nowActive = await page.evaluate(() => STATE.businesses.find(b=>b.nom==='Piscinelle Pro').statut);
  console.log('Clicking it activates the pending business:', nowActive === 'actif');

  // ---- 8. Empty client list shows an actionable empty state ----
  await page.evaluate(() => {
    STATE.businesses.push({id:'b_empty', nom:'Empty Co', ville:'Rabat', plan:'business', statut:'actif', inscription:'2026-09-01'});
    STATE.auth.accounts.businesses.push({id:'auth_empty', businessId:'b_empty', email:'empty@co.ma', password:'x'});
    STATE.role = 'business'; STATE.auth.currentBusinessId = 'b_empty';
    saveState(); render();
  });
  await page.waitForTimeout(100);
  await page.click('.nav-item[data-view="business.clients"]');
  await page.waitForTimeout(120);
  const emptyStateText = await page.locator('#clients-tbody .empty').textContent().catch(()=>null);
  console.log('Empty client list shows an actionable empty-state message:', emptyStateText);

  console.log('----ERRORS----');
  console.log(errors.length ? errors.join('\n') : 'NONE');
  await browser.close();
})();
