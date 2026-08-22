// 積立投資の将来価値（fvm）
// index.html の定義: 年利 ar[%] を月利 r=(1+ar/100)^(1/12)-1 に変換した毎月末積立。
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './generated/load.mjs';

const app = loadApp();

test('利回り0%なら積立元本そのもの', () => {
  assert.equal(app.fvm(100_000, 0, 10), 100_000 * 120);
});

test('期間0年は 0', () => {
  assert.equal(app.fvm(100_000, 5, 0), 0);
});

test('閉じた式が、1か月ずつ積み上げた結果と一致する（相対誤差 1e-9）', () => {
  // ここがズレる = 年利→月利の換算か等比級数の式が壊れている、という意味。
  const amt = 100_000, ar = 5, y = 20;
  const r = Math.pow(1 + ar / 100, 1 / 12) - 1;
  let acc = 0;
  for (let k = 0; k < 12 * y; k++) acc = acc * (1 + r) + amt;
  const closed = app.fvm(amt, ar, y);
  assert.ok(Math.abs(closed - acc) / acc < 1e-9, `closed=${closed} iter=${acc}`);
});

test('年利は「年」の複利として解釈される（月利を単純に ar/12 とした実装なら赤になる）', () => {
  const ar = 5, amt = 10_000;
  const rCompound = Math.pow(1 + ar / 100, 1 / 12) - 1; // 正: 12か月で年利になる月利
  const rNaive = ar / 100 / 12;                          // 誤: 年利の単純12分割
  const expected = amt * ((Math.pow(1 + rCompound, 12) - 1) / rCompound);
  const naive = amt * ((Math.pow(1 + rNaive, 12) - 1) / rNaive);
  const got = app.fvm(amt, ar, 1);
  assert.ok(Math.abs(got - expected) / expected < 1e-12, `got=${got} expected=${expected}`);
  assert.ok(Math.abs(got - naive) / naive > 1e-6, '単純12分割の月利と区別できていない');
});

test('利回りが高いほど、期間が長いほど増える', () => {
  assert.ok(app.fvm(100_000, 7, 20) > app.fvm(100_000, 3, 20));
  assert.ok(app.fvm(100_000, 5, 30) > app.fvm(100_000, 5, 20));
});

test('積立額に比例する（線形性）', () => {
  const a = app.fvm(100_000, 5, 20);
  const b = app.fvm(300_000, 5, 20);
  assert.ok(Math.abs(b - a * 3) / b < 1e-12);
});

test('プラス利回りなら必ず元本を上回る', () => {
  const y = 15, amt = 50_000;
  assert.ok(app.fvm(amt, 4, y) > amt * 12 * y);
});
