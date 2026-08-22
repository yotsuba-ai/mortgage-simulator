# テスト

```bash
npm test
```

`pretest` が `index.html` からインライン JS を抽出して `tests/generated/` を作り直し、
そのうえで `node --test` が走ります。**index.html を直したら、そのまま `npm test` で反映されます**
（生成物はコミットしない。古い写しに対して緑になるのを防ぐため）。

依存パッケージはありません。Node 18 以降であれば `npm install` なしで動きます。

| ファイル | 対象 |
|---|---|
| `loan.test.mjs` | `mp`（月返済額）・`rb`（残債）。閉じた式が月次の償却計算と一致するかを含む |
| `invest.test.mjs` | `fvm`（積立の将来価値）。年利→月利の換算が年複利ベースであること |
| `sim.test.mjs` | `simOne` / `investAtYear` / `findBreakeven` / `findFxBreakeven` |
| `format.test.mjs` | `yen`（万・億の区切り、四捨五入、NaN の表示） |

DOM は `tests/generated/load.mjs` の最小スタブで代用しています。入力値は
`loadApp({ values: { loanAmount: '4000', ... } })` で差し込みます。
詳しくは `.claude/skills/deep-iterate/references/harness.md` を参照してください。

`[既知の問題]` で始まるテストは、現状の挙動を記録しているものです（バグの追認ではなく、
直したときに気づけるようにするため）。挙動を修正したらそのテストは赤になるので、
期待値を更新してください。
