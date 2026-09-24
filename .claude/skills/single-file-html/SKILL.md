---
name: single-file-html
description: Conventions for editing index.html, the self-contained single-file mortgage/investment simulator (all CSS and JS inline, no build step). Use whenever adding or changing UI, styles, charts, calculations, or copy in index.html — covers the no-external-resources rule, theme tokens for light/dark, phone-first responsive layout, canvas/devicePixelRatio handling, accessibility, input validation for financial numbers, and the finish checklist that ends with the html-qa skill.
---

# single-file-html: 1ファイル HTML の作法

「Claude Opus 5.5 · 100 HTML Files」の全100ページ共通要件（SHARED REQUIREMENTS）から、
このシミュレーターに当てはまるものを抜き出して具体化したもの。`index.html` を編集する前に読む。

## 1. 1ファイル・外部依存ゼロ

- CSS は `<style>`、JS は `<script>` にインライン。CDN・ライブラリ・Webフォント・外部画像を使わない。
  グラフは既存どおり Canvas（`#timeChart`）か CSS/HTML のバー（`#barChart` など）で描く。
- `file://` で直接開いて動くこと。ビルド工程を追加しない。
- フォントはシステムフォントスタックのみ。既存の
  `-apple-system,BlinkMacSystemFont,'Hiragino Sans','Noto Sans JP',system-ui,sans-serif` を使う。
  数値は既存の等幅スタック `'SF Mono','Courier New',monospace`。

## 2. 色はトークン経由（ライト/ダーク両対応）

- 色は `:root` の CSS 変数（`--bg` `--surface` `--text` `--muted` `--accent` `--good` `--bad` `--warn` と各 `-bg`/`-text`）だけを使う。
  16進カラーを直書きしない。新しい色が要るなら、**4か所すべて**に追加する:
  `:root`、`@media(prefers-color-scheme:dark){:root:not([data-theme="light"])}`、
  `html[data-theme="dark"]`、`html[data-theme="light"]`。
- Canvas は CSS 変数を `getComputedStyle(document.documentElement).getPropertyValue(...)` で読む。
  テーマ切替時は `toggleTheme()` が `renderTimeChart()` を呼ぶので、新しい Canvas も同様に再描画する。

## 3. スマホ優先のレイアウト

- 360px 幅で横スクロールが出ないこと。長い金額文字列が入る要素には `min-width:0` と
  折り返し/省略（`overflow-wrap:anywhere` か `text-overflow:ellipsis`）を付ける。
- 固定バー（`#stickyBar`）の中身は1行に収める。
- Canvas はコンテナ幅に合わせ、`devicePixelRatio` を **最大2** に制限して描き（`Math.min(window.devicePixelRatio||1,2)`）、
  リサイズで再レイアウトする（既存の `resize` デバウンスに乗せる）。既存の `renderTimeChart` は未制限なので、触るときに合わせて直す。

## 4. 数値入力と計算の堅牢性（金融シミュレーター固有）

- 入力は `gv(id)` で読み、計算前に現実的な範囲へクランプする（年数 1〜50、金利 0〜20% など）。
  `99999999` や空欄・負数で例外や `NaN`・`Infinity` が表示されてはならない。表示不能なら「—」。
- 金額表示は既存の `yen()` を通す。単位（万円・円・%・円/ドル）をラベルと一致させる。
- 計算式を変えたら、既知の値で手計算と照合する。例: 元利均等 `mp(3000万, 1%, 35年)` ≒ 月8.47万円。
- 歴史データ・税率など事実は正確に。税率は NISA 0%、特定口座 20.315%。
  前提（元利均等・ボーナス返済なし・毎月末積立）を変えたら、ページ下部の注記も更新する。
- URL 共有（`URL_PARAMS`）に新しい入力を追加したら、`loadFromURL` と `copyShareURL` の両方に反映する。

## 5. アクセシビリティと操作

- アクションボタンは `<button type="button">`。入力には見える説明ラベルを付ける。
- フォーカスが見えること（`outline:none` を書くなら代わりに `:focus-visible` のスタイルを用意する）。
  マウスとタッチ両方で操作できること（hover 前提の情報は作らない）。
- アニメーションは `transform` / `opacity` で。新しく動きを足すなら `@media (prefers-reduced-motion: reduce)` で抑える。
- `localStorage` の読み書きは `try/catch` で囲む（プライベートブラウズで例外になるため）。

## 6. 仕上げチェックリスト

- [ ] 外部リソースを追加していない
- [ ] 新しい色はトークン経由で、ライト/ダーク両方で読める
- [ ] 390px 幅で横スクロールなし、文字の重なりなし
- [ ] 空欄・0・負数・巨大値で NaN/例外が出ない
- [ ] `html-qa` スキルを実行し、スクリーンショット（phone-light-top / desktop-dark-top）を目視した
