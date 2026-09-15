# 顧客×物件マッチング営業支援ツール（MVP）

不動産営業担当者向けの、「新しく登録した物件を、既存顧客の誰に提案すべきか」を素早く判断するためのローカル動作ツールです。

- 顧客・物件を登録（フォーム / CSV）
- 顧客 × 物件 をルールベースで 100 点満点にスコアリング
- 物件ごとに「提案すべき顧客ランキング」、顧客ごとに「おすすめ物件 TOP5」を表示
- 一致条件 / 不一致条件 / 判定できない条件を明示
- 営業提案文をテンプレートで生成し、ワンクリックでコピー

※ リポジトリ直下の `index.html`（住宅ローン差額投資シミュレーター）は本ツールとは独立した既存ファイルです。

## 技術構成

| 項目 | 内容 |
|---|---|
| フレームワーク | Next.js 16（App Router）/ TypeScript / React 19 |
| DB | SQLite（`prisma/dev.db`）+ Prisma 6 |
| CSS | Tailwind CSS v4 |
| CSV | papaparse（解析）+ 自作バリデーション |
| テスト | Vitest |

認証・クラウド・外部 API・地図・ポータル連携は含みません。

## セットアップ

前提: Node.js 20 以上（22 推奨）、npm。

```bash
npm install
npx prisma generate
npx prisma db push      # prisma/dev.db を作成
npm run db:seed         # サンプルデータ（顧客7件・物件7件）を投入（任意）
```

上記をまとめて実行する場合:

```bash
npm run setup
```

## 起動方法

```bash
npm run dev
```

ブラウザで http://localhost:3000 を開きます。スマートフォンから確認する場合は、同一ネットワーク内から `http://<PCのIPアドレス>:3000` にアクセスしてください。

本番ビルドで動かす場合:

```bash
npm run build
npm start
```

### データの初期化

```bash
npm run db:reset   # DBを空にしてサンプルデータを再投入（既存データは消えます）
```

## 画面構成

| パス | 内容 |
|---|---|
| `/` | ダッシュボード（顧客数・物件数・最近登録した物件・最近更新した顧客） |
| `/customers` | 顧客一覧（検索・優先度/種別で絞り込み・追加） |
| `/customers/[id]` | 顧客詳細（希望条件・メモ・優先度・最終接触日・おすすめ物件 TOP5） |
| `/customers/[id]/edit` | 顧客編集・削除 |
| `/properties` | 物件一覧（検索・種別/価格上限で絞り込み・追加） |
| `/properties/[id]` | 物件詳細 + この物件を提案すべき顧客ランキング |
| `/properties/[id]/edit` | 物件編集・削除 |
| `/match/[customerId]/[propertyId]` | マッチング詳細（総合スコア・項目別 ○△×？・提案ポイント・懸念点・営業メモ・提案文作成/コピー） |
| `/import` | 顧客 CSV / 物件 CSV の取り込み |

基本フロー: 顧客を登録 → 物件を登録 → 物件詳細で顧客ランキングを確認 → マッチング詳細で一致/不一致理由を確認 → 「提案文を作成」→ コピー。

## データ

- 金額は全て **万円単位の整数**（例: 3,280万円 → `3280`）。
- 物件種別: `戸建` / `マンション` / `土地`（DB 上は `DETACHED` / `APARTMENT` / `LAND`）。
- 優先度: `A` / `B` / `C` / `D`。
- 空欄は「未設定」として保存され、マッチングでは **UNKNOWN（判定不能）** として扱われます。

## CSV形式

`/import` 画面から取り込みます。サンプルは [`public/samples/customers.csv`](public/samples/customers.csv) と [`public/samples/properties.csv`](public/samples/properties.csv)（画面からもダウンロード可）。

- 1 行目はヘッダー。英字ヘッダー（下表）または日本語ヘッダーのどちらでも可。
- 文字コードは UTF-8（BOM 付き可）または Shift_JIS（自動判定）。
- 取り込み前に全行を検証し、**1 行でもエラーがあれば一切登録しません**。エラーは「3行目（budgetMax）: 予算上限「abc」は整数で入力してください」のように行番号・列名付きで表示します。
- 既存データの更新・削除は行いません（追加専用）。同名の重複チェックは行いません。

### 顧客CSV

| 列 | 日本語ヘッダー | 必須 | 内容 |
|---|---|---|---|
| `name` | 氏名 | ○ | 顧客名 |
| `budgetMin` | 予算下限 | | 万円（整数） |
| `budgetMax` | 予算上限 | | 万円（整数） |
| `preferredAreas` | 希望エリア | | 複数は `\|` または `、` 区切り |
| `propertyType` | 物件種別 | | 戸建 / マンション / 土地 |
| `minBedrooms` | 希望部屋数 | | 整数（3LDK なら 3） |
| `parkingSpaces` | 駐車場台数 | | 整数（不要なら 0） |
| `maxBuildingAge` | 築年数上限 | | 整数（年） |
| `schoolDistrict` | 学校区 | | 文字列 |
| `priority` | 優先度 | | A / B / C / D（空欄は B） |
| `lastContactedAt` | 最終接触日 | | `YYYY-MM-DD` または `YYYY/MM/DD` |
| `notes` | メモ | | 文字列 |

### 物件CSV

| 列 | 日本語ヘッダー | 必須 | 内容 |
|---|---|---|---|
| `name` | 物件名 | ○ | 物件名 |
| `price` | 価格 | | 万円（整数） |
| `address` | 住所 | | 文字列 |
| `area` | エリア | | 顧客の希望エリアと突き合わせる名称（町名など） |
| `propertyType` | 物件種別 | | 戸建 / マンション / 土地 |
| `bedrooms` | 部屋数 | | 整数 |
| `parkingSpaces` | 駐車場台数 | | 整数 |
| `buildingAge` | 築年数 | | 整数（新築は 0） |
| `schoolDistrict` | 学校区 | | 文字列 |
| `landArea` | 土地面積 | | 数値（㎡） |
| `buildingArea` | 建物面積 | | 数値（㎡） |
| `notes` | メモ | | 文字列 |

数値列は全角数字・カンマ・「万円」「台」「年」などの単位付きでも受け付けます。

## マッチング仕様

実装: [`src/lib/matching.ts`](src/lib/matching.ts)（決定論的なルールベース。AI は使いません）。

### 配点と判定

| 項目 | 配点 | MATCH（○） | PARTIAL（△） | MISMATCH（×） | UNKNOWN（？） |
|---|---|---|---|---|---|
| 価格 | 25 | 物件価格 ≤ 希望上限 | 上限超過が 5% 以内、または希望下限未満 | 上限を 5% より多く超過 | 予算（上限・下限とも）未設定 or 物件価格なし |
| 希望エリア | 25 | 希望エリアのいずれかと一致 | 部分一致（例:「緑町」と「緑町二丁目」） | どれとも一致しない | 希望エリアなし or 物件エリアなし |
| 間取り | 15 | 物件部屋数 ≥ 希望 | 1 部屋不足 | 2 部屋以上不足 | どちらか未設定 |
| 駐車場 | 10 | 物件台数 ≥ 希望（希望 0 台は常に○） | 1 台以上あるが不足 | 物件 0 台 | どちらか未設定 |
| 学校区 | 10 | 一致 | — | 不一致 | どちらか未設定 |
| 築年数 | 5 | 物件築年数 ≤ 上限 | 超過 5 年以内 | 5 年より多く超過 | どちらか未設定 |
| 物件種別 | 10 | 一致 | — | 不一致 | どちらか未設定 |

- 文字列は trim・全角/半角・大文字/小文字を正規化してから比較します。
- 得点: MATCH = 配点、PARTIAL = 配点の 50%（四捨五入）、MISMATCH = 0。

### 総合スコア（UNKNOWN の扱い）

データが無い項目は不一致にせず UNKNOWN とし、**分母から除外**して 100 点に換算します。

```
総合スコア = round( 判定可能項目の獲得点 ÷ 判定可能項目の配点合計 × 100 )
```

例: 学校区と築年数が UNKNOWN の場合、残り 85 点分を 100 点満点に換算します。全項目 UNKNOWN の場合は 0 点です。情報が少ない顧客ほど高得点になりやすいため、画面には「判定できた項目 5/7」も併記しています。

### ランキング

- 物件詳細: 全顧客をスコア降順（同点は判定項目数が多い順、次に優先度順）で表示。
- 顧客詳細: 全物件をスコア降順で上位 5 件表示。
- マッチ結果は保存せず、表示時に毎回計算します。

## 提案文生成

実装: [`src/lib/proposal/`](src/lib/proposal/)

- `types.ts` … `ProposalGenerator` インターフェース（入力: 顧客条件・物件・マッチ結果 → 出力: 文章）
- `template.ts` … ルールベースのテンプレート実装（外部 API 不要）
- `index.ts` … 使用するジェネレータをここで切り替え

将来 LLM API に置き換える場合は、`ProposalGenerator` を満たす実装を追加し、`index.ts` の `generator` を差し替えるだけで画面側の変更は不要です。

## テスト方法

```bash
npm test            # Vitest（マッチング・提案文・CSV検証）
npm run lint        # ESLint
npm run typecheck   # TypeScript
```

テスト内容（`tests/`）:

- `matching.test.ts` … 完全一致 / 予算オーバー / エリア不一致・部分一致・複数希望エリア / 駐車場不足 / 築年数超過 / 間取り不足 / 顧客・物件のデータ欠損（UNKNOWN 換算）/ 表記ゆれ / 配点合計 / ランキング順
- `proposal.test.ts` … 提案文に顧客名・条件・価格・一致/不一致項目が含まれること、条件未設定時の挙動
- `csv.test.ts` … UTF-8 BOM / Shift_JIS 判定、引用符付きセル、必須列欠落、不正値（数値・種別・優先度・日付・予算逆転）の行番号付き日本語エラー、日本語ヘッダー・全角数字

## ディレクトリ構成

```
prisma/schema.prisma        データモデル（Customer / Property / MatchNote）
prisma/seed.ts              サンプルCSVからの初期データ投入
public/samples/*.csv        サンプルCSV
src/lib/matching.ts         マッチングロジック
src/lib/proposal/           提案文生成
src/lib/csv/                CSV解析・検証
src/lib/validation.ts       フォーム入力の検証（zod）
src/lib/queries.ts          ランキング計算などのDB問い合わせ
src/app/                    画面（App Router）と Server Actions
src/components/             UIコンポーネント
tests/                      Vitest テスト
```
