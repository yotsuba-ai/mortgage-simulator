---
name: html-qa
description: Automated QA for the single-file simulator page (index.html). Renders it in headless Chromium at desktop 1440x900 and phone 390x844 in light and dark mode, fails on JS exceptions, console errors, network requests, horizontal overflow, or NaN/Infinity/undefined text, stress-tests every button and number input with edge values, and runs a stdlib structural HTML checker (balanced tags, unique ids, label targets, nesting). Use after any change to index.html, before committing, or when asked to check, verify, test, screenshot, or review how the page looks on phone/desktop.
---

# html-qa: 実ブラウザでの自動検証

「100 HTML Files」コレクションで全ページに適用された最終チェック
（PC とスマホで描画 → スクリーンショットを目視 → エラー・通信・はみ出し・HTML構造の自動検査）を、
このリポジトリ用に移植したスキル。`index.html` を変更したら、コミット前に必ず実行する。

## 手順

1. **構造チェック**（数秒）
   ```bash
   python3 .claude/skills/html-qa/scripts/html_lint.py index.html
   ```
   ERROR があれば終了コード 1。検査内容: DOCTYPE / `lang` / charset / viewport / title、
   タグの閉じ忘れ・余分な閉じタグ、id の重複、`<label for>` と `aria-*` の参照先、
   `<button>`・`<a>` 内の入れ子のインタラクティブ要素、リスト外の `<li>`、`alt` なし `<img>`。
   WARN（type なし `<button>`、description なし、外部リソース、JS が参照するのに存在しない id）は
   失敗扱いではないが、新規コードでは増やさない。

2. **ブラウザ検証**（約1分）
   ```bash
   node .claude/skills/html-qa/scripts/qa.mjs index.html --out <scratchpad>/qa-shots
   ```
   - desktop/phone × light/dark の4通りで読み込み、次を検査する:
     JS例外・`console.error`、ページ外への通信、横スクロール（原因要素を表示）、
     画面上の `NaN` / `Infinity` / `undefined` / `null` 表示。
   - light では、表示中の全ボタンをクリックし、全 `input[type=number]` に
     `0`・空欄・`-1`・`99999999`・`0.001` を入力して毎回再検査する（`--no-stress` で省略）。
   - スクリーンショット: `*-top.png`（最初の1画面）、`*-full.png`（全体）、`*-after.png`（ストレス後）。
   - `--out` はリポジトリ外（スクラッチパッド）にする。スクショはコミットしない。

3. **目視確認**: `phone-light-top.png` と `desktop-dark-top.png` は必ず Read で開いて見る。
   自動検査では分からない「文字の重なり・切れ」「ダークモードで読めない色」「チャートの崩れ」を確認する。
   全体スクショは縦に長いので、気になる箇所は Playwright で該当要素だけ撮り直す。

4. **報告**: 失敗は件数と代表例をそのまま報告する。今回の変更と無関係な既存の失敗は
   「既存の問題」として分けて書き、勝手に直さない（直すかはユーザーに確認）。

## 失敗の読み方

| 出力 | 典型的な原因 | 対処 |
|---|---|---|
| `exception: ...` | 範囲外入力での配列長・0除算 | 入力をクランプ（例: 年数 1〜50）してから計算 |
| `suspicious text ... NaN` | `gv()` の結果を検証せず表示 | `isFinite` で弾き「—」を表示 |
| `horizontal overflow ... #stickyBar` | 長い数値で固定バーが伸びる | `min-width:0` + `overflow:hidden; text-overflow:ellipsis` |
| `network request: https://...` | CDN・外部フォント追加 | インライン化する（`single-file-html` スキル参照） |
| `(no single offender found)` | transform 中や画面外の要素 | 該当入力値で再現し DevTools 相当の evaluate で調べる |

## 環境メモ

- Playwright はグローバル（`npm root -g`）から読み込む。`playwright install` は実行しない。
  ブラウザは `/opt/pw-browsers` にプリインストール済みで、版が合わなければ自動で
  `executablePath: /opt/pw-browsers/chromium` にフォールバックする。
- ページは `file://` で開く。サーバーは不要。
