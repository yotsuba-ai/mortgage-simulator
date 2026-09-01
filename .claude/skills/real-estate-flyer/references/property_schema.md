# 物件データ JSON の仕様と、概要書からの読み取り方

`build_flyer.py` と `check_compliance.py` が読む JSON の形。
概要書の項目名は会社ごとにばらつくので、後半に「よくある表記 → キー」の対応表を置いた。

## 目次
1. トップレベル構造
2. company / flyer
3. properties の全キー
4. 概要書の表記ゆれ対応表
5. 数値・単位の正規化ルール
6. 読み取れなかった項目の扱い

---

## 1. トップレベル構造

```json
{
  "company":    { ... },   // 広告主。全ページ共通のフッターになる
  "flyer":      { ... },   // チラシ全体の見出しや体裁
  "properties": [ { ... } ]// 掲載する物件。並び順がそのまま掲載順
}
```

物件の並び順は結果に直結する。最も売りたい物件・価格の目玉を先頭に置くと、
1面や2面レイアウトのときに自動的に大きい枠へ入る。

## 2. company / flyer

| キー | 例 | 備考 |
|---|---|---|
| `company.name` | 株式会社ヨツバ不動産 | 必須（規約の必要表示事項） |
| `company.license` | 東京都知事(3)第123456号 | 必須。免許証番号 |
| `company.tel` | 0120-000-000 | フッターに大きく出る |
| `company.tel_lead` | お問い合わせはこちら | 電話番号の上の小さい行 |
| `company.address` | 東京都杉並区… | 必須級（tel と併せていずれか必須） |
| `company.hours` | 9:30〜18:30（水曜定休） | |
| `company.url` | https://… | |
| `flyer.title` | 荻窪エリア 売却物件のご案内 | ページ上部の見出し |
| `flyer.subtitle` | オープンハウス同時開催 | 見出しの下の小さい行 |
| `flyer.badge` | 2026年9月号 | 右肩。号数・期間など |
| `flyer.theme` | blue / red / navy / green / warm / mono | 帯と価格の色 |
| `flyer.filler_lead` | 掲載以外の物件も…（HTML可） | 余り枠の案内文 |
| `flyer.disclaimer` | 掲載情報は作成時点の… | 省略時は既定の文が入る |

## 3. properties の全キー

すべて任意だが、`check_compliance.py` が必須級の欠落を指摘する。

### 共通
| キー | 型 | 例 |
|---|---|---|
| `name` | str | グランドヒルズ荻窪 505号室 |
| `category` | str | 中古マンション / 中古戸建 / 新築戸建 / 売地 / 収益物件 |
| `catch` | str | キャッチコピー（`references/copywriting.md` 参照） |
| `price` | int（円）または str | `34800000` → 「3,480万円」に整形。`"未定"` も可 |
| `price_note` | str | 税込 / 諸費用別 など |
| `address` | str | 都道府県から丁目まで（番地は概要書どおり） |
| `access` | list | `[{"line":"JR中央線","station":"荻窪","minutes":8,"means":"徒歩","distance_m":600}]` |
| `layout` | str | 3LDK |
| `area_exclusive` | float（㎡） | 専有面積・建物面積 |
| `area_land` | float（㎡） | 土地面積 |
| `balcony` | float（㎡） | |
| `built` | str | 1998年3月 |
| `structure` | str | 鉄筋コンクリート造 地上10階建 |
| `land_rights` | str | 所有権 / 借地権（旧法・定期） |
| `current_status` | str | 空家 / 居住中 / 更地 / 賃貸中 |
| `delivery` | str | 即時 / 相談 / 2026年12月 |
| `transaction_type` | str | 売主 / 代理 / 媒介（専任）/ 媒介（専属専任）/ 媒介（一般） |
| `points` | list[str] | アピールポイント |
| `photos` | list[str] | 画像パス。JSON からの相対パスでよい |
| `floorplan` | str | 間取図の画像パス |
| `map` | str | 案内図の画像パス |
| `notes` | str | 備考・特記事項 |

### マンション向け
`floor`（5階／10階建）、`management_fee`（円/月）、`repair_reserve`（円/月）

### 土地・戸建向け
`use_district`（用途地域）、`coverage_ratio`（"60％／200％"）、`road`（接面道路）、
`private_road`（私道負担 有無）、`building_condition`（建築条件 有無）

### 収益物件向け
`income_annual`（円/年）、`yield_gross`（数値、例 `7.32`）、
`yield_label`（"表面利回り（満室想定）" のように、表面/実質と前提を必ず書く）

## 4. 概要書の表記ゆれ対応表

概要書は会社ごとに項目名が違う。左の語を見つけたら右のキーに入れる。

| 概要書によくある表記 | キー |
|---|---|
| 価格 / 販売価格 / 売出価格 / 販売金額 | `price` |
| 所在地 / 住居表示 / 地番 | `address` |
| 交通 / 最寄駅 / 沿線・駅 / アクセス | `access` |
| 間取 / 間取り / タイプ / 間取タイプ | `layout` |
| 専有面積 / 建物面積 / 延床面積 / 床面積 | `area_exclusive` |
| 敷地面積 / 土地面積 / 公簿面積 / 実測面積 | `area_land` |
| バルコニー面積 / ルーフバルコニー | `balcony` |
| 築年月 / 建築年月 / 完成年月 / 竣工年月 | `built` |
| 構造・規模 / 建物構造 / 構造階数 | `structure` |
| 所在階 / 階数 / 階 | `floor` |
| 管理費 / 管理費等 | `management_fee` |
| 修繕積立金 / 積立金 / 修繕費 | `repair_reserve` |
| 権利形態 / 土地権利 / 敷地権利 / 土地の権利 | `land_rights` |
| 用途地域 / 地域地区 | `use_district` |
| 建ぺい率・容積率 / 建蔽率／容積率 | `coverage_ratio` |
| 接道状況 / 前面道路 / 道路 / 接面道路 | `road` |
| 私道負担 / 私道負担面積 / 敷地内私道 | `private_road` |
| 建築条件 / 建築条件の有無 | `building_condition` |
| 現況 / 現在の状況 | `current_status` |
| 引渡し / 引渡時期 / 入居可能時期 | `delivery` |
| 取引態様 / 取引形態 / 取引条件 | `transaction_type` |
| 年間賃料収入 / 満室時年間収入 / 想定年収 | `income_annual` |
| 表面利回り / 想定利回り / 利回り | `yield_gross` + `yield_label` |
| 備考 / 特記事項 / その他 | `notes` |

## 5. 数値・単位の正規化ルール

数値キー（`price` / 面積 / 管理費）は単位を外した数値で入れる。整形は
`build_flyer.py` が行うので、「万円」「㎡」などの単位文字を混ぜないこと。

| 概要書の表記 | JSON の値 |
|---|---|
| 3,480万円 | `34800000` |
| 1億2,000万円 | `120000000` |
| 4,980万円（税込） | `49800000` + `price_note: "税込"` |
| 応相談 / 未定 | `"応相談"` / `"未定"`（文字列のまま） |
| 68.52㎡（20.72坪） | `68.52`（坪は自動計算されるので不要） |
| 12,800円/月 | `12800` |
| 7.32％ | `7.32` |
| 徒歩8分 | `access[].minutes: 8` |
| 駅より600m | `access[].distance_m: 600`（分数の検算に使われる） |

## 6. 読み取れなかった項目の扱い

概要書に書かれていない項目は **キーごと省くか `null` にする**。埋めない。

広告は事実の表示であって、推測を書くと不当表示になり得る。「たぶん所有権だろう」
「築年から見て多分RC造」といった補完はしない。欠けている項目のうち法定の必要表示に
当たるものは `check_compliance.py` が指摘するので、そこは概要書の出し手に確認する。
