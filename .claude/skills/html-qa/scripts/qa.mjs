#!/usr/bin/env node
// Browser QA for a single-file HTML page (headless Chromium via Playwright).
//
// Usage: node qa.mjs [index.html] [--out DIR] [--no-stress]
//
// For desktop (1440x900) and phone (390x844), light and dark, it checks:
//   - no JS exceptions / console errors on load or during interaction
//   - no network requests beyond the page itself (file:, data:, blob:, about:)
//   - no horizontal overflow (names the offending elements)
//   - no "NaN" / "Infinity" / "undefined" / "null" text rendered on the page
// then clicks every visible button and feeds edge values into every number
// input (0, blank, negative, huge, decimal) and re-checks after each step.
// First-viewport and full-page screenshots go to --out (default: ./qa-shots).
// Exit code 1 when any check fails.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function loadPlaywright() {
  const req = createRequire(import.meta.url);
  for (const base of [process.cwd() + '/', execSync('npm root -g').toString().trim() + '/']) {
    try { return createRequire(base)('playwright'); } catch {}
  }
  try { return req('playwright'); } catch {}
  console.error('playwright not found (npm i -g playwright; do not run "playwright install" if browsers are preinstalled)');
  process.exit(2);
}

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const file = path.resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--out') || 'index.html');
const outDir = path.resolve(opt('--out', 'qa-shots'));
mkdirSync(outDir, { recursive: true });

const { chromium } = loadPlaywright();
const launchOpts = {};
if (process.env.PLAYWRIGHT_BROWSERS_PATH === '/opt/pw-browsers') {
  // Use the preinstalled build even if the global playwright expects another revision.
  try { await chromium.launch().then((b) => b.close()); } catch { launchOpts.executablePath = '/opt/pw-browsers/chromium'; }
}
const browser = await chromium.launch(launchOpts);

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844, isMobile: true, hasTouch: true },
];
const SCHEMES = ['light', 'dark'];
const EDGE_VALUES = ['0', '', '-1', '99999999', '0.001'];
const BAD_TEXT = /(?<![\w.])(NaN|-?Infinity|undefined|null)(?![\w])/;

const failures = [];
const fail = (ctx, msg) => failures.push(`[${ctx}] ${msg}`);

async function inspect(page, ctx) {
  const r = await page.evaluate((badSrc) => {
    const vw = document.documentElement.clientWidth;
    const out = { overflow: document.documentElement.scrollWidth - vw, offenders: [], bad: [] };
    if (out.overflow > 1) {
      const over = [...document.body.querySelectorAll('*')].filter((el) => {
        const b = el.getBoundingClientRect();
        return b.width && b.right > vw + 1;
      });
      // Report the innermost culprits: elements with no overflowing descendant.
      for (const el of over.filter((el) => !over.some((o) => o !== el && el.contains(o))).slice(0, 5)) {
        const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '';
        out.offenders.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls} (right=${Math.round(el.getBoundingClientRect().right)})`);
      }
    }
    const bad = new RegExp(badSrc);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = walker.nextNode());) {
      const p = n.parentElement;
      if (!p || p.closest('script,style') || !p.getClientRects().length) continue;
      const m = n.textContent.match(bad);
      if (m) out.bad.push(`${p.tagName.toLowerCase()}${p.id ? '#' + p.id : ''}: "${n.textContent.trim().slice(0, 60)}"`);
      if (out.bad.length >= 5) break;
    }
    return out;
  }, BAD_TEXT.source);
  if (r.overflow > 1) fail(ctx, `horizontal overflow ${r.overflow}px: ${r.offenders.join(', ') || '(no single offender found)'}`);
  for (const b of r.bad) fail(ctx, `suspicious text ${b}`);
}

for (const vp of VIEWPORTS) {
  for (const scheme of SCHEMES) {
    const tag = `${vp.name}/${scheme}`;
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch,
      colorScheme: scheme, deviceScaleFactor: 1,
    });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    const page = await context.newPage();
    let step = 'load';
    page.on('pageerror', (e) => fail(`${tag} ${step}`, `exception: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') fail(`${tag} ${step}`, `console.error: ${m.text()}`); });
    page.on('request', (req) => {
      if (!/^(file|data|blob|about):/.test(req.url())) fail(`${tag} ${step}`, `network request: ${req.url()}`);
    });
    page.on('dialog', (d) => d.dismiss());

    await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    await inspect(page, `${tag} load`);
    // First frame (what a visitor sees before scrolling) + the whole page.
    await page.screenshot({ path: path.join(outDir, `${vp.name}-${scheme}-top.png`) });
    await page.screenshot({ path: path.join(outDir, `${vp.name}-${scheme}-full.png`), fullPage: true });

    if (!flag('--no-stress') && scheme === 'light') {
      const buttons = await page.locator('button:visible').all();
      for (const [i, b] of buttons.entries()) {
        const label = ((await b.textContent()) || '').trim().slice(0, 20) || `button#${i}`;
        step = `click "${label}"`;
        await b.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
        const box = await b.boundingBox();
        if (!box || box.y + box.height <= 0 || box.y >= vp.height) continue; // parked off-screen (e.g. a hidden sticky bar)
        await b.click({ timeout: 2000 }).catch((e) => fail(`${tag} ${step}`, `not clickable: ${e.message.split('\n')[0]}`));
        await page.waitForTimeout(50);
        await inspect(page, `${tag} ${step}`);
      }
      const inputs = await page.locator('input[type=number]:visible').all();
      for (const inp of inputs) {
        const id = (await inp.getAttribute('id')) || '(no id)';
        const original = await inp.inputValue();
        for (const v of EDGE_VALUES) {
          step = `#${id}=${JSON.stringify(v)}`;
          await inp.fill(v).catch(() => {});
          await page.waitForTimeout(30);
          await inspect(page, `${tag} ${step}`);
        }
        await inp.fill(original);
      }
      step = 'after-stress';
      await page.screenshot({ path: path.join(outDir, `${vp.name}-${scheme}-after.png`), fullPage: true });
    }
    await context.close();
  }
}
await browser.close();

const unique = [...new Set(failures)];
console.log(`page: ${file}\nscreenshots: ${outDir}`);
if (unique.length) {
  console.log(`\nFAIL: ${unique.length} problem(s)`);
  for (const f of unique.slice(0, 80)) console.log('  - ' + f);
  if (unique.length > 80) console.log(`  ... and ${unique.length - 80} more`);
  process.exit(1);
}
console.log('\nPASS: no errors, no network requests, no overflow, no NaN/undefined text');
