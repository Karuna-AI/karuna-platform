import { chromium } from '@playwright/test';
const MOBILE_URL = 'http://localhost:3020';
const browser = await chromium.launch();
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[console.${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.stack || e.message || e}`));
page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
await page.goto(MOBILE_URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
const rootHtml = await page.evaluate(() => {
  const r = document.getElementById('root') || document.body;
  return (r.innerHTML || '').slice(0, 500);
});
console.log('==== CONSOLE / ERRORS ====');
console.log(logs.join('\n'));
console.log('\n==== #root innerHTML (first 500) ====');
console.log(rootHtml || '(empty)');
await browser.close();
