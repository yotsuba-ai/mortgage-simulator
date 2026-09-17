#!/usr/bin/env python3
"""columns/*.md から Kindle で読める EPUB3 を生成する。

使い方:  python3 columns/build_epub.py [出力先.epub]
必要なもの:  pip install markdown
"""
import html
import os
import re
import sys
import zipfile
from datetime import datetime, timezone

import markdown

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    HERE, "賃貸不動産経営管理士_毎日コラム.epub")

BOOK_TITLE = "賃貸不動産経営管理士 毎日コラム 全59回"
BOOK_AUTHOR = "Claude Code"
BOOK_ID = "urn:uuid:8f2a6c14-5b3d-4e77-9a10-chintai59columns"
LANG = "ja"

# 横長のASCII図はスマホで崩れるため、縦方向に読める形へ置き換える
DIAGRAM_REPLACEMENTS = {
    "オーナー（賃貸人） ───": (
        "オーナー（賃貸人）\n"
        "　↓ 特定賃貸借契約（マスターリース）\n"
        "サブリース業者（特定転貸事業者）\n"
        "　↓ 転貸借契約（サブリース）\n"
        "入居者（転借人）"
    ),
    "借主 ──保証委託契約": (
        "借主 → 保証会社：保証委託契約（保証料の支払い）\n"
        "保証会社 → 貸主：保証契約（滞納時に代位弁済）\n"
        "保証会社 → 借主：求償（立替分の請求）"
    ),
}

CSS = """@charset "UTF-8";
html, body { margin: 0; padding: 0; }
body {
  line-height: 1.75;
  padding: 0 0.4em;
  word-wrap: break-word;
  -epub-hyphens: none;
}
h1 {
  font-size: 1.25em;
  line-height: 1.5;
  margin: 1.2em 0 0.9em;
  padding-bottom: 0.35em;
  border-bottom: 3px solid #555;
  page-break-before: always;
}
h2 {
  font-size: 1.1em;
  margin: 1.8em 0 0.6em;
  padding: 0.25em 0 0.25em 0.5em;
  border-left: 5px solid #777;
  background: #f0f0f0;
  page-break-after: avoid;
}
h3 {
  font-size: 1.02em;
  margin: 1.4em 0 0.5em;
  padding-bottom: 0.2em;
  border-bottom: 1px dotted #999;
  page-break-after: avoid;
}
p { margin: 0.7em 0; text-indent: 0; }
ul, ol { margin: 0.7em 0; padding-left: 1.4em; }
li { margin: 0.35em 0; }
strong { font-weight: bold; }
table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
  font-size: 0.78em;
  line-height: 1.55;
  page-break-inside: avoid;
}
th, td {
  border: 1px solid #999;
  padding: 0.35em 0.4em;
  text-align: left;
  vertical-align: top;
  word-break: break-all;
}
th { background: #ececec; font-weight: bold; }
div.diagram {
  margin: 1em 0;
  padding: 0.7em 0.6em;
  background: #f4f4f4;
  border: 1px solid #bbb;
  font-size: 0.85em;
  line-height: 1.8;
  white-space: pre-wrap;
}
code {
  font-size: 0.9em;
  background: #f0f0f0;
  padding: 0 0.2em;
}
hr { border: 0; border-top: 1px solid #bbb; margin: 1.5em 0; }

/* 表紙 */
body.cover { text-align: center; }
.cover-wrap { margin-top: 22%; padding: 0 1.2em; }
.cover-title { font-size: 1.8em; font-weight: bold; line-height: 1.5; margin-bottom: 0.4em; }
.cover-sub { font-size: 1.05em; margin-bottom: 2.4em; color: #444; }
.cover-rule { border-top: 4px solid #555; width: 55%; margin: 0 auto 2.4em; }
.cover-meta { font-size: 0.92em; line-height: 2; color: #333; }

/* 目次 */
nav ol { list-style: none; padding-left: 0; }
nav li { margin: 0.5em 0; line-height: 1.6; }
"""

PAGE = """<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" \
xml:lang="{lang}" lang="{lang}">
<head>
<meta charset="utf-8"/>
<title>{title}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body{bodyattr}>
{body}
</body>
</html>
"""

VOID = re.compile(r"<(br|hr|img|meta|link)([^>]*?)/?>")


def to_xhtml(fragment: str) -> str:
    """markdown が返す HTML を XHTML として妥当な形に整える。"""
    def fix(m):
        tag, attrs = m.group(1), m.group(2).rstrip("/").rstrip()
        return "<%s%s/>" % (tag, (" " + attrs) if attrs else "")
    return VOID.sub(fix, fragment)


def convert(md_text: str) -> tuple:
    """Markdown 本文を (章タイトル, XHTML本文) に変換する。"""
    for needle, replacement in DIAGRAM_REPLACEMENTS.items():
        if needle in md_text:
            md_text = re.sub(
                r"```\n[^`]*?" + re.escape(needle.split("─")[0].strip()) + r"[^`]*?```",
                "```\n" + replacement + "\n```",
                md_text,
                count=1,
                flags=re.S,
            )

    title_match = re.search(r"^# (.+)$", md_text, flags=re.M)
    title = title_match.group(1).strip() if title_match else "無題"

    body = markdown.markdown(
        md_text,
        extensions=["tables", "fenced_code", "sane_lists"],
        output_format="xhtml",
    )
    # コードブロックは図として扱う（Kindle では pre が横にはみ出すため）
    body = re.sub(
        r'<pre><code>(.*?)</code></pre>',
        lambda m: '<div class="diagram">%s</div>' % m.group(1).rstrip("\n"),
        body,
        flags=re.S,
    )
    return title, to_xhtml(body)


def main():
    files = sorted(
        f for f in os.listdir(HERE)
        if f.startswith("day") and f.endswith(".md")
    )
    readme = os.path.join(HERE, "README.md")
    chapters = []  # (ファイル名, 章タイトル, XHTML)

    if os.path.exists(readme):
        with open(readme, encoding="utf-8") as fh:
            title, body = convert(fh.read())
        chapters.append(("plan.xhtml", title, body))

    for i, name in enumerate(files, start=1):
        with open(os.path.join(HERE, name), encoding="utf-8") as fh:
            title, body = convert(fh.read())
        chapters.append(("day%02d.xhtml" % i, title, body))

    if not chapters:
        raise SystemExit("コラムのMarkdownが見つかりません")

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    cover_body = (
        '<div class="cover-wrap">\n'
        '<p class="cover-title">賃貸不動産経営管理士<br/>毎日コラム</p>\n'
        '<p class="cover-sub">全59回・試験直前まで1日1テーマ</p>\n'
        '<div class="cover-rule"></div>\n'
        '<p class="cover-meta">'
        '賃貸住宅管理業法／賃貸借／維持保全<br/>'
        '金銭管理・税務・保険／実務・関連法令<br/>'
        '確認問題 275問収録</p>\n'
        '</div>'
    )

    nav_items = "\n".join(
        '<li><a href="%s">%s</a></li>' % (fn, html.escape(t))
        for fn, t, _ in chapters
    )
    nav_body = (
        '<h1 id="toc-head">目次</h1>\n'
        '<nav epub:type="toc" id="toc">\n<ol>\n%s\n</ol>\n</nav>' % nav_items
    )

    manifest = [
        '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
        '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
        '<item id="css" href="style.css" media-type="text/css"/>',
        '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>',
    ]
    spine = ['<itemref idref="cover"/>', '<itemref idref="nav"/>']
    navpoints = []
    for idx, (fn, title, _) in enumerate(chapters, start=1):
        cid = "c%03d" % idx
        manifest.append(
            '<item id="%s" href="%s" media-type="application/xhtml+xml"/>' % (cid, fn))
        spine.append('<itemref idref="%s"/>' % cid)
        navpoints.append(
            '<navPoint id="np%03d" playOrder="%d"><navLabel><text>%s</text></navLabel>'
            '<content src="%s"/></navPoint>' % (idx, idx, html.escape(title), fn))

    opf = """<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" \
xml:lang="{lang}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">{bid}</dc:identifier>
<dc:title>{title}</dc:title>
<dc:creator>{author}</dc:creator>
<dc:language>{lang}</dc:language>
<dc:date>{now}</dc:date>
<dc:description>賃貸不動産経営管理士試験に向けて、1日1テーマを読み切る形式でまとめた\
全59回の学習コラム。各回に要点・ひっかけポイント・確認問題を収録。</dc:description>
<meta property="dcterms:modified">{now}</meta>
</metadata>
<manifest>
{manifest}
</manifest>
<spine toc="ncx" page-progression-direction="ltr">
{spine}
</spine>
</package>
""".format(lang=LANG, bid=BOOK_ID, title=html.escape(BOOK_TITLE),
           author=html.escape(BOOK_AUTHOR), now=now,
           manifest="\n".join(manifest), spine="\n".join(spine))

    ncx = """<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="{lang}">
<head>
<meta name="dtb:uid" content="{bid}"/>
<meta name="dtb:depth" content="1"/>
<meta name="dtb:totalPageCount" content="0"/>
<meta name="dtb:maxPageNumber" content="0"/>
</head>
<docTitle><text>{title}</text></docTitle>
<navMap>
{nav}
</navMap>
</ncx>
""".format(lang=LANG, bid=BOOK_ID, title=html.escape(BOOK_TITLE),
           nav="\n".join(navpoints))

    container = """<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles>
<rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/>
</rootfiles>
</container>
"""

    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        # mimetype は最初かつ無圧縮でなければならない
        z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip",
                   compress_type=zipfile.ZIP_STORED)
        z.writestr("META-INF/container.xml", container)
        z.writestr("OEBPS/package.opf", opf)
        z.writestr("OEBPS/toc.ncx", ncx)
        z.writestr("OEBPS/style.css", CSS)
        z.writestr("OEBPS/cover.xhtml", PAGE.format(
            lang=LANG, title="表紙", bodyattr=' class="cover"', body=cover_body))
        z.writestr("OEBPS/nav.xhtml", PAGE.format(
            lang=LANG, title="目次", bodyattr="", body=nav_body))
        for fn, title, body in chapters:
            z.writestr("OEBPS/" + fn, PAGE.format(
                lang=LANG, title=html.escape(title), bodyattr="", body=body))

    size = os.path.getsize(OUT)
    print("作成: %s" % OUT)
    print("章数: %d（表紙・目次を除く）" % len(chapters))
    print("サイズ: %.1f KB" % (size / 1024))


if __name__ == "__main__":
    main()
