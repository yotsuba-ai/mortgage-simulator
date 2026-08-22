// シナリオ計算（simOne / investAtYear / findBreakeven）
// simOne は DOM の input を読むので、loadApp の values で値を差し込んで検証する。
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './generated/load.mjs';

const BASE = {
  loanAmount: '4000',      // 万円
  loanRate: '1.0',         // %
  shortYears: '20',
  longYears: '35',
  investYears: '35',
  investmentRate: '5',     // %
  taxRate: '20.315',       // %
  extraMonthly: '0',       // 万円/月
  fxEntry: '150',
  fxExit: '150',
};

// シナリオごとに独立したコンテキストを作る（前のテストの状態を持ち越さないため）
function boot(overrides = {}, fxMode = 'jpy') {
  const app = loadApp({ values: { ...BASE, ...overrides } });
  app.fxMode = fxMode;
  return app;
}

test('差額 = 短期返済額 − 長期返済額、投資原資 = 差額 + 上乗せ額', () => {
  const app = boot({ extraMonthly: '3' });
  const d = app.simOne(5);
  assert.ok(Math.abs(d.sp - app.mp(40_000_000, 1.0, 20)) < 1e-6);
  assert.ok(Math.abs(d.lp - app.mp(40_000_000, 1.0, 35)) < 1e-6);
  assert.ok(Math.abs(d.diff - (d.sp - d.lp)) < 1e-6);
  assert.ok(Math.abs(d.totalMonthly - (d.diff + 30_000)) < 1e-6);
});

test('短期のほうが長期より返済額が大きい前提が崩れても差額は負にならない', () => {
  const app = boot({ shortYears: '35', longYears: '20' });
  const d = app.simOne(5);
  assert.equal(d.diff, 0);
});

test('純資産 = 税引後投資評価額 − ローン残債', () => {
  const app = boot();
  const d = app.simOne(5);
  assert.ok(Math.abs(d.net - (d.fvAFx - d.remain)) < 1e-6);
  assert.ok(Math.abs(d.remain - app.rb(40_000_000, 1.0, 35, 35 * 12)) < 1e-6);
});

test('税率0%なら税引後評価額 = 税引前評価額', () => {
  const app = boot({ taxRate: '0' });
  const d = app.simOne(5);
  assert.ok(Math.abs(d.fvA - (d.prin + d.profit)) < 1e-6);
  assert.equal(d.taxAmt, 0);
});

test('税率が上がるほど税引後評価額は下がる', () => {
  const low = boot({ taxRate: '10' }).simOne(5);
  const high = boot({ taxRate: '30' }).simOne(5);
  assert.ok(high.fvA < low.fvA);
});

test('運用益がマイナスのとき、税額は 0 で元本割れが増幅されない', () => {
  // 利回り0%なら profit = 0。マイナス側でも Math.max(0,profit) で税が発生しないこと。
  const app = boot();
  const d = app.simOne(0);
  assert.equal(d.taxAmt, 0);
  assert.ok(Math.abs(d.fvA - d.prin) < 1e-6);
});

test('利回りが高いほど純資産が増える（単調性）', () => {
  const app = boot();
  let prev = -Infinity;
  for (const ir of [0, 2, 4, 6, 8]) {
    const net = app.simOne(ir).net;
    assert.ok(net > prev, `利回り${ir}% で純資産が増えていない`);
    prev = net;
  }
});

test('ドル建てで入口レート = 出口レートなら、円建てと同じ評価額になる', () => {
  // 為替を通しても、往復で同じレートなら結果が変わらないこと。
  // ここがズレる = 円転の計算に片道分の取りこぼしがある、という意味。
  const usd = boot({ fxEntry: '150', fxExit: '150' }, 'usd').simOne(5);
  const jpy = boot({}, 'jpy').simOne(5);
  assert.ok(Math.abs(usd.fvAFx - jpy.fvAFx) / jpy.fvAFx < 1e-9, `usd=${usd.fvAFx} jpy=${jpy.fvAFx}`);
  assert.ok(Math.abs(usd.fxAdj - 1) < 1e-9);
});

test('ドル建ての評価額は出口レートに比例する', () => {
  const a = boot({ fxExit: '150' }, 'usd').simOne(5);
  const b = boot({ fxExit: '300' }, 'usd').simOne(5);
  assert.ok(Math.abs(b.fvAFx - a.fvAFx * 2) / b.fvAFx < 1e-12);
});

test('円安（出口 > 入口）で為替調整が有利、円高で不利に働く', () => {
  const weak = boot({ fxEntry: '150', fxExit: '180' }, 'usd').simOne(5);
  const strong = boot({ fxEntry: '150', fxExit: '120' }, 'usd').simOne(5);
  assert.ok(weak.fxAdj > 1 && strong.fxAdj < 1);
  assert.ok(weak.net > strong.net);
});

test('チャート用の年次評価額が、最終年で本体の評価額と一致する', () => {
  // renderTimeChart と結果表示が別式なので、片方だけ直したときにここが赤くなる。
  for (const mode of ['jpy', 'usd']) {
    const app = boot({ fxExit: '170' }, mode);
    const d = app.simOne(5);
    const last = app.investAtYear(d, d.iy);
    assert.ok(Math.abs(last - d.fvAFx) / d.fvAFx < 1e-9, `${mode}: chart=${last} main=${d.fvAFx}`);
  }
});

test('チャート用の年次評価額は年0で0、以降は単調増加', () => {
  const app = boot();
  const d = app.simOne(5);
  assert.equal(app.investAtYear(d, 0), 0);
  let prev = -1;
  for (let y = 0; y <= d.iy; y++) {
    const v = app.investAtYear(d, y);
    assert.ok(v >= prev, `${y}年目で減少した`);
    prev = v;
  }
});

test('損益分岐利回りの前後で純資産の符号が反転する', () => {
  // 分岐点が意味を持つのは残債が残るシナリオ（投資期間 < ローン期間）だけなので、
  // まず符号の反転が範囲内に存在することを確かめてから前後を見る。
  const app = boot({ investYears: '20' });
  assert.ok(app.simOne(0).net < 0, '前提: 利回り0%では純資産がマイナスであること');
  assert.ok(app.simOne(30).net > 0, '前提: 利回り30%では純資産がプラスであること');

  const be = app.findBreakeven();
  assert.ok(be > 0 && be < 30, `分岐点が範囲の端に張り付いた: ${be}`);
  assert.ok(app.simOne(be + 0.1).net > 0, '分岐点より上で純資産がプラスにならない');
  assert.ok(app.simOne(be - 0.1).net < 0, '分岐点より下で純資産がマイナスにならない');
});

test('投資期間がローン期間と同じなら残債0で、分岐点は下限に張り付く', () => {
  // 上のテストが「たまたま緑」にならないよう、分岐点が存在しない条件も固定しておく。
  const app = boot({ investYears: '35', longYears: '35' });
  assert.equal(app.simOne(0).remain, 0);
  assert.ok(app.simOne(0).net > 0);
  assert.ok(app.findBreakeven() < 1e-6);
});

test('損益分岐為替レートの前後で純資産の符号が反転する', () => {
  const app = boot({ investYears: '20', investmentRate: '3' }, 'usd');
  assert.ok(app.simOne(3, 1).net < 0, '前提: 極端な円高では純資産がマイナスであること');
  assert.ok(app.simOne(3, 500).net > 0, '前提: 極端な円安では純資産がプラスであること');

  const fxBe = app.findFxBreakeven();
  assert.ok(fxBe > 1 && fxBe < 500, `分岐点が範囲の端に張り付いた: ${fxBe}`);
  assert.ok(app.simOne(3, fxBe + 1).net > 0, '分岐点より円安側で純資産がプラスにならない');
  assert.ok(app.simOne(3, fxBe - 1).net < 0, '分岐点より円高側で純資産がマイナスにならない');
});

// ── 既知の問題を固定するテスト ──────────────────────────────
// 想定利回りに負の値を入れると（input に min が無いので実際に入力できる）、
// fvA = prin + Math.max(0, profit)*(1-tx) が損失そのものを切り捨て、
// 評価額を実際より高く表示する。ここでは「今どうなっているか」を記録している。
// 挙動を直したらこのテストは赤になるので、そのとき期待値を prin+profit に更新すること。
test('[既知の問題] 負の利回りだと損失が評価額に反映されない', () => {
  const app = boot({ investYears: '20' });
  const d = app.simOne(-5);
  assert.ok(d.profit < 0, '前提: 負の利回りで運用益がマイナスになること');
  assert.equal(d.taxAmt, 0, '損失時に課税されてはいけない');
  assert.ok(Math.abs(d.fvA - d.prin) < 1e-6, `現状の挙動: 損失を切り捨てて元本のまま (fvA=${d.fvA})`);
  assert.ok(d.fvA > d.prin + d.profit, '現状の挙動: 実際の評価額より高く出る');
});

test('[既知の問題] ドル建てでも損失が評価額に反映されない', () => {
  const app = boot({ investYears: '20' }, 'usd');
  const d = app.simOne(-5);
  assert.ok(d.profit < 0);
  assert.equal(d.taxAmt, 0);
  assert.ok(Math.abs(d.fvAFx - d.prin * (d.fxExit / d.fxEntry)) / d.prin < 1e-9);
});

test('未入力（空欄）でも NaN を外に出さない', () => {
  const app = loadApp({ values: {} }); // 全部空 = gv() は 0 を返す
  app.fxMode = 'jpy';
  const d = app.simOne(5);
  for (const [k, v] of Object.entries(d)) {
    if (typeof v === 'number') assert.ok(Number.isFinite(v), `${k} が ${v}`);
  }
});
