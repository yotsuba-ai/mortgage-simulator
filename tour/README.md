# 360° バーチャル内見ビューアー (RICOH THETA / RICOH360 対応)

RICOH THETA / RICOH360 で撮影した全天球画像 (エクイレクタングラー JPEG) を、
アットホームの「バーチャル内見」のようにブラウザ上で見回せるビューアーです。
外部ライブラリに依存しない単体の HTML / JS / CSS なので、静的ホスティング (GitHub Pages など) にそのまま置けます。

## できること

- ドラッグ / スワイプで見回し、ホイール / ピンチでズーム、ダブルクリックで寄る
- 部屋 (シーン) を切り替えるサムネイル一覧
- パノラマ上の「移動ポイント」をクリックして隣の部屋へ移動
- 「情報ポイント」で設備説明などの吹き出しを表示 (リンク付きも可)
- 間取り図ミニマップ (現在地と向きを表示、クリックで移動)
- 自動回転、全画面表示、スマホのジャイロ (端末を動かして見回す)
- ホームページへの埋め込み (iframe または script タグ)
- ブラウザ上で完結するツアーエディター (ホットスポットをクリックで配置し、JSON と埋め込みコードを出力)

## ファイル構成

```
tour/
├── index.html      ビューアー本体 (iframe 埋め込み用ページ)
├── editor.html     ツアーエディター
├── viewer.js       ビューアーのライブラリ (script 埋め込み用)
├── viewer.css      ビューアーのスタイル
├── tours/          ツアー設定 JSON を置くフォルダ
│   └── sample.json
└── images/         360° 画像・間取り図を置くフォルダ
```

## 使い方 (物件ツアーを作る手順)

1. **撮影する**
   THETA を三脚に立て、床から約 1.3〜1.5m の高さで各部屋の中央から撮影します。
   撮影者はスマホアプリのリモート撮影で写り込まない場所に隠れてください。
   THETA が保存する JPEG (エクイレクタングラー形式) はそのまま使えます。
2. **画像を軽くする (推奨)**
   THETA Z1 / X などの高解像度画像 (11008px 幅など) はそのままだと重く、スマホでは表示できない場合があります。
   横幅 4096〜8192px、1 枚 1〜3MB 程度に縮小しておくと快適です。
3. **`tour/images/` に画像をアップロード**
   ファイル名は半角英数字を推奨 (例: `living.jpg`, `kitchen.jpg`)。
4. **エディターでツアーを作る**
   `https://<公開URL>/tour/editor.html` を開き、「画像を選んでシーン追加」で画像を読み込み、
   「移動ポイントを追加」を押してからドアなどをクリックしてホットスポットを置きます。
   「現在の視点を初期表示にする」で各部屋の最初の向きを決めます。
5. **JSON を保存**
   「JSONをダウンロード」で保存したファイルを `tour/tours/` にアップロードします。
6. **埋め込みコードをホームページに貼る**
   エディター下部の「ホームページ埋め込みコード」をコピーして貼り付けます。

サンプルツアー: `tour/?tour=sample` / エディターでサンプルを開く: `tour/editor.html?load=sample`

## 埋め込み方法

### iframe (最も簡単・推奨)

```html
<iframe
  src="https://<公開URL>/tour/?tour=mytour"
  width="100%" height="480"
  style="border:0;max-width:100%;display:block"
  allow="fullscreen; gyroscope; accelerometer" allowfullscreen loading="lazy"
  title="360°バーチャル内見"></iframe>
```

URL パラメータ:

| パラメータ | 意味 |
| --- | --- |
| `tour=mytour` | `tours/mytour.json` を読み込む (`config=` で任意の URL も可) |
| `scene=kitchen` | 最初に表示するシーン ID |
| `autorotate=1` / `autorotate=0` / `autorotate=3` | 自動回転の有効/無効/速度 (度/秒) |
| `yaw=90&pitch=-5&hfov=80` | 最初の向きと画角 |
| `ui=minimal` | タイトル・サムネイル・間取り図を隠す |
| `thumbs=0` `title=0` `plan=0` `controls=0` `hint=0` | 各 UI を個別に隠す |

### script タグ (ページ内に直接描画する場合)

```html
<link rel="stylesheet" href="https://<公開URL>/tour/viewer.css">
<div data-ricoh-tour="https://<公開URL>/tour/tours/mytour.json" style="height:480px"></div>
<script src="https://<公開URL>/tour/viewer.js"></script>
```

`data-scene` `data-autorotate` `data-yaw` `data-pitch` `data-hfov` `data-ui="minimal"` 属性で同じ設定ができます。
別ドメインのホームページに script 方式で埋め込む場合、画像サーバー側で CORS ヘッダー
(`Access-Control-Allow-Origin`) が必要です (GitHub Pages は対応済み)。

JavaScript から操作する場合:

```js
RicohTour.mount('#tour', 'https://<公開URL>/tour/tours/mytour.json').then(function (viewer) {
  viewer.loadScene('kitchen');            // シーン切替
  viewer.setView({ yaw: 90, pitch: 0 });  // 向きを変える
  viewer.on('scenechange', function (e) { console.log(e.scene.name); });
});
```

iframe 埋め込みの場合は `postMessage` で操作できます:
`iframe.contentWindow.postMessage({ type: 'ricohtour:loadScene', scene: 'kitchen' }, '*')`

## ツアー設定 JSON

```json
{
  "title": "○○マンション 301号室",
  "defaultScene": "living",
  "autoRotate": 2,
  "hfov": 95,
  "floorplan": { "src": "../images/floorplan.png", "open": true },
  "scenes": [
    {
      "id": "living",
      "name": "リビング",
      "src": "../images/living.jpg",
      "yaw": 0, "pitch": 0,
      "plan": { "x": 0.48, "y": 0.5, "rotation": 0 },
      "hotspots": [
        { "type": "scene", "target": "kitchen", "yaw": 90, "pitch": -2, "text": "キッチンへ", "targetYaw": 0 },
        { "type": "info", "yaw": 0, "pitch": 6, "title": "南向きの窓", "text": "日当たり良好", "url": "https://..." }
      ]
    }
  ]
}
```

- 画像パスは JSON ファイルからの相対パス、または絶対 URL
- `yaw`: 水平方向の角度 (画像中央が 0、右回りが正)、`pitch`: 上下 (上が正)
- `hotspots[].type`: `scene` (部屋へ移動) / `info` (説明の吹き出し)
- `targetYaw` / `targetPitch`: 移動後に向く方向 (省略時は移動先の初期表示)
- `plan.x` / `plan.y`: 間取り図上の位置 (0〜1)、`plan.rotation`: 向きの補正 (度)
- `thumb`: サムネイル画像 (省略時は `src` を縮小表示)

## 対応環境

WebGL が使える主要ブラウザ (Chrome / Safari / Edge / Firefox、iOS / Android を含む)。
iOS のジャイロは画面上のボタンからユーザーが許可した場合に有効になります。
