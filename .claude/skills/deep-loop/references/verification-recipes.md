# 検証シグナルの作り方（プロジェクト類型別）

SKILL.md のステップ 0 で「既存の検証手段が見つからない」ときに読む。目的は網羅ではなく、**30 分以内に、1 コマンドで正否が返る仕組みを 1 つ立てる**こと。

## 目次

- [良い検証シグナルの条件](#良い検証シグナルの条件)
- [まず疑うこと: その検証は本当に落ちるのか](#まず疑うこと-その検証は本当に落ちるのか)
- [A. テスト基盤が既にある](#a-テスト基盤が既にある)
- [B. 純粋関数・ライブラリ](#b-純粋関数ライブラリ)
- [C. CLI・スクリプト](#c-cliスクリプト)
- [D. 単一 HTML ファイルのフロントエンド](#d-単一-html-ファイルのフロントエンド)
- [E. Web API・サーバ](#e-web-apiサーバ)
- [F. 見た目・UX](#f-見た目ux)
- [G. リファクタ・移行](#g-リファクタ移行)

## 良い検証シグナルの条件

- **速い** — 数秒〜十数秒。遅い検証は回さなくなり、回さない検証は存在しないのと同じ
- **決定的** — 同じ入力で同じ結果。時刻・乱数・ネットワーク・実行順に依存する部分は固定する
- **落ちたときに情報が出る** — 「失敗」だけでなく、期待値と実際値、入力が分かる。ここをケチると診断に周回数を余計に使う
- **偽グリーンを出さない** — 実装が壊れていれば必ず赤くなる（次節）

## まず疑うこと: その検証は本当に落ちるのか

新しく検証を用意したら、**わざと壊して赤くなることを一度確認**します。これを飛ばすと、実は何も実行していない・アサートしていない検証を信じて、壊れたコードをグリーンとして報告する事故が起きます。

```
# 例: 期待値を意図的にずらす、または実装の 1 行を書き換える → 赤を確認 → 元に戻す → 緑を確認
```

「テストを足したら一発で通った」は喜ぶ場面ではなく、疑う場面です。

## A. テスト基盤が既にある

やることは「見つけて、走らせて、基準点を記録する」だけです。

- `package.json` の `scripts`、`Makefile`、`pyproject.toml`、`.github/workflows/*.yml`（CI が何を実行しているかが正解の定義）
- 全体が遅いなら、対象を絞る手段を必ず調べる — `vitest run path/to/file`、`pytest -k name`、`go test ./pkg/...`、`cargo test name`
- **変更前に一度実行**し、既に落ちているものを控える。これを飛ばすと、既存の失敗を自分のせいだと誤診して何周も溶かします

## B. 純粋関数・ライブラリ

入出力がはっきりしているので、依存の少ない標準機能で十分です。

- Node: `node --test`（追加インストール不要）
- Python: `pytest`、無ければ `python -m unittest`
- 手で計算できる代表値を 3〜5 件だけ用意する。境界（0、負値、空、最大）を 1 件は入れる

数値計算では「桁が合っているか」を必ず自分で検算します。実装と期待値を同じ思い込みから書くと、両方間違っていても緑になります。

## C. CLI・スクリプト

**ゴールデン出力（期待出力を保存して差分を取る）** が安上がりで効きます。

```bash
# 期待出力を一度作って固定し、以後は差分で判定する
mycli --input fixtures/sample.csv > /tmp/actual.txt
diff -u fixtures/expected.txt /tmp/actual.txt && echo OK
```

終了コードも検証対象です（`echo $?`）。異常系で 0 を返していないか確認します。

## D. 単一 HTML ファイルのフロントエンド

ビルドもテストも無い `index.html` 一枚、という構成はよくあります。取れる手は 3 つあり、**上から順に安い**です。

### D-1. 純粋なロジックだけ Node に持ち込む

計算ロジック（金額計算、日付処理、変換）は DOM 無しで検証できます。コードが IIFE で閉じている場合でも、**ファイルを書き換えずにメモリ上でだけ出口を差し込めば**取り出せます。

```js
// verify.js — node verify.js で実行。ファイル本体は一切変更しない。
const fs = require('fs'), vm = require('vm');

const html = fs.readFileSync('index.html', 'utf8');
let src = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(m => m[1]).join('\n');

// IIFE の内側（最後の `})();` の直前）に、テスト用の出口を注入する
const i = src.lastIndexOf('})();');
src = src.slice(0, i) + 'globalThis.__t={mp:mp,rb:rb};' + src.slice(i);

// DOM は「何をされても落ちない」プロキシで代用する。目的は描画ではなく計算部の実行。
const stub = new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => '' : stub),
  set: () => true, apply: () => stub, construct: () => stub,
});
const s = {
  document: stub, location: stub, navigator: stub, localStorage: stub, console,
  setTimeout: () => 0, clearTimeout: () => {}, requestAnimationFrame: () => 0,
  URL, URLSearchParams, encodeURIComponent, decodeURIComponent,
};
s.window = s;            // `window.f = ...` と `function f(){}` を同じ場所に集めるため
s.globalThis = s;
s.addEventListener = () => {};
s.matchMedia = () => stub;
s.getComputedStyle = () => stub;

vm.createContext(s);
vm.runInContext(src, s, { timeout: 5000 });

// あとは普通のアサーション
const assert = require('assert');
assert.ok(Math.abs(s.__t.mp(30000000, 1.0, 35) - 84685.71) < 0.01, '元利均等の月返済額');
console.log('OK');
```

注入位置（`})();` の探し方）や必要なスタブはファイルごとに違います。最初に `typeof s.__t` を出力して、取り出せているかだけ先に確かめてから本題に進むと速いです。

### D-2. 実ブラウザで動かす

DOM 操作や描画そのものが対象なら Playwright で実ページを開き、入力して結果テキストを読みます。`page.goto('file://' + path)` でローカルファイルをそのまま開けます。ロジックだけ見たい場合に D-2 を選ぶと、起動時間の分だけループが遅くなります。

### D-3. 差し替え不能なら人間に見せる

見た目の判断が必要なものは、自分で何十周も回さず短く切って提示します。

## E. Web API・サーバ

サーバをバックグラウンドで起動 → 起動待ち → リクエスト → 期待レスポンスを検証 → 停止、までを 1 スクリプトにまとめます。

```bash
npm start & PID=$!
until curl -sf localhost:3000/health > /dev/null; do sleep 0.3; done   # 固定 sleep より確実
curl -sf localhost:3000/api/items | jq -e '.items | length > 0'
STATUS=$?
kill $PID
exit $STATUS
```

`sleep 5` のような固定待ちは、遅いときに落ち、速いときに待たされます。条件待ちにしておくとループ全体が安定します。

## F. 見た目・UX

機械判定に落とせるのは「壊れていないこと」までで、「良いこと」は落とせません。分けて扱います。

- 機械で見る: コンソールエラーが 0、要素が存在する、レイアウトが破綻していない（横スクロールが出ていない等）、スクリーンショットが撮れる
- 人間に見せる: 配色、余白、文言、体験。**ここでループを長く回さない**

## G. リファクタ・移行

「壊していないこと」が目的なので、**変更前の振る舞いを記録して比較**します（characterization test）。

1. 変更前のコードで、代表的な入力に対する出力を保存する
2. リファクタする
3. 同じ入力を流し、保存した出力と一致することを確認する

意図的に変わる部分があるなら、その差分だけを事前に列挙しておきます。「差分が出た → たぶん想定内」で流すと、そこが本物のバグの隠れ場所になります。
