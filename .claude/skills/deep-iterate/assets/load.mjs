// Runs the extracted inline script in a vm context behind a minimal DOM stub,
// then hands the whole context back so tests can call the app's functions directly.
//
//   import { loadApp } from './generated/load.mjs';
//   const app = loadApp({ values: { price: '5000', years: '35' } });
//   assert.ok(Math.abs(app.mp(3000, 1.0, 35) - 8.47) < 0.01);
//
// Why a vm context and not an import: the extracted source is a plain script full
// of top-level DOM wiring that will throw under Node. Function declarations are
// hoisted before any of that runs, so even when the wiring blows up, every
// top-level `function foo(){}` is already defined in the context and callable.
// loadApp records the crash in `loadError` instead of throwing, so you can unit-test
// the pure math today and stub more DOM later only if you actually need it.

import fs from 'node:fs';
import vm from 'node:vm';

// Canvas work is common in single-file apps; a no-op 2d context keeps rendering
// code from exploding so the numbers around it stay testable.
function make2dContextStub() {
  const noop = () => {};
  return new Proxy({
    canvas: null,
    measureText: () => ({ width: 0 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    getImageData: () => ({ data: [] }),
  }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return noop;
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
}

function makeElement(id, values) {
  const el = {
    id,
    value: values[id] !== undefined ? values[id] : '',
    textContent: '',
    innerHTML: '',
    checked: false,
    disabled: false,
    dataset: {},
    style: {},
    children: [],
    clientWidth: 800, clientHeight: 600, offsetWidth: 800, offsetHeight: 600,
    scrollWidth: 800, scrollHeight: 600, scrollTop: 0, scrollLeft: 0,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
    appendChild(c) { el.children.push(c); return c; },
    removeChild() {}, insertAdjacentHTML() {}, focus() {}, blur() {}, click() {},
    getBoundingClientRect: () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }),
    querySelector: () => makeElement('stub', {}), querySelectorAll: () => [],
    // Layout ancestry is stubbed too: real code walks up to size a canvas, and a
    // null parent turns a harmless layout read into a fake failure.
    get parentElement() { return el.__parent || (el.__parent = makeElement('parent', {})); },
    get parentNode() { return el.parentElement; },
    getContext: () => make2dContextStub(),
    scrollIntoView() {},
  };
  return el;
}

export function loadApp(options = {}) {
  const {
    sourcePath = new URL('./app.source.js', import.meta.url),
    values = {},
    extend = {},
  } = options;

  const elements = new Map();
  const el = (id) => {
    if (!elements.has(id)) elements.set(id, makeElement(id, values));
    return elements.get(id);
  };

  const document = {
    getElementById: el,
    querySelector: (sel) => el(String(sel).replace(/^[#.]/, '')),
    querySelectorAll: () => [],
    createElement: (tag) => makeElement(tag, {}),
    createElementNS: (_ns, tag) => makeElement(tag, {}),
    addEventListener() {}, removeEventListener() {},
    documentElement: makeElement('html', {}),
    body: makeElement('body', {}),
    readyState: 'complete',
  };

  const storage = new Map();
  // A fresh vm context already has every ECMAScript intrinsic (Math, JSON, Promise,
  // Intl...). What it lacks are the host globals a browser provides, so those — and
  // only those — are what we hand it here.
  const context = {
    document,
    console,
    setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    cancelAnimationFrame: (h) => clearTimeout(h),
    URL, URLSearchParams, TextEncoder, TextDecoder, structuredClone, performance,
    atob: (b) => Buffer.from(b, 'base64').toString('binary'),
    btoa: (b) => Buffer.from(b, 'binary').toString('base64'),
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
      clear: () => storage.clear(),
    },
    getComputedStyle: () => new Proxy(
      { getPropertyValue: () => '', getPropertyPriority: () => '' },
      { get: (t, k) => (k in t ? t[k] : ''), has: () => true },
    ),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} }),
    navigator: { clipboard: { writeText: async () => {} }, userAgent: 'node', language: 'ja-JP' },
    location: { href: 'http://localhost/', search: '', hash: '', origin: 'http://localhost' },
    history: { replaceState() {}, pushState() {} },
    fetch: async () => { throw new Error('network access is not stubbed in loadApp'); },
    alert() {}, confirm: () => true, scrollTo() {},
    addEventListener() {}, removeEventListener() {},
    innerWidth: 1024, innerHeight: 768, devicePixelRatio: 1,
    ...extend,
  };
  context.window = context;
  context.globalThis = context;

  vm.createContext(context);
  const code = fs.readFileSync(sourcePath, 'utf8');
  try {
    vm.runInContext(code, context, { filename: 'app.source.js' });
    context.loadError = null;
  } catch (err) {
    context.loadError = err; // hoisted declarations survive; see the note at the top
  }
  context.elements = elements;
  return context;
}
