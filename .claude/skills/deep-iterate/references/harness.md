# 判定ハーネスの作り方

目的はただ 1 つ: **1 コマンドで赤か緑かが出て、それが数秒で返ってくる状態** を作ること。
反復の速度はここで決まります。以下は状況別の最短経路です。

## 目次

- [まず既存の経路を探す](#まず既存の経路を探す)
- [プロジェクト種別ごとの入口](#プロジェクト種別ごとの入口)
- [テストが 1 つも無い場合](#テストが-1-つも無い場合)
- [単一 HTML ファイルのアプリ](#単一-html-ファイルのアプリ)
- [ブラウザでの実挙動を確かめる](#ブラウザでの実挙動を確かめる)
- [速度を保つ](#速度を保つ)

## まず既存の経路を探す

自作する前に、そのリポジトリが既に持っているものを使います。無いことを確認してから作る、
という順序を守ると、車輪の再発明と「プロジェクトの流儀と違うテスト」の両方を避けられます。

```
ls Makefile justfile Taskfile.yml package.json pyproject.toml Cargo.toml go.mod 2>/dev/null
cat package.json | head -40          # scripts セクション
ls .github/workflows/                # CI が実際に何を回しているか = 正解の定義
cat CLAUDE.md CONTRIBUTING.md 2>/dev/null
```

CI の設定ファイルは「このプロジェクトにおける緑の定義」そのものです。迷ったらそれに合わせます。

## プロジェクト種別ごとの入口

| 種別 | 最初に試すコマンド |
|---|---|
| Node / TS | `npm test` / `npx vitest run` / `npx tsc --noEmit` |
| Python | `pytest -x -q` / `python -m pytest tests/ -x` / `ruff check .` |
| Go | `go test ./... -run <対象>` / `go vet ./...` |
| Rust | `cargo test` / `cargo clippy` |
| 静的サイト | Node で純粋関数を直接呼ぶ（後述） + Playwright で DOM 検証 |

`-x`（初回失敗で停止）や対象を絞る指定は、ループ中は積極的に使います。全部通すのは
Phase 3 の最後と Phase 5 の直前で十分です。

## テストが 1 つも無い場合

「テスト基盤を整備してから」と考えると着手が重くなり、結局手動確認に戻ります。
最初の 1 本は、フレームワーク無しで構いません。Node なら標準の `node:test`、
Python なら `assert` を並べた 1 ファイルで足ります。

```js
// tests/calc.test.mjs   →   node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './generated/load.mjs';

const app = loadApp();

test('元利均等の月返済額', () => {
  assert.ok(Math.abs(app.mp(3000, 1.0, 35) - 8.4686) < 0.001);
});

test('金利0%でも壊れない', () => {
  assert.equal(app.mp(3000, 0, 35), 3000 / 420);
});
```

重要なのは網羅率ではなく、**Phase 0 で決めた判定文が実行可能になっていること** です。
1 本目が動けば 2 本目以降は数十秒で増えます。

## 単一 HTML ファイルのアプリ

`index.html` に `<script>` が直書きされている構成は、テストできないのではなく
「取り出し方を知らないだけ」です。同梱スクリプトが取り出します。

```bash
node .claude/skills/deep-iterate/scripts/extract-inline-js.mjs index.html --out tests/generated
```

生成物:

- `tests/generated/app.source.js` — インライン `<script>` の中身。全体が 1 つの IIFE で
  包まれている場合は、**構文チェックが通ることを確認したうえで** 剥がします
  （剥がさないと関数が全部プライベートのままでテストできないため）。剥がしたくない
  ときは `--no-unwrap`。
- `tests/generated/load.mjs` — 最小の DOM スタブを張った `vm` コンテキストでその
  ソースを実行し、コンテキストごと返すローダー。

```js
import { loadApp } from './generated/load.mjs';
const app = loadApp({ values: { price: '5000', years: '35' } });  // input の値を差し込む
app.mp(3000, 1.0, 35);           // 関数を直接呼べる
app.loadError;                   // 起動時に DOM 配線が落ちた場合はその例外（null なら完走）
```

知っておくと得なこと:

- **トップレベルの `function` 宣言は巻き上げられる** ので、起動時の DOM 配線が途中で
  例外を投げても、関数自体は全部コンテキストに存在します。`loadApp` は例外を投げずに
  `loadError` に格納するのはこのためで、**純粋な計算関数のテストは配線が壊れていても書けます**。
- スタブは **必要になったものだけ足す** のが正解です。`loadError` に出た未定義の
  グローバルを 1 つ足して再実行、を数回繰り返せば完走します（`extend` オプションで
  テスト側から差し込めます）。最初から完全な DOM を用意しようとしないこと。
- 生成ファイルは HTML から派生した写しです。**HTML を直したら必ず再生成** します。
  古い写しを相手にテストが緑になるのは、最悪の偽の緑です。再生成をテストコマンドの
  一部にしてしまうと事故が起きません。

## ブラウザでの実挙動を確かめる

計算ではなく DOM や描画そのものが対象なら、Playwright で `file://` を開いて検証します
（この環境には Chromium が用意済みです）。

```js
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('file://' + process.cwd() + '/index.html');
await p.fill('#price', '5000');
await p.click('#calc');
console.log(await p.textContent('#result'));
await b.close();
```

起動が重いので、**純粋関数で判定できることは Node 側で判定し**、Playwright は
DOM/表示に固有の判定文だけに使います。層を分けると全体の速度が保てます。

## 速度を保つ

- 目標は 10 秒以内、許容は 60 秒。超えるなら対象を絞る手段（ファイル指定、`-k`、`-run`）を
  ループ用のコマンドとして固定する
- 速い層（型・lint・純粋関数）と遅い層（E2E・ブラウザ）を分け、ループ中は速い層だけ回す
- 遅い層は Phase 3 の締めと Phase 5 の直前に 1 回ずつ
- ハーネスの実行コマンドは、決まった時点で `CLAUDE.md` か Makefile に書いておく。
  次回のセッションが Phase 2 をやり直さずに済みます
