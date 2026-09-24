#!/usr/bin/env python3
"""Stdlib-only structural checker for a single-file HTML page.

Usage: python3 html_lint.py [index.html]
Exit code 1 when any ERROR is found (WARN does not fail).
"""
import re
import sys
from html.parser import HTMLParser

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link",
        "meta", "source", "track", "wbr"}
# Elements whose end tag may be omitted; we don't flag them as unbalanced.
OPTIONAL_END = {"p", "li", "dt", "dd", "option", "optgroup", "tr", "td", "th",
                "thead", "tbody", "tfoot", "colgroup", "rb", "rt", "rp",
                "html", "head", "body"}
INTERACTIVE = {"a", "button", "input", "select", "textarea", "label", "details", "iframe"}
LABELABLE = {"input", "select", "textarea", "button", "meter", "output", "progress"}


class Checker(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []  # (tag, line)
        self.ids = {}
        self.label_fors = []
        self.aria_refs = []
        self.findings = []
        self.has_doctype = False
        self.seen = set()
        self.meta = {}
        self.html_lang = None
        self.title_text = ""
        self.in_title = False
        self.scripts = []
        self.in_script = False
        self.labelable_ids = set()

    def add(self, level, msg, line=None):
        line = line or self.getpos()[0]
        self.findings.append((level, line, msg))

    def handle_decl(self, decl):
        if decl.lower().startswith("doctype html"):
            self.has_doctype = True

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        line = self.getpos()[0]
        self.seen.add(tag)
        open_tags = [t for t, _ in self.stack]

        if tag == "html":
            self.html_lang = a.get("lang")
        if tag == "meta":
            if "charset" in a or (a.get("http-equiv", "").lower() == "content-type"):
                self.meta["charset"] = True
            if a.get("name"):
                self.meta[a["name"].lower()] = a.get("content", "")
        if tag == "title":
            self.in_title = True
        if tag == "script":
            self.in_script = True
            if a.get("src"):
                self.add("WARN", f"external script src={a['src']!r}", line)

        el_id = a.get("id")
        if el_id is not None:
            if el_id in self.ids:
                self.add("ERROR", f"duplicate id {el_id!r} (first on line {self.ids[el_id]})", line)
            else:
                self.ids[el_id] = line
            if tag in LABELABLE:
                self.labelable_ids.add(el_id)

        if tag == "label" and a.get("for"):
            self.label_fors.append((a["for"], line))
        for key in ("aria-labelledby", "aria-describedby", "aria-controls"):
            if a.get(key):
                for ref in a[key].split():
                    self.aria_refs.append((key, ref, line))

        if tag == "button" and "type" not in a:
            self.add("WARN", "<button> without type (defaults to submit)", line)
        if tag == "img" and "alt" not in a:
            self.add("ERROR", "<img> without alt", line)
        if tag in ("link", "img", "iframe", "source", "audio", "video"):
            for key in ("href", "src"):
                if re.match(r"^(https?:)?//", a.get(key) or ""):
                    self.add("WARN", f"external resource <{tag} {key}={a[key]!r}>", line)

        if tag in INTERACTIVE and tag != "label":
            for parent in ("button", "a"):
                if parent in open_tags:
                    self.add("ERROR", f"interactive <{tag}> nested inside <{parent}>", line)
        if tag == "li" and open_tags and open_tags[-1] not in ("ul", "ol", "menu"):
            self.add("ERROR", f"<li> whose parent is <{open_tags[-1]}>, not a list", line)
        if tag in ("div", "p", "section", "ul", "ol", "table", "h1", "h2", "h3") and "p" in open_tags[-1:]:
            # <p> is implicitly closed by block content; pop it to mimic the HTML parser.
            self.stack.pop()

        if tag not in VOID:
            # Implicit closes for optional-end siblings (li/li, option/option, td/td ...).
            if self.stack and self.stack[-1][0] == tag and tag in OPTIONAL_END:
                self.stack.pop()
            self.stack.append((tag, line))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID and self.stack and self.stack[-1][0] == tag:
            self.stack.pop()

    def handle_endtag(self, tag):
        line = self.getpos()[0]
        if tag == "title":
            self.in_title = False
        if tag == "script":
            self.in_script = False
        if tag in VOID:
            return
        names = [t for t, _ in self.stack]
        if tag not in names:
            self.add("ERROR", f"stray </{tag}> with no open <{tag}>", line)
            return
        while self.stack:
            t, l = self.stack.pop()
            if t == tag:
                break
            if t not in OPTIONAL_END:
                self.add("ERROR", f"<{t}> opened on line {l} is not closed before </{tag}>", line)

    def handle_data(self, data):
        if self.in_title:
            self.title_text += data
        if self.in_script:
            self.scripts.append(data)

    def finish(self):
        for t, l in self.stack:
            if t not in OPTIONAL_END:
                self.add("ERROR", f"<{t}> opened on line {l} is never closed", l)
        if not self.has_doctype:
            self.add("ERROR", "missing <!DOCTYPE html>", 1)
        if not self.html_lang:
            self.add("ERROR", "<html> has no lang attribute", 1)
        if not self.meta.get("charset"):
            self.add("ERROR", "missing <meta charset>", 1)
        if "viewport" not in self.meta:
            self.add("ERROR", "missing viewport meta", 1)
        if not self.title_text.strip():
            self.add("ERROR", "missing or empty <title>", 1)
        if "description" not in self.meta:
            self.add("WARN", "missing <meta name=description>", 1)
        for ref, line in self.label_fors:
            if ref not in self.ids:
                self.add("ERROR", f"<label for={ref!r}> points at no element", line)
            elif ref not in self.labelable_ids:
                self.add("ERROR", f"<label for={ref!r}> points at a non-form control", line)
        for key, ref, line in self.aria_refs:
            if ref not in self.ids:
                self.add("ERROR", f"{key}={ref!r} points at no element", line)
        # ids that JS looks up but markup never defines (may be created dynamically → WARN)
        js = "\n".join(self.scripts)
        created = set(re.findall(r"""\.id\s*=\s*['"]([\w-]+)['"]""", js))
        created |= set(re.findall(r"""id=\\?['"]([\w-]+)\\?['"]""", js))
        for ref in sorted(set(re.findall(r"""getElementById\(\s*['"]([\w-]+)['"]\s*\)""", js))):
            if ref not in self.ids and ref not in created:
                self.add("WARN", f"JS getElementById({ref!r}) but no element has that id")


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "index.html"
    with open(path, encoding="utf-8") as f:
        src = f.read()
    c = Checker()
    c.feed(src)
    c.close()
    c.finish()
    c.findings.sort(key=lambda f: (f[0] != "ERROR", f[1]))
    for level, line, msg in c.findings:
        print(f"{level:5} {path}:{line}  {msg}")
    errors = sum(1 for f in c.findings if f[0] == "ERROR")
    warns = len(c.findings) - errors
    print(f"\n{errors} error(s), {warns} warning(s)")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
