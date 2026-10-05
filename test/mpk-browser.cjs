const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');

// Integration check against the current MPK feed; requires running Next on port 3001.
(async () => {
  const browser = await puppeteer.launch({executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
  try {
    const page = await browser.newPage();
    await page.setViewport({width: 1400, height: 1000});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.evaluateOnNewDocument(() => localStorage.setItem('mks_transport_providers', '["mpk_rzeszow"]'));
    await page.goto('http://localhost:3001', {waitUntil: 'domcontentloaded', timeout: 60000});
    await page.waitForSelector('.leaflet-marker-icon.mks-bus-marker', {timeout: 45000});
    await page.evaluate(() => document.querySelector('.leaflet-marker-icon.mks-bus-marker').click());
    await page.waitForFunction(() => document.body.innerText.toLowerCase().includes('wszystkie przystanki trasy'), {timeout: 45000});
    await page.waitForFunction(() => performance.getEntriesByType('resource').some(entry => /\/data\/bus-routes\/mpk_rzeszow\/\d+\.json/.test(entry.name)), {timeout: 30000});
    assert.deepEqual(errors, []);
    assert.ok(!(await page.evaluate(() => document.body.innerText)).includes('Przystanek nieznany'));
    await page.screenshot({path: 'test/mpk-route.tmp.png'});
    console.log('Browser: live MPK markers, full stop list and provider geometry passed');
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
