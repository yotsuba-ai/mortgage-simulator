// ローン計算（mp: 月返済額 / rb: 残債）
// 単位は index.html の呼び出し側に合わせて「円」で書く（simOne が loanAmount*10000 を渡すため）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './generated/load.mjs';

const app = loadApp();

test('起動時に例外が出ていない', () => {
  assert.equal(app.loadError, null, app.loadError && app.loadError.stack);
});

test('元利均等返済の月額（3000万円 / 年1.0% / 35年）は 84,686円 ±1円', () => {
  const pay = app.mp(30_000_000, 1.0, 35);
  assert.ok(Math.abs(pay - 84_686) <= 1, `got ${pay}`);
});

test('金利0%なら元本を回数で割った額になる（NaN にならない）', () => {
  assert.equal(app.mp(30_000_000, 0, 35), 30_000_000 / 420);
});

test('期間0年・負の年数は 0 を返す（ゼロ除算を外に出さない）', () => {
  assert.equal(app.mp(30_000_000, 1.0, 0), 0);
  assert.equal(app.mp(30_000_000, 1.0, -5), 0);
});

test('期間が短いほど月額は高い', () => {
  assert.ok(app.mp(30_000_000, 1.0, 20) > app.mp(30_000_000, 1.0, 35));
});

test('金利が高いほど月額は高い', () => {
  assert.ok(app.mp(30_000_000, 3.0, 35) > app.mp(30_000_000, 1.0, 35));
});

test('残債は返済前が全額、返済完了時に 0', () => {
  assert.equal(app.rb(30_000_000, 1.0, 35, 0), 30_000_000);
  assert.equal(app.rb(30_000_000, 1.0, 35, 420), 0);
  assert.equal(app.rb(30_000_000, 1.0, 35, 500), 0); // 完済後も 0 のまま
});

test('残債の閉じた式が、1か月ずつ回した償却と一致する（誤差1円以内）', () => {
  // これが一致しない = mp か rb のどちらかが償却の定義から外れている、という意味。
  const p = 30_000_000, ar = 1.2, y = 35;
  const r = ar / 100 / 12;
  const pmt = app.mp(p, ar, y);
  let bal = p;
  for (let k = 1; k <= 12 * y; k++) {
    bal = bal * (1 + r) - pmt;
    const closed = app.rb(p, ar, y, k);
    assert.ok(Math.abs(closed - Math.max(0, bal)) < 1, `month ${k}: closed=${closed} iter=${bal}`);
  }
});

test('残債は単調減少し、負にならない', () => {
  let prev = Infinity;
  for (let k = 0; k <= 420; k += 12) {
    const bal = app.rb(30_000_000, 1.0, 35, k);
    assert.ok(bal >= 0, `month ${k} は負: ${bal}`);
    assert.ok(bal <= prev, `month ${k} で増加した`);
    prev = bal;
  }
});

test('金利0%の残債は元本を等分して減る', () => {
  const bal = app.rb(30_000_000, 0, 35, 210); // 半分の月数
  assert.ok(Math.abs(bal - 15_000_000) < 1e-6, `got ${bal}`);
});
