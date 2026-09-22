const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('file://' + path.resolve('/home/claude/index.html'));
  await page.waitForTimeout(150);
  await page.evaluate(() => { STATE.auth.loggedIn = true; STATE.role = 'business'; STATE.auth.currentBusinessId='b1'; STATE.businesses.find(b=>b.id==='b1').plan='business'; STATE.devisTab='devis'; saveState(); render(); });
  await page.waitForTimeout(150);
  await page.evaluate(() => { STATE.view='business.devis'; render(); });
  await page.waitForTimeout(150);
  const result = await page.evaluate(() => {
    const bodyWidth = document.documentElement.clientWidth;
    let offenders = [];
    document.querySelectorAll('body *').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.right > bodyWidth + 2 || r.width > bodyWidth + 2) {
        offenders.push({tag: el.tagName, cls: el.className && el.className.toString().slice(0,60), width: Math.round(r.width), right: Math.round(r.right)});
      }
    });
    offenders.sort((a,b)=> b.width - a.width);
    return { scrollWidth: document.documentElement.scrollWidth, bodyWidth, offenders: offenders.slice(0,10) };
  });
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
