#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
check_compliance.py — 物件データ(JSON)を不動産広告のルールに照らして点検する。

根拠にしているのは主に次の3つ。詳しい解説は references/compliance.md を参照。
  * 宅地建物取引業法（広告開始時期、取引態様の明示、誇大広告の禁止）
  * 景品表示法（優良誤認・有利誤認の禁止）
  * 不動産の表示に関する公正競争規約／同施行規則（必要表示事項、特定用語の使用基準）

チェッカーは「機械的に分かること」だけを見る。法的な最終判断は宅建業者が行うもので、
このスクリプトは出稿前に人間が見落としがちな抜けを拾うためのもの。

  python3 check_compliance.py properties.json          # 人が読むレポート
  python3 check_compliance.py properties.json --json   # 機械処理向け
終了コード: ERROR が1件でもあれば 1、それ以外は 0。
"""

import argparse
import json
import datetime
import math
import re
import sys

# --- 特定用語（客観的な裏付けなしには使えない表現） -------------------------
# 規約18条の特定用語のほか、実務で指導されやすい表現をまとめている。
TERMS = [
    ("ERROR", "最上級表現", [
        "完全", "完璧", "絶対", "万全", "日本一", "日本初", "業界一", "業界初",
        "当社だけ", "他に類を見ない", "抜群", "最高級", "最高", "最上級", "超一流",
        "ナンバーワン", "ナンバー1", "No.1", "NO.1", "№1", "唯一",
    ], "客観的な調査結果など、裏付けとなる事実を示せない限り使えません（規約18条）。"),
    ("ERROR", "安さの誇張", [
        "格安", "激安", "破格", "掘出物", "掘り出し物", "投売り", "投げ売り",
        "バーゲンセール", "赤字覚悟", "処分価格", "大特価", "超特価",
    ], "根拠のない安さの強調は有利誤認になります。値下げは二重価格表示の要件を満たす必要があります。"),
    ("ERROR", "収益・将来の断定", [
        "値上がり確実", "必ず値上がり", "確実に儲か", "損はしません", "損しない",
        "元本保証", "利回り保証", "収入保証", "絶対安心",
    ], "将来の価格・収益を断定する表現は誇大広告に当たります。"),
    ("WARN", "優位性の断定", [
        "特選", "厳選", "選りすぐり", "イチオシ", "一級", "極上", "至極",
    ], "選定の基準を示せるなら可。示せないなら物件そのものの事実に言い換えてください。"),
    ("WARN", "あいまいな立地表現", [
        "駅前", "駅近", "駅直結", "一等地", "都心至近", "超便利", "好立地",
    ], "『徒歩◯分』『◯m』のように、距離や所要時間の事実で表現してください。"),
    ("WARN", "販売状況の表現", [
        "完売", "売切", "売り切れ", "残りわずか", "先着1名",
    ], "事実と異なる場合はおとり広告になります。事実であれば掲載自体を取り下げてください。"),
]

# 建物のある物件（築年月の記載が要る）
BUILDING_CATS = ("マンション", "戸建", "アパート", "一棟", "ビル", "収益", "住宅", "テラス")
LAND_CATS = ("土地", "売地", "宅地")


def months_since(built, today=None):
    """築年月から今日までの経過月数。「新築」を名乗れるのは建築後1年未満まで。"""
    if not built:
        return None
    m = re.search(r"(\d{4})\s*年(?:\s*(\d{1,2})\s*月)?", str(built))
    if not m:
        return None
    y = int(m.group(1))
    mo = int(m.group(2) or 1)
    t = today or datetime.date.today()
    return (t.year - y) * 12 + (t.month - mo)


def texts_of(p):
    """物件データのうち、広告文としてチラシに載る文字列を全部集める。"""
    out = []
    for k in ("catch", "name", "notes", "price_note", "current_status", "yield_label"):
        v = p.get(k)
        if isinstance(v, str):
            out.append((k, v))
    for i, v in enumerate(p.get("points") or []):
        if isinstance(v, str):
            out.append(("points[{}]".format(i), v))
    return out


def is_building(p):
    cat = (p.get("category") or "") + (p.get("name") or "")
    if any(k in cat for k in LAND_CATS) and not any(k in cat for k in BUILDING_CATS):
        return False
    return bool(p.get("built") or p.get("structure") or p.get("layout") or
                any(k in cat for k in BUILDING_CATS))


def is_land(p):
    cat = (p.get("category") or "")
    return any(k in cat for k in LAND_CATS)


def add(issues, level, code, msg, hint=""):
    issues.append({"level": level, "code": code, "message": msg, "hint": hint})


def check_company(company, issues):
    """事業者に関する表示は規約上の必要表示事項。1枚のチラシに必ず入れる。"""
    if not company.get("name"):
        add(issues, "ERROR", "事業者名なし", "会社名が未設定です。", "company.name")
    if not company.get("license"):
        add(issues, "ERROR", "免許番号なし",
            "宅地建物取引業の免許証番号が未設定です。",
            'company.license 例: "東京都知事(3)第123456号"')
    if not (company.get("tel") or company.get("address")):
        add(issues, "ERROR", "連絡先なし", "電話番号・所在地のいずれも未設定です。", "company.tel / company.address")


def check_property(p, idx, issues):
    label = p.get("name") or p.get("address") or "物件{}".format(idx + 1)

    def a(level, code, msg, hint=""):
        add(issues, level, code, "[{}] {}".format(label, msg), hint)

    # --- 必要表示事項 ---------------------------------------------------
    if not p.get("transaction_type"):
        a("ERROR", "取引態様なし",
          "取引態様の記載がありません。",
          '売主 / 代理 / 媒介（専属専任・専任・一般）のいずれかを transaction_type に入れてください。')
    if not p.get("address"):
        a("ERROR", "所在地なし", "所在地の記載がありません。", "address")
    if not p.get("access"):
        a("ERROR", "交通の記載なし", "最寄駅と所要時間の記載がありません。",
          '例: access:[{"line":"JR中央線","station":"荻窪","minutes":8}]')
    if p.get("price") in (None, ""):
        a("WARN", "価格未定",
          "価格が未設定です。価格未定のまま出せるのは予告広告の要件を満たす場合だけです。",
          '予告広告なら flyer.title などに「予告広告」と明示し、価格に "未定" を入れてください。')
    if p.get("area_exclusive") in (None, "") and p.get("area_land") in (None, ""):
        a("ERROR", "面積なし", "建物面積・土地面積のいずれも記載がありません。",
          "area_exclusive（建物・専有）/ area_land（土地）")

    if is_building(p) and not p.get("built"):
        a("ERROR", "築年月なし", "建物の築年月（新築の場合は建築年月）の記載がありません。", "built")

    if is_land(p) or "新築" in (p.get("category") or ""):
        if p.get("building_condition") in (None, ""):
            a("WARN", "建築条件の記載なし",
              "土地・新築の広告では建築条件付かどうかの明示が要ります。",
              'building_condition に "有（建築条件付）" または "無（建築条件なし）"')
        if p.get("private_road") in (None, ""):
            a("WARN", "私道負担の記載なし",
              "私道負担の有無は必要表示事項です。負担がなくても「無」と書きます。",
              'private_road に "無" または "有（◯㎡）"')
        if not p.get("road"):
            a("WARN", "接道の記載なし", "接面道路の種別・幅員の記載がありません。", "road")

    # --- 特定用語の使用基準 -----------------------------------------------
    if p.get("built") and "新築" in "".join(v for _, v in texts_of(p)) + (p.get("category") or ""):
        cur = str(p.get("current_status") or "")
        months = months_since(p.get("built"))
        if months is not None and months >= 12:
            a("ERROR", "新築表示",
              "「新築」は建築後1年未満かつ未入居の場合に限られます（築年月: {} / 経過 約{}か月）。"
              .format(p["built"], months),
              "「築浅」「リフォーム済」など事実に沿う表現に変えてください。")
        elif "入居" not in cur and "未使用" not in cur and cur:
            a("WARN", "新築表示",
              "「新築」を使うには未入居であることが要ります。現況「{}」を確認してください。".format(cur))

    joined = " ".join(v for _, v in texts_of(p))
    if ("リフォーム" in joined or "リノベーション" in joined) and \
            not re.search(r"(19|20)\d{2}\s*年", joined):
        a("WARN", "リフォーム表示",
          "「リフォーム済／リノベーション済」は工事の内容と時期の明示が必要です。",
          '例: "2025年12月に内装全面リフォーム（水回り・内装・建具）"')

    # --- 収益物件 ---------------------------------------------------------
    if p.get("yield_gross") not in (None, ""):
        lab = str(p.get("yield_label") or "")
        if "表面" not in lab and "実質" not in lab:
            a("WARN", "利回りの種別",
              "利回りが表面か実質かの明示がありません。",
              'yield_label に "表面利回り（満室想定）" などを入れてください。')
        elif "想定" in lab or "満室" in lab:
            if not p.get("current_status"):
                a("WARN", "満室想定の前提",
                  "満室想定利回りを載せる場合、現況の稼働状況も併記してください。", "current_status")

    # --- おとり広告 -------------------------------------------------------
    st = str(p.get("current_status") or "") + str(p.get("status") or "")
    if any(k in st for k in ("成約", "契約済", "商談中", "売止", "販売終了")):
        a("ERROR", "掲載可否",
          "成約済み・取引できない物件は広告できません（おとり広告）。",
          "この物件はチラシから外してください。")

    # --- 徒歩分数の検算 -----------------------------------------------------
    for i, ac in enumerate(p.get("access") or []):
        if not isinstance(ac, dict):
            continue
        d, m = ac.get("distance_m"), ac.get("minutes")
        if d and m:
            want = max(1, math.ceil(float(d) / 80.0))
            if int(m) != want:
                a("WARN", "徒歩分数",
                  "道路距離{}mなら徒歩{}分です（記載は{}分）。80mを1分として端数は切り上げます。"
                  .format(d, want, m), "access[{}]".format(i))
        elif m in (None, "") and ac.get("means", "徒歩") == "徒歩":
            a("WARN", "所要時間なし", "徒歩所要時間の記載がありません。", "access[{}].minutes".format(i))

    # --- 用語スキャン -------------------------------------------------------
    for level, cat, words, why in TERMS:
        for field, text in texts_of(p):
            for w in words:
                if w in text:
                    a(level, cat, "{}に「{}」が含まれます。".format(field, w), why)


def run(data):
    issues = []
    check_company(data.get("company") or {}, issues)
    props = data.get("properties") or []
    if not props:
        add(issues, "ERROR", "物件なし", "properties が空です。")
    for i, p in enumerate(props):
        check_property(p, i, issues)
    return issues


def main():
    ap = argparse.ArgumentParser(description="物件JSONの不動産広告表示チェック")
    ap.add_argument("json_path")
    ap.add_argument("--json", action="store_true", help="JSONで出力")
    a = ap.parse_args()
    with open(a.json_path, encoding="utf-8") as f:
        data = json.load(f)
    issues = run(data)
    errs = [i for i in issues if i["level"] == "ERROR"]
    warns = [i for i in issues if i["level"] == "WARN"]

    if a.json:
        print(json.dumps({"errors": len(errs), "warnings": len(warns), "issues": issues},
                         ensure_ascii=False, indent=2))
    else:
        if not issues:
            print("表示チェック: 指摘なし（ERROR 0 / WARN 0）")
        else:
            print("表示チェック: ERROR {} 件 / WARN {} 件\n".format(len(errs), len(warns)))
            for grp, title in (("ERROR", "■ 出稿前に必ず直すもの"), ("WARN", "■ 確認したほうがよいもの")):
                sel = [i for i in issues if i["level"] == grp]
                if not sel:
                    continue
                print(title)
                for i in sel:
                    print("  [{}] {}".format(i["code"], i["message"]))
                    if i["hint"]:
                        print("      → {}".format(i["hint"]))
                print()
        print("※ 機械的に分かる範囲の点検です。最終的な表示の可否は宅地建物取引業者がご判断ください。")
    return 1 if errs else 0


if __name__ == "__main__":
    sys.exit(main())
