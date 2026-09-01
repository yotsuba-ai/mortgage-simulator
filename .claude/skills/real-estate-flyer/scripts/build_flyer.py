#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_flyer.py — 物件データ(JSON) から A4 印刷用の折込/ポスティング用チラシ HTML を組む。

設計の要点
  * A4 の実寸(210x297mm)で組み、@page margin:0 + mm 指定にすることで
    ブラウザ印刷でも縮小されずに出る。
  * 掲載件数から 1/2/3/4/6/8/9/12 面のグリッドを選び、枠が小さくなるほど
    項目を落とす(tier)。小さい枠に全項目を詰めると読めないチラシになるため。
  * 取引態様と事業者情報は不動産の表示に関する公正競争規約上の必須表示なので、
    どの tier でも必ず描画する。

使い方:
  python3 build_flyer.py properties.json -o flyer.html
  python3 build_flyer.py properties.json -o flyer.html --per-page 4 --theme red
  python3 build_flyer.py properties.json -o flyer.html --pdf flyer.pdf
"""

import argparse
import base64
import html
import json
import mimetypes
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_CSS = os.path.join(HERE, "..", "assets", "flyer.css")

# 掲載件数 -> (1ページあたりの枠数, 列, 行, tier)
LAYOUTS = {
    1:  (1, 1, 1, "full"),
    2:  (2, 1, 2, "large"),
    3:  (3, 1, 3, "large"),
    4:  (4, 2, 2, "medium"),
    6:  (6, 2, 3, "medium"),
    8:  (8, 2, 4, "compact"),
    9:  (9, 3, 3, "compact"),
    12: (12, 3, 4, "mini"),
}

# 件数 -> 使う面数。端数は 1 段階上の面数に載せ、余りは会社案内枠で埋める。
def pick_per_page(n):
    for slots in (1, 2, 3, 4, 6, 8, 9, 12):
        if n <= slots:
            return slots
    return 12


# tier ごとのキャッチ/ポイントの上限文字数。超えると枠内で行が詰まって読みにくくなる。
# 自動で切り詰めると文が途中で切れて広告として成立しないので、警告に留めて書き手に返す。
LEN_BUDGET = {
    "full":    (34, 24),
    "large":   (28, 20),
    "medium":  (24, 16),
    "compact": (18, 14),
    "mini":    (14, 0),
}


def length_warnings(props, tier):
    cmax, pmax = LEN_BUDGET[tier]
    out = []
    for p in props:
        label = p.get("name") or p.get("address") or "(名称未設定)"
        c = p.get("catch") or ""
        if len(c) > cmax:
            out.append("{}: キャッチが{}字（{}面レイアウトの目安は{}字まで）".format(
                label, len(c), tier, cmax))
        for x in (p.get("points") or []):
            if pmax == 0:
                break
            if len(x) > pmax:
                out.append("{}: アピール「{}」が{}字（目安{}字まで）".format(
                    label, x[:12] + "…", len(x), pmax))
    return out


# ---------------------------------------------------------------- 整形ユーティリティ

def e(v):
    return html.escape("" if v is None else str(v))


def fmt_price(p, unit_suffix="円"):
    """34800000 -> '3,480万円' / 128000000 -> '1億2,800万円' / 文字列はそのまま通す。"""
    if p is None or p == "":
        return None, None
    if isinstance(p, str):
        s = p.strip()
        return (s, "") if s else (None, None)
    try:
        v = int(round(float(p)))
    except (TypeError, ValueError):
        return str(p), ""
    if v <= 0:
        return None, None
    if v % 10000 != 0:
        return "{:,}".format(v), unit_suffix
    man = v // 10000
    if man >= 10000:
        oku, rest = divmod(man, 10000)
        if rest:
            return "{}億{:,}".format(oku, rest), "万円"
        return "{}億".format(oku), "円"
    return "{:,}".format(man), "万円"


def fmt_yen(v):
    if v in (None, ""):
        return None
    if isinstance(v, str):
        return v
    try:
        return "{:,}円".format(int(round(float(v))))
    except (TypeError, ValueError):
        return str(v)


def fmt_area(v, tsubo=False):
    if v in (None, ""):
        return None
    if isinstance(v, str):
        return v
    try:
        f = float(v)
    except (TypeError, ValueError):
        return str(v)
    s = "{:.2f}".format(f).rstrip("0").rstrip(".") + "㎡"
    if tsubo:
        s += "（約{:.2f}坪）".format(f / 3.30578)
    return s


def fmt_access(prop, short=False, limit=2):
    """交通は駅名+徒歩分数が命。狭い枠では先頭1路線だけに絞る。"""
    acc = prop.get("access") or []
    if isinstance(acc, str):
        return acc
    out = []
    for a in acc:
        if isinstance(a, str):
            out.append(a)
            continue
        line = a.get("line") or ""
        st = a.get("station") or ""
        mins = a.get("minutes")
        means = a.get("means") or "徒歩"
        head = "{}「{}」".format(line, st) if line and not short else ("「{}」".format(st) if st else "")
        if mins in (None, ""):
            out.append(head.strip())
        else:
            out.append("{}{}{}分".format(head, means, mins))
    out = [o for o in out if o]
    if not out:
        return None
    return out[0] if short else "／".join(out[:limit])


def fmt_yield(prop):
    y = prop.get("yield_gross")
    if y in (None, ""):
        return None
    label = prop.get("yield_label") or "表面利回り"
    if isinstance(y, str):
        return "{} {}".format(label, y)
    return "{} {:.2f}%".format(label, float(y))


def data_uri(path, base_dir):
    """画像はデータURIで埋め込む。HTML1枚を印刷所や店舗にそのまま渡せるようにするため。"""
    if not path:
        return None
    p = path if os.path.isabs(path) else os.path.join(base_dir, path)
    if not os.path.isfile(p):
        return None
    mime = mimetypes.guess_type(p)[0] or "image/jpeg"
    with open(p, "rb") as f:
        return "data:{};base64,{}".format(mime, base64.b64encode(f.read()).decode("ascii"))


def frame(src, cls, placeholder):
    if src:
        return '<div class="frame {}"><img src="{}" alt=""></div>'.format(cls, src)
    return '<div class="frame {}"><div class="ph">{}</div></div>'.format(cls, e(placeholder))


# ---------------------------------------------------------------- カード描画

def wrap_table(t):
    """表は flex アイテムとして縮みにくいので、必ず div に包んでそちらで詰める。"""
    return '<div class="spec-wrap">{}</div>'.format(t)


def specs_table_html(rows, pair_threshold=9):
    """概要表。項目が多いときは販売図面と同じ2列組み(見出し/値 x2)にして高さを半分にする。
    A4の1面チラシは写真と価格に面積を割きたいので、表を縦に伸ばさないことが効く。"""
    if not rows:
        return ""
    if len(rows) <= pair_threshold:
        body = "".join("<tr><th>{}</th><td>{}</td></tr>".format(e(k), e(v)) for k, v in rows)
        return wrap_table('<table class="specs-table">{}</table>'.format(body))
    half = -(-len(rows) // 2)
    left, right = rows[:half], rows[half:]
    trs = []
    for i in range(half):
        lk, lv = left[i]
        cells = "<th>{}</th><td>{}</td>".format(e(lk), e(lv))
        if i < len(right):
            rk, rv = right[i]
            cells += "<th>{}</th><td>{}</td>".format(e(rk), e(rv))
        else:
            cells += '<th class="empty"></th><td class="empty"></td>'
        trs.append("<tr>{}</tr>".format(cells))
    return wrap_table('<table class="specs-table two-col">{}</table>'.format("".join(trs)))


def spec_rows(p, with_location=True):
    """全項目。値が無い行は落とす。所在地・交通は足元の行に出す場合があるので切替式。"""
    rows = [
        ("所在地", p.get("address") if with_location else None),
        ("交通", fmt_access(p) if with_location else None),
        ("価格", None),  # 価格は見出しで大きく出すので表からは外す
        ("間取り", p.get("layout")),
        ("建物面積", fmt_area(p.get("area_exclusive"), tsubo=True)),
        ("土地面積", fmt_area(p.get("area_land"), tsubo=True)),
        ("バルコニー", fmt_area(p.get("balcony"))),
        ("築年月", p.get("built")),
        ("構造・階数", p.get("structure")),
        ("所在階", p.get("floor")),
        ("管理費", fmt_yen(p.get("management_fee"))),
        ("修繕積立金", fmt_yen(p.get("repair_reserve"))),
        ("年間収入", fmt_yen(p.get("income_annual"))),
        ("利回り", fmt_yield(p)),
        ("土地権利", p.get("land_rights")),
        ("用途地域", p.get("use_district")),
        ("建ぺい/容積", p.get("coverage_ratio")),
        ("接道状況", p.get("road")),
        ("私道負担", p.get("private_road")),
        ("建築条件", p.get("building_condition")),
        ("現況", p.get("current_status")),
        ("引渡し", p.get("delivery")),
        ("取引態様", p.get("transaction_type")),
        ("備考", p.get("notes")),
    ]
    return [(k, v) for k, v in rows if v not in (None, "")]


def chips_for(p, tier, slots=1):
    """枠が狭いほど「間取り・面積・築年・階」に絞る。読み手が最初に見る4項目。"""
    items = []
    if p.get("layout"):
        items.append(("間取り", p["layout"]))
    a = fmt_area(p.get("area_exclusive"))
    if a:
        items.append(("建物", a))
    al = fmt_area(p.get("area_land"))
    if al:
        items.append(("土地", al))
    if p.get("built"):
        items.append(("築年", p["built"]))
    if tier in ("full", "large", "medium"):
        if p.get("floor"):
            items.append(("所在階", p["floor"]))
        if p.get("land_rights"):
            items.append(("権利", p["land_rights"]))
        if p.get("coverage_ratio"):
            items.append(("建/容", p["coverage_ratio"]))
        if p.get("current_status"):
            items.append(("現況", p["current_status"]))
    limit = {"full": 8, "large": 6, "medium": 5, "compact": 4, "mini": 3}[tier]
    if tier == "large" and slots >= 3:
        limit = 8  # 概要表を出さない代わりにチップで補う
    return items[:limit]


def price_block(p, tier):
    num, unit = fmt_price(p.get("price"))
    if num is None:
        num, unit = "価格未定", ""
    note = p.get("price_note") or ""
    y = fmt_yield(p) if tier != "mini" else None
    parts = ['<div class="price"><span class="num">{}</span>'.format(e(num))]
    if unit:
        parts.append('<span class="unit">{}</span>'.format(e(unit)))
    if note and tier != "mini":
        parts.append('<span class="note">{}</span>'.format(e(note)))
    if y:
        parts.append('<span class="yield">{}</span>'.format(e(y)))
    parts.append("</div>")
    return "".join(parts)


def meta_block(p, tier, hide_location=False):
    """所在地・交通・取引態様。取引態様は規約上の必須表示なので tier を問わず出す。"""
    bits = []
    # large は概要表に所在地・交通が入るので、足元の行は取引態様だけにして重複を避ける。
    addr = None if hide_location else p.get("address")
    if addr:
        if tier == "mini" and len(addr) > 16:
            addr = addr[:16] + "…"
        bits.append("<b>所在地</b> {}".format(e(addr)))
    acc = None if hide_location else fmt_access(
        p, short=(tier in ("compact", "mini", "large")), limit=2 if tier == "full" else 1)
    if acc:
        bits.append("<b>交通</b> {}".format(e(acc)))
    tt = p.get("transaction_type")
    tt_html = '<span class="tt"><b>取引態様</b> {}</span>'.format(e(tt or "※要記載"))
    return '<div class="meta">{}{}</div>'.format("".join("<span>{}</span>".format(b) for b in bits), tt_html)


def card_html(p, tier, base_dir, slots=1):
    photos = p.get("photos") or []
    if isinstance(photos, str):
        photos = [photos]
    photo = data_uri(photos[0], base_dir) if photos else None
    plan = data_uri(p.get("floorplan"), base_dir)

    cat = '<span class="cat">{}</span>'.format(e(p["category"])) if p.get("category") else ""
    catch = '<h3 class="catch">{}</h3>'.format(e(p["catch"])) if p.get("catch") else ""
    name = '<div class="name">{}</div>'.format(e(p["name"])) if p.get("name") else ""

    chips = chips_for(p, tier, slots)
    chips_html = ""
    if chips:
        chips_html = '<div class="chips">{}</div>'.format(
            "".join('<span class="chip">{}<b> {}</b></span>'.format(e(k), e(v)) for k, v in chips))

    pts = [x for x in (p.get("points") or []) if x]
    pt_limit = {"full": 5, "large": 3, "medium": 2, "compact": 1, "mini": 0}[tier]
    if tier == "large" and slots >= 3:
        pt_limit = 2  # 3面は1枠が縦に短い
    pts_html = ""
    if pts and pt_limit:
        pts_html = '<ul class="points">{}</ul>'.format(
            "".join("<li>{}</li>".format(e(x)) for x in pts[:pt_limit]))

    if tier == "full":
        return full_card_html(p, photo, plan, cat, catch, name, chips_html, pts_html, base_dir)

    media = [frame(photo, "photo", "物件写真")]
    if tier in ("large", "medium"):
        media.append(frame(plan, "plan", "間取図"))
    head = cat + name + catch

    # 2面は1枠が広いので、販売図面と同じ概要表を入れて来店前に判断できる情報量にする。
    # 3面は縦が足りず、表を入れると行の途中で切れて取引態様（法定表示）まで押し出す。
    # そのため3面は表を諦め、チップを増やして情報量を確保する。
    table, loc_in_table = "", False
    if tier == "large" and slots <= 2:
        loc_in_table = True
        table = specs_table_html(spec_rows(p)[:12], pair_threshold=7)

    return (
        '<article class="card">'
        '<div class="card-media">{media}</div>'
        '<div class="card-body">{head}{price}{chips}{points}{table}{meta}</div>'
        "</article>"
    ).format(media="".join(media), head=head, price=price_block(p, tier),
             chips=chips_html, points=pts_html, table=table,
             meta=meta_block(p, tier, hide_location=loc_in_table))


def full_card_html(p, photo, plan, cat, catch, name, chips_html, pts_html, base_dir):
    """1面版: 写真を大きく、右列に概要表。単体チラシは情報を出し切ってよい。"""
    subs = [data_uri(x, base_dir) for x in (p.get("photos") or [])[1:3]]
    sub_html = "".join(frame(s, "photo", "室内写真") for s in subs) if subs else ""
    table = specs_table_html(spec_rows(p, with_location=False)[:14])
    # 1面チラシは案内図の枠を常に置く。地図の無いチラシは問い合わせに繋がりにくいため、
    # 画像未指定でも枠を残して差し込み位置を示す。
    map_html = frame(data_uri(p.get("map"), base_dir), "photo", "案内図")
    return (
        '<article class="card">'
        '<div class="card-media">{photo}{plan}</div>'
        '<div class="card-body">'
        '<div style="display:flex;align-items:flex-start;gap:3mm">'
        '<div style="min-width:0;flex:1 1 auto">{cat}{catch}{name}</div></div>'
        "{price}{chips}"
        '<div class="full-cols">'
        '<div style="display:flex;flex-direction:column;gap:2mm;min-width:0">{points}{table}</div>'
        '<div style="display:flex;flex-direction:column;gap:2mm;min-height:0">{sub}{map}</div>'
        "</div>{meta}</div></article>"
    ).format(photo=frame(photo, "photo", "物件写真"), plan=frame(plan, "plan", "間取図"),
             cat=cat, catch=catch, name=name, price=price_block(p, "full"),
             chips=chips_html, points=pts_html, table=table,
             sub=sub_html, map=map_html, meta=meta_block(p, "full"))


# ---------------------------------------------------------------- 余り枠・ヘッダ・フッタ

def filler_html(company, flyer):
    lead = flyer.get("filler_lead") or "掲載以外の物件も多数ございます。<br>ご希望の条件をお聞かせください。"
    tel = company.get("tel") or ""
    return (
        '<div class="filler">'
        '<div class="f-lead">{lead}</div>'
        '<div class="f-name">{name}</div>'
        '{tel}'
        '<div class="f-note">{note}</div>'
        "</div>"
    ).format(lead=lead, name=e(company.get("name") or ""),
             tel='<div class="f-tel">{}</div>'.format(e(tel)) if tel else "",
             note=e(company.get("hours") or ""))


def head_html(flyer, page_no, pages):
    title = e(flyer.get("title") or "物件情報")
    sub = flyer.get("subtitle")
    badge = flyer.get("badge") or (flyer.get("issued") or "")
    right = ""
    if badge:
        right = '<div class="head-badge"><b>{}</b>{}</div>'.format(
            e(badge), "（{}/{}ページ）".format(page_no, pages) if pages > 1 else "")
    elif pages > 1:
        right = '<div class="head-badge">{}/{}</div>'.format(page_no, pages)
    return (
        '<header class="head"><div style="min-width:0">'
        '<div class="head-title">{}</div>{}'
        "</div>{}</header>"
    ).format(title, '<div class="head-sub">{}</div>'.format(e(sub)) if sub else "", right)


def foot_html(company, flyer):
    lines = []
    lic = company.get("license")
    if lic:
        lines.append("免許番号：{}".format(lic))
    if company.get("address"):
        lines.append(company["address"])
    if company.get("hours"):
        lines.append("営業時間 {}".format(company["hours"]))
    if company.get("url"):
        lines.append(company["url"])
    disc = flyer.get("disclaimer") or (
        "掲載情報は作成時点のものです。物件は先着順にて、ご成約の際はご容赦ください。"
        "表示価格は消費税等を含む総額です。面積は壁芯（登記簿）表示です。")
    tel = company.get("tel")
    tel_html = ""
    if tel:
        tel_html = ('<div class="foot-tel"><div class="t-lead">{}</div>'
                    '<div class="t-num">{}</div></div>').format(
            e(company.get("tel_lead") or "お問い合わせはお気軽に"), e(tel))
    return (
        '<div class="disclaimer">{disc}</div>'
        '<footer class="foot">'
        '<div class="foot-co"><div class="co-name">{name}</div>'
        '<div class="co-line">{lines}</div></div>{tel}'
        "</footer>"
    ).format(name=e(company.get("name") or ""), lines=e("　".join(lines)),
             tel=tel_html, disc=e(disc))


# ---------------------------------------------------------------- 組み立て

def build(data, per_page=None, theme=None, css_path=None, base_dir="."):
    props = data.get("properties") or []
    if not props:
        raise SystemExit("properties が空です。少なくとも1件必要です。")
    company = data.get("company") or {}
    flyer = data.get("flyer") or {}

    slots = per_page or pick_per_page(len(props))
    if slots not in LAYOUTS:
        slots = pick_per_page(slots)
    _, cols, rows, tier = LAYOUTS[slots]

    pages_data = [props[i:i + slots] for i in range(0, len(props), slots)]
    theme = theme or flyer.get("theme") or "blue"

    with open(css_path or DEFAULT_CSS, encoding="utf-8") as f:
        css = f.read()

    body = []
    for i, chunk in enumerate(pages_data, 1):
        cells = [card_html(p, tier, base_dir, slots) for p in chunk]
        blanks = slots - len(chunk)
        # 余り枠: 最初の1枠は会社案内、それ以上は薄い空き枠。全面ベタ埋めより自然に見える。
        for j in range(blanks):
            cells.append(filler_html(company, flyer) if j == 0
                         else '<div class="filler blank"></div>')
        body.append(
            '<section class="page" data-tier="{t}" data-cols="{c}" data-rows="{r}">'
            "{head}"
            '<div class="grid">{cells}</div>'
            "{foot}</section>".format(t=tier, c=cols, r=rows,
                                      head=head_html(flyer, i, len(pages_data)),
                                      cells="".join(cells),
                                      foot=foot_html(company, flyer)))

    title = flyer.get("title") or "物件広告"
    return (
        '<!DOCTYPE html>\n<html lang="ja" data-theme="{theme}"><head>'
        '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        "<title>{title}</title><style>\n{css}\n</style></head><body>\n{body}\n</body></html>\n"
    ).format(theme=e(theme), title=e(title), css=css, body="\n".join(body))


def to_pdf(html_path, pdf_path):
    """ブラウザ印刷が確実だが、無人実行用に headless Chrome も試す。"""
    cands = ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"]
    env_dir = os.environ.get("PLAYWRIGHT_BROWSERS_PATH")
    if env_dir and os.path.isdir(env_dir):
        for root, _, files in os.walk(env_dir):
            for fn in files:
                if fn in ("chrome", "headless_shell", "chromium"):
                    cands.insert(0, os.path.join(root, fn))
    for c in cands:
        exe = c if os.path.isabs(c) and os.access(c, os.X_OK) else shutil.which(c)
        if not exe:
            continue
        try:
            subprocess.run([exe, "--headless", "--disable-gpu", "--no-sandbox",
                            "--no-pdf-header-footer",
                            "--print-to-pdf=" + os.path.abspath(pdf_path),
                            "file://" + os.path.abspath(html_path)],
                           check=True, capture_output=True, timeout=120)
            if os.path.isfile(pdf_path):
                return exe
        except Exception:
            continue
    return None


def main():
    ap = argparse.ArgumentParser(description="物件JSONからA4チラシHTMLを生成")
    ap.add_argument("json_path")
    ap.add_argument("-o", "--out", default="flyer.html")
    ap.add_argument("--per-page", type=int, default=None,
                    help="1ページの掲載枠数 (1,2,3,4,6,8,9,12)。省略時は件数から自動選択")
    ap.add_argument("--theme", default=None, choices=["blue", "red", "navy", "green", "warm", "mono"])
    ap.add_argument("--css", default=None, help="差し替え用CSS")
    ap.add_argument("--pdf", default=None, help="PDFも書き出す(headless Chrome が必要)")
    a = ap.parse_args()

    with open(a.json_path, encoding="utf-8") as f:
        data = json.load(f)
    base_dir = os.path.dirname(os.path.abspath(a.json_path))

    out = build(data, per_page=a.per_page, theme=a.theme, css_path=a.css, base_dir=base_dir)
    with open(a.out, "w", encoding="utf-8") as f:
        f.write(out)

    n = len(data.get("properties") or [])
    slots = a.per_page or pick_per_page(n)
    _, cols, rows, tier = LAYOUTS[slots]
    pages = -(-n // slots)
    print("生成: {}  掲載 {}件 / {}面レイアウト({}列×{}行, tier={}) / {}ページ".format(
        a.out, n, slots, cols, rows, tier, pages))
    if slots > n:
        print("  余り {} 枠 → 1枠を会社案内、残りは空き枠にしました。".format(slots - n))
    for w in length_warnings(data.get("properties") or [], tier):
        print("  注意 " + w)

    if a.pdf:
        exe = to_pdf(a.out, a.pdf)
        print("PDF: {}".format(a.pdf) if exe else
              "PDF変換に失敗。ブラウザで開き「印刷 > PDFに保存」(用紙A4/余白なし/背景グラフィックON)を使ってください。")


if __name__ == "__main__":
    main()
