#!/usr/bin/env node
// Extract inline <script> bodies from an HTML file so their pure functions can be
// unit-tested in Node. Single-file HTML apps usually have no test harness at all;
// this gives you one in a few seconds instead of an afternoon.
//
//   node extract-inline-js.mjs <html-file> [--out <dir>] [--no-unwrap]
//
// Writes <dir>/app.source.js (concatenated inline scripts) and <dir>/load.mjs
// (a loader that runs that source in a vm context behind a minimal DOM stub).
// Import loadApp() from load.mjs in your tests and call the functions directly.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const htmlPath = args.find((a, i) => !a.startsWith('--') && i !== outIdx + 1);
const noUnwrap = args.includes('--no-unwrap');
const outDir = outIdx !== -1 ? args[outIdx + 1] : 'tests/generated';

if (!htmlPath) {
  console.error('usage: extract-inline-js.mjs <html-file> [--out <dir>]');
  process.exit(2);
}

const html = fs.readFileSync(htmlPath, 'utf8');
const blocks = [];
const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let m;
while ((m = re.exec(html)) !== null) {
  const attrs = m[1] || '';
  if (/\bsrc\s*=/i.test(attrs)) continue; // external script: nothing inline to take
  if (/\btype\s*=\s*["']?(?!text\/javascript|module|application\/javascript)/i.test(attrs)) continue;
  blocks.push(m[2]);
}

if (blocks.length === 0) {
  console.error(`no inline <script> blocks found in ${htmlPath}`);
  process.exit(1);
}

// Most real single-file apps wrap everything in one IIFE, which would keep every
// function private and make the extract useless. Peel the wrapper off when the
// result still parses — that check is what keeps the heuristic honest.
function unwrapIIFE(src) {
  const body = src.trim();
  const opens = /^[;(!+]*\s*\(?\s*(?:async\s+)?(?:function\s*\w*\s*\([^)]*\)|\([^)]*\)\s*=>)\s*\{/;
  const head = opens.exec(body);
  if (!head) return null;
  const tail = /\}\s*\)?\s*\([^)]*\)\s*\)?\s*;?\s*$/;
  const foot = tail.exec(body);
  if (!foot) return null;
  const inner = body.slice(head[0].length, foot.index);
  try {
    new vm.Script(inner, { filename: 'unwrap-check.js' });
  } catch {
    return null; // not a single wrapping IIFE after all; leave the source alone
  }
  return inner;
}

fs.mkdirSync(outDir, { recursive: true });
let joined = blocks.join('\n;\n');
if (!noUnwrap) {
  const inner = unwrapIIFE(joined);
  if (inner) {
    joined = inner;
    console.log('unwrapped a top-level IIFE so its declarations are reachable from tests');
  }
}

const header = `// GENERATED from ${path.basename(htmlPath)} by extract-inline-js.mjs — do not edit.\n` +
  `// Edit the HTML and re-run the extractor instead; a stale copy is worse than no copy.\n`;
fs.writeFileSync(path.join(outDir, 'app.source.js'), header + joined, 'utf8');

const loaderTemplate = new URL('../assets/load.mjs', import.meta.url);
fs.copyFileSync(loaderTemplate, path.join(outDir, 'load.mjs'));
console.log(`extracted ${blocks.length} inline script block(s) -> ${path.join(outDir, 'app.source.js')}`);
console.log(`loader -> ${path.join(outDir, 'load.mjs')}`);
