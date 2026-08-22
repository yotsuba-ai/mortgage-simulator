// 金額表示（yen）
// 表示は仕様そのもの。丸め・区切り・単位が変わると、計算が正しくても画面上は別物になる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './generated/load.mjs';

const app = loadApp();

test('1万円未満はそのまま3桁区切り', () => {
  assert.equal(app.yen(0), '0円');
  assert.equal(app.yen(999), '999円');
  assert.equal(app.yen(1000), '1,000円');
  assert.equal(app.yen(9999), '9,999円');
});

test('1万円以上は「万」で区切り、端数0のときは端数を出さない', () => {
  assert.equal(app.yen(10_000), '1万円');
  assert.equal(app.yen(12_345), '1万2,345円');
  assert.equal(app.yen(100_000), '10万円');
  assert.equal(app.yen(1_234_567), '123万4,567円');
  assert.equal(app.yen(99_999_999), '9,999万9,999円');
});

test('1億円以上は「億」+「万」まで表示し、万未満は切り捨てる', () => {
  assert.equal(app.yen(100_000_000), '1億円');
  assert.equal(app.yen(123_456_789), '1億2,345万円'); // 下4桁 6789円 は表示しない（意図した省略）
  assert.equal(app.yen(1_000_000_000), '10億円');
});

test('負の値は全角マイナス（−）を先頭に付ける', () => {
  assert.equal(app.yen(-12_345), '−1万2,345円');
  assert.equal(app.yen(-500), '−500円');
});

test('小数は四捨五入する', () => {
  assert.equal(app.yen(0.4), '0円');
  assert.equal(app.yen(0.5), '1円');
  assert.equal(app.yen(12_344.6), '1万2,345円');
});

test('NaN / Infinity は「—」にして画面に NaN を出さない', () => {
  assert.equal(app.yen(NaN), '—');
  assert.equal(app.yen(Infinity), '—');
  assert.equal(app.yen(-Infinity), '—');
  assert.equal(app.yen(0 / 0), '—');
});
