# Seedance 動画化ガイド ─ 『ソラノハテ商會』

> 画像生成（ChatGPT）で作った**キーフレーム画像**を起点に、
> Seedance で 5〜10秒のクリップを積み上げる方式を前提にしています。

---

## 1. 前提と制約（作業計画の目安）

一般的な動画生成モデル（Seedance 系を含む）で共通して効いてくる制約です。
実際の上限は利用するプラン・提供面によって変わるため、**着手前に必ず実機で1本試写**してください。

| 項目 | 想定 | 制作上の意味 |
|---|---|---|
| 1クリップ尺 | 5秒 / 10秒 | 1カット＝1クリップで設計する。長回しは諦める |
| 入力方式 | text-to-video / **image-to-video** | キャラが出るカットは**必ず i2v**。t2v は風景・抽象のみ |
| 解像度 | 480p / 720p / 1080p | 検証は480pで数を回し、採用カットだけ1080pで焼き直す |
| アスペクト | 16:9 基本 | 縦版が要るなら最初から別カットとして設計する（トリミングで済ませない） |
| 音声 | 別途 | BGM・SE・声は編集ソフトで後乗せ |

**重要**：連続する2カットで同じキャラを出すときは、**同じキーフレーム画像**から
派生させると顔が安定します。カットごとに新しい画像を作ると別人になります。

---

## 2. プロンプトの型（この作品用テンプレート）

```
[キャラの一貫性キー] +
[主体は何をしているか：動詞ひとつ] +
[カメラ：ワークひとつだけ] +
[環境と光] +
[画風：共通スタイル文] +
[Negative]
```

### 良い例
```
Akari: dark blue-black cropped hair with ONE long right side lock, freckles, oversized khaki coat.
She slowly turns her head toward the camera, hair drifting.
Camera: slow dolly in.
Dim harbor at dawn, backlit, pale cyan glow from hanging glass bottles, drifting dust.
2D anime film cel style, hand-painted watercolor background, soft thin linework, muted saturation.
Negative: photorealistic, 3D render, text, watermark, extra fingers, fast motion, morphing face.
```

### 悪い例（破綻する）
```
灯が振り向いて走り出し、船に飛び乗ってエンジンをかけ、ミカに笑いかける
```
→ **動詞が4つ**。4カットに割ってください。

---

## 3. 動きの指定：使ってよい語彙

| 分類 | 推奨（安定） | 非推奨（破綻しやすい） |
|---|---|---|
| 人物の動き | slowly turns, breathes, blinks, hair drifts, reaches out one hand, walks toward camera | runs, jumps, fights, dances, complex hand gestures |
| カメラ | static, slow dolly in, slow dolly out, slow pan left/right, slow tilt up/down, slow orbit | fast zoom, handheld shake, whip pan, crane + rotate |
| 環境 | drifting particles, rising bubbles, rippling water, blowing curtain, falling light motes, slow clouds | explosions, crowds, rain with splashes, fire |
| 表情 | subtle expression change, eyes slowly widen, a single tear falls | 口パク（lip sync）、大笑い、高速な表情変化 |

**口の動きは指定しない**。会話は「後ろ姿」「引き」「手元」「目だけのアップ」で処理します。

---

## 4. カット設計の原則

1. **1クリップ＝1動詞＝1カメラワーク**
2. **人物が大きく映るカットほど動かさない**（顔のアップは呼吸と瞬きだけ）
3. **激しい動きは環境に肩代わりさせる**
   - 「走る」→ 走る足元のアップ＋背景が高速に流れる
   - 「飛び込む」→ 水面のアップに水柱が上がる
4. **繋ぎは光でやる**。カット尻を白飛び／暗転で終わらせると編集で繋がる
5. **同じ場所の連続カットは、同じキーフレーム画像から派生**させる

---

## 5. 破綻したときの対処

| 症状 | 対処 |
|---|---|
| 顔が別人に変わっていく | 動きを減らす。カメラを static に。尺を10s→5sへ |
| 手が崩れる | 手をフレームアウトさせる構図に変える。ポケットに入れる指定 |
| 服の模様が変わる | 模様の説明を1文に短縮し、プロンプト冒頭へ移動 |
| 画風が実写寄りになる | 「2D anime cel」を冒頭にも重ねて2回書く。Negative に photorealistic を必ず |
| 動きが速すぎる | `slow`, `gentle`, `barely moving` を動詞に付ける |
| 光る物が点滅する | 「steady soft glow, no flicker」を追記 |

---

## 6. 制作順序（推奨）

```
Phase 1  第1話 S1・S4・S8 の3カットだけ作る（空／海／夜の軒先）
         → この3本で画風とキャラの安定性を検証する
Phase 2  第1話 全8シーン = 約20クリップ を量産（480p）
Phase 3  採用カットを1080pで焼き直し
Phase 4  編集ソフトで連結、BGM・SE・（必要なら）音声を乗せる
Phase 5  第5話「空鯨の腹の中」＝ 台詞なしの映像詩として単体で成立させる
```

**Phase 5 を先に作るのも有効**です。台詞がなく、キャラの顔アップも少なく、
抽象的で美しいため、生成AIの弱点を全部回避できます。PVとして単体で成立します。

---

## 7. 共通末尾（全クリップに貼るブロック）

```
Style: 2D anime film cel style, hand-painted watercolor background, soft thin linework,
backlit twilight lighting, indigo and pale cyan palette, muted saturation, subtle film grain,
steady soft glow with no flicker, calm slow pacing.

Negative: photorealistic, 3D render, plastic skin, oversaturated, heavy lens flare, text,
letters, watermark, logo, extra fingers, deformed hands, morphing face, identity drift,
fast motion, camera shake, lip sync, modern objects.
```
