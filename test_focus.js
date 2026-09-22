const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('ERR_TUNNEL')) errors.push('CONSOLE: ' + msg.text()); });

  await page.goto('file://' + path.resolve('index.html'));
  await page.waitForTimeout(150);
  await page.evaluate(() => { STATE.auth.loggedIn = true; STATE.role = 'business'; saveState(); render(); });
  await page.waitForTimeout(150);

  async function typeTest(label, navView, selector, text) {
    await page.click(`.nav-item[data-view="${navView}"]`);
    await page.waitForTimeout(150);
    await page.click(selector);
    await page.keyboard.press('Control+A');
    await page.keyboard.type(text, { delay: 60 });
    await page.waitForTimeout(150);
    const val = await page.$eval(selector, el => el.value);
    console.log(`${label}: typed "${text}" -> got "${val}"`, val === text ? 'OK' : 'MISMATCH');
  }

  await typeTest('Etude longueur', 'business.etude', '.et-input[data-k="longueur"]', '12.5');
  await typeTest('Entretien pH', 'business.entretien', '.en-input[data-k="ph"]', '7.55');
  await typeTest('Hydraulique distance', 'business.hydraulique', '.hy-input[data-k="distance"]', '15');
  await typeTest('Sterilisation volume', 'business.sterilisation', '.st-input[data-k="volume"]', '88');

  await page.click('.nav-item[data-view="business.devis"]');
  await page.waitForTimeout(150);
  await typeTest('Devis societe', 'business.devis', '.dv-input[data-k="societe"][data-scope="template"]', 'Nouvelle Société Test');
  await page.click('[data-action="devis-tab"][data-tab="cps"]');
  await page.waitForTimeout(150);
  await typeTest('CPS adresse', 'business.devis', '.cps-input[data-k="adresseChantier"]', 'Rue des Tests 42');

  // textarea test
  await page.click('.nav-item[data-view="business.devis"]');
  await page.click('[data-action="devis-tab"][data-tab="devis"]');
  await page.waitForTimeout(150);
  await page.click('.dv-input[data-k="entete"][data-scope="template"]');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Texte en-tete de test long', { delay: 40 });
  await page.waitForTimeout(150);
  const enteteVal = await page.$eval('.dv-input[data-k="entete"][data-scope="template"]', el => el.value);
  console.log('Devis entete textarea ->', enteteVal, enteteVal === 'Texte en-tete de test long' ? 'OK' : 'MISMATCH');

  console.log('----ERRORS----');
  console.log(errors.length ? errors.join('\n') : 'NONE');
  await browser.close();
})();
