#!/usr/bin/env python3
"""Set fonts and font sizes in an SOP / PHS Word document without touching its content.

    Document title (e.g. "Statement of Purpose")  -> 14 pt
    Section headings                              -> 12 pt
    Everything else                               -> 11 pt
    All text                                      -> Times New Roman

How the content is protected
----------------------------
The .docx is never opened and re-saved by a library. The script edits the raw XML
text and changes only the font (<w:rFonts>) and size (<w:sz>, <w:szCs>) settings
inside run properties (<w:rPr>). Every other byte is copied through unchanged.

Before anything is written, the result is checked against the original:
  * every file in the package other than the edited XML parts is byte-identical;
  * the edited XML parts, with font/size settings removed from both, are identical;
  * the visible text of every part is identical, character for character.
If any check fails, no output file is written.

Only the Python standard library is used, so it runs anywhere Python 3.8+ is installed.

Usage
-----
    python format_sop.py "My SOP.docx"                  # writes "My SOP_formatted.docx"
    python format_sop.py "My SOP.docx" --dry-run        # just show how each paragraph is classified
    python format_sop.py "My SOP.docx" -o final.docx
    python format_sop.py in.docx --heading "Why MIT"    # force a paragraph to be a heading
    python format_sop.py in.docx --body "Harshita Bose" # force a paragraph to be body text
"""

import argparse
import html
import os
import re
import sys
import zipfile

FONT = "Times New Roman"
TITLE_PT, HEADING_PT, BODY_PT = 14, 12, 11

TITLE_PHRASES = (
    "statement of purpose",
    "personal history statement",
    "personal history and diversity statement",
    "personal statement",
    "research statement",
    "diversity statement",
    "statement of intent",
    "statement of academic purpose",
)

# Order of children inside <w:rPr> (ECMA-376 CT_RPr / CT_ParaRPr). Used only to put
# the font and size elements where Word expects them.
BEFORE_RFONTS = {"w:ins", "w:del", "w:moveFrom", "w:moveTo", "w:rStyle"}
AFTER_SZ = {
    "w:highlight", "w:u", "w:effect", "w:bdr", "w:shd", "w:fitText", "w:vertAlign",
    "w:rtl", "w:cs", "w:em", "w:lang", "w:eastAsianLayout", "w:specVanish", "w:oMath",
    "w:rPrChange",
}
# Children of <w:pPr> that must come after its <w:rPr>.
AFTER_PPR_RPR = {"w:sectPr", "w:pPrChange"}

TAG_RE = re.compile(r"<[^>]*>")
NAME_RE = re.compile(r"<\s*(/?)\s*([A-Za-z_][\w.:-]*)")
ATTR_RE = re.compile(r'([\w:.-]+)\s*=\s*("[^"]*"|\'[^\']*\')')

FALSE_VALS = {"0", "false", "off", "none"}


# --------------------------------------------------------------------------- XML helpers

def parse_tag(tag):
    """Return (kind, name, attrs) for a tag string. kind: open | close | empty | other."""
    if tag.startswith("<?") or tag.startswith("<!"):
        return "other", None, {}
    m = NAME_RE.match(tag)
    if not m:
        return "other", None, {}
    name = m.group(2)
    if m.group(1):
        return "close", name, {}
    attrs = {k: v[1:-1] for k, v in ATTR_RE.findall(tag)}
    return ("empty" if tag.endswith("/>") else "open"), name, attrs


def split_children(inner):
    """Split the inner XML of an element into its top-level child elements (strings)."""
    children, depth, start = [], 0, None
    for m in TAG_RE.finditer(inner):
        kind, name, _ = parse_tag(m.group())
        if kind == "other":
            continue
        if depth == 0:
            start = m.start()
        if kind == "open":
            depth += 1
        elif kind == "close":
            depth -= 1
        if depth == 0 and start is not None:
            children.append(inner[start:m.end()])
            start = None
    return children


def child_name(child):
    return parse_tag(child)[1]


def font_xml(size_pt):
    out = '<w:rFonts w:ascii="{f}" w:hAnsi="{f}" w:eastAsia="{f}" w:cs="{f}"/>'.format(f=FONT)
    if size_pt is None:
        return out, ""
    hp = str(size_pt * 2)
    return out, '<w:sz w:val="%s"/><w:szCs w:val="%s"/>' % (hp, hp)


def rewrite_rpr_inner(inner, size_pt):
    """Replace font (and size, if size_pt is given) inside the inner XML of a <w:rPr>."""
    drop = {"w:rFonts"} | ({"w:sz", "w:szCs"} if size_pt is not None else set())
    kids = [c for c in split_children(inner) if child_name(c) not in drop]
    rfonts, sz = font_xml(size_pt)

    i = 0
    while i < len(kids) and child_name(kids[i]) in BEFORE_RFONTS:
        i += 1
    kids.insert(i, rfonts)

    if sz:
        j = len(kids)
        for k, c in enumerate(kids):
            if child_name(c) in AFTER_SZ:
                j = k
                break
        kids.insert(j, sz)
    return "".join(kids)


def is_on(attrs):
    return attrs.get("w:val", "true").lower() not in FALSE_VALS


# --------------------------------------------------------------------------- styles

def load_styles(styles_xml):
    """styleId -> dict(name, basedOn, bold, outline)."""
    styles = {}
    if not styles_xml:
        return styles
    for m in re.finditer(r"<w:style\b[^>]*?(?:/>|>(.*?)</w:style>)", styles_xml, re.S):
        _, _, attrs = parse_tag(re.match(r"<w:style\b[^>]*>", m.group()).group())
        sid = attrs.get("w:styleId")
        body = m.group(1) or ""
        name = re.search(r'<w:name\s+w:val="([^"]*)"', body)
        based = re.search(r'<w:basedOn\s+w:val="([^"]*)"', body)
        rpr = re.search(r"<w:rPr>(.*?)</w:rPr>", body, re.S)
        bold = None
        if rpr:
            b = re.search(r"<w:b(\s[^>]*)?/>", rpr.group(1))
            if b:
                bold = is_on(parse_tag(b.group())[2])
        styles[sid] = {
            "name": (name.group(1) if name else sid or "").lower(),
            "basedOn": based.group(1) if based else None,
            "bold": bold,
            "outline": bool(re.search(r"<w:outlineLvl\b", body)),
        }
    return styles


def style_chain(styles, sid):
    seen = []
    while sid and sid in styles and sid not in seen:
        seen.append(sid)
        sid = styles[sid]["basedOn"]
    return [styles[s] for s in seen]


def style_bold(styles, sid):
    for st in style_chain(styles, sid):
        if st["bold"] is not None:
            return st["bold"]
    return False


def style_is_heading(styles, sid):
    for st in style_chain(styles, sid):
        if st["outline"] or st["name"].startswith("heading") or st["name"] in ("title", "subtitle"):
            return True
    return False


# --------------------------------------------------------------------------- scanning

class Para:
    def __init__(self, start, open_tag_end, self_closing):
        self.start = start
        self.open_tag_end = open_tag_end
        self.self_closing = self_closing
        self.text_parts = []
        self.pstyle = None
        self.outline = False
        self.has_ppr = False
        self.ppr_rpr = None          # (start, end, inner_start, inner_end) or ("empty", start, end)
        self.ppr_open_end = None
        self.ppr_insert_at = None    # where a new <w:rPr> would go inside <w:pPr>
        self.ppr_self_closing = None  # (start, end) of <w:pPr/>
        self.runs = []               # Run objects
        self.size = None

    @property
    def text(self):
        return "".join(self.text_parts)


class Run:
    def __init__(self, open_tag_end):
        self.open_tag_end = open_tag_end
        self.rpr = None              # (start, end, inner_start, inner_end) or ("empty", start, end)
        self.has_text = False
        self.bold = None             # direct bold setting, None if not set
        self.rstyle = None


def scan(xml):
    """Walk the XML and collect paragraphs, runs and their run-property spans."""
    paras, para_stack, run_stack = [], [], []
    stack = []                       # (name, start_of_open_tag, end_of_open_tag)
    in_text = None                   # start index of <w:t> content
    for m in TAG_RE.finditer(xml):
        tag = m.group()
        kind, name, attrs = parse_tag(tag)
        if kind == "other":
            continue
        parent = stack[-1][0] if stack else None

        if kind in ("open", "empty"):
            if name == "w:p":
                p = Para(m.start(), m.end(), kind == "empty")
                paras.append(p)
                if kind == "open":
                    para_stack.append(p)
            elif name == "w:pPr" and parent == "w:p" and para_stack:
                p = para_stack[-1]
                p.has_ppr = True
                if kind == "empty":
                    p.ppr_self_closing = (m.start(), m.end())
                else:
                    p.ppr_open_end = m.end()
            elif name == "w:pStyle" and parent == "w:pPr" and para_stack:
                para_stack[-1].pstyle = attrs.get("w:val")
            elif name == "w:outlineLvl" and parent == "w:pPr" and para_stack:
                para_stack[-1].outline = True
            elif name == "w:r" and kind == "open":
                r = Run(m.end())
                run_stack.append(r)
                if para_stack:
                    para_stack[-1].runs.append(r)
            elif name == "w:rPr":
                target = None
                if parent == "w:r" and run_stack:
                    target = run_stack[-1]
                elif parent == "w:pPr" and para_stack:
                    target = para_stack[-1]
                if target is not None:
                    span = ("empty", m.start(), m.end()) if kind == "empty" else [m.start(), None, m.end(), None]
                    if isinstance(target, Run):
                        target.rpr = span
                    else:
                        target.ppr_rpr = span
            elif name == "w:b" and parent == "w:rPr" and len(stack) >= 2 and stack[-2][0] == "w:r" and run_stack:
                run_stack[-1].bold = is_on(attrs)
            elif name == "w:rStyle" and parent == "w:rPr" and len(stack) >= 2 and stack[-2][0] == "w:r" and run_stack:
                run_stack[-1].rstyle = attrs.get("w:val")
            elif name in AFTER_PPR_RPR and parent == "w:pPr" and para_stack:
                p = para_stack[-1]
                if p.ppr_insert_at is None:
                    p.ppr_insert_at = m.start()
            elif name == "w:t" and kind == "open":
                in_text = m.end()
            elif name == "w:tab" and parent == "w:r" and para_stack:
                para_stack[-1].text_parts.append("\t")
            elif name in ("w:br", "w:cr") and parent == "w:r" and para_stack:
                para_stack[-1].text_parts.append("\n")

            if kind == "open":
                stack.append((name, m.start(), m.end()))

        else:  # close
            if name == "w:t" and in_text is not None:
                if para_stack:
                    para_stack[-1].text_parts.append(html.unescape(xml[in_text:m.start()]))
                if run_stack:
                    run_stack[-1].has_text = True
                in_text = None
            elif name == "w:rPr" and len(stack) >= 2:
                owner = stack[-2][0]
                if owner == "w:r" and run_stack and isinstance(run_stack[-1].rpr, list) and run_stack[-1].rpr[1] is None:
                    run_stack[-1].rpr[1] = m.end()
                    run_stack[-1].rpr[3] = m.start()
                elif owner == "w:pPr" and para_stack and isinstance(para_stack[-1].ppr_rpr, list) and para_stack[-1].ppr_rpr[1] is None:
                    para_stack[-1].ppr_rpr[1] = m.end()
                    para_stack[-1].ppr_rpr[3] = m.start()
            elif name == "w:pPr" and para_stack and len(stack) >= 2 and stack[-2][0] == "w:p":
                p = para_stack[-1]
                if p.ppr_insert_at is None:
                    p.ppr_insert_at = m.start()
            elif name == "w:r" and run_stack:
                run_stack.pop()
            elif name == "w:p" and para_stack:
                para_stack.pop()
            if stack and stack[-1][0] == name:
                stack.pop()
    return paras


# --------------------------------------------------------------------------- classification

def norm(text):
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", text.lower())).strip()


def classify(paras, styles, title_texts, heading_texts, body_texts):
    """Set p.size and p.reason for each paragraph."""
    title_set = {norm(t) for t in title_texts}
    head_set = {norm(t) for t in heading_texts}
    body_set = {norm(t) for t in body_texts}
    title_found = False

    for p in paras:
        text = p.text.strip()
        n = norm(text)
        words = len(text.split())
        p.size, p.reason = BODY_PT, "body"
        if not text:
            p.reason = "empty"
            continue
        if n in body_set:
            p.reason = "body (forced)"
            continue
        if n in title_set or (not title_set and not title_found and words <= 10
                              and any(ph in n for ph in TITLE_PHRASES)):
            p.size, p.reason = TITLE_PT, "title"
            title_found = True
            continue
        if n in head_set:
            p.size, p.reason = HEADING_PT, "heading (forced)"
            continue

        text_runs = [r for r in p.runs if r.has_text]
        para_bold = style_bold(styles, p.pstyle)

        def run_bold(r):
            if r.bold is not None:
                return r.bold
            if r.rstyle and (style_bold(styles, r.rstyle) or "strong" in (styles.get(r.rstyle, {}).get("name") or "")):
                return True
            return para_bold

        all_bold = bool(text_runs) and all(run_bold(r) for r in text_runs if r.has_text)
        heading_style = style_is_heading(styles, p.pstyle) or p.outline
        shape_ok = words <= 15 and len(text) <= 120 and not re.search(r"[.;,]$", text)

        if heading_style and words <= 25:
            p.size, p.reason = HEADING_PT, "heading (Word heading style)"
        elif all_bold and shape_ok:
            p.size, p.reason = HEADING_PT, "heading (short, all bold)"
    return title_found


# --------------------------------------------------------------------------- editing

def apply_edits(xml, paras, set_sizes):
    """Return new XML with fonts (and sizes) set on every run and paragraph mark."""
    edits = []  # (start, end, replacement)

    def rpr_edit(span, size, insert_at, wrap=None):
        if span is None:
            new = "<w:rPr>%s</w:rPr>" % rewrite_rpr_inner("", size)
            if wrap:
                new = wrap % new
            edits.append((insert_at, insert_at, new))
        elif span[0] == "empty":
            edits.append((span[1], span[2], "<w:rPr>%s</w:rPr>" % rewrite_rpr_inner("", size)))
        else:
            start, end, istart, iend = span
            if end is None:
                raise ValueError("unterminated <w:rPr> at offset %d" % start)
            edits.append((istart, iend, rewrite_rpr_inner(xml[istart:iend], size)))

    for p in paras:
        size = p.size if set_sizes else None
        for r in p.runs:
            rpr_edit(r.rpr, size, r.open_tag_end)
        # paragraph mark (controls empty lines and the line height of the paragraph end)
        if p.self_closing:
            tag = xml[p.start:p.open_tag_end]
            open_tag = tag[:-2].rstrip() + ">"
            inner = "<w:pPr><w:rPr>%s</w:rPr></w:pPr>" % rewrite_rpr_inner("", size)
            edits.append((p.start, p.open_tag_end, open_tag + inner + "</w:p>"))
        elif p.ppr_self_closing:
            s, e = p.ppr_self_closing
            edits.append((s, e, "<w:pPr><w:rPr>%s</w:rPr></w:pPr>" % rewrite_rpr_inner("", size)))
        elif p.has_ppr:
            rpr_edit(p.ppr_rpr, size, p.ppr_insert_at)
        else:
            rpr_edit(None, size, p.open_tag_end, wrap="<w:pPr>%s</w:pPr>")

    # Runs that are not inside a paragraph cannot exist in valid WordprocessingML; ignore.
    edits.sort(key=lambda e: (e[0], e[1]))
    out, pos = [], 0
    for s, e, rep in edits:
        if s < pos:
            raise ValueError("overlapping edits at offset %d" % s)
        out.append(xml[pos:s])
        out.append(rep)
        pos = e
    out.append(xml[pos:])
    return "".join(out)


# --------------------------------------------------------------------------- verification

def strip_formatting(xml):
    """Remove everything this script is allowed to change, so the rest can be compared."""
    x = re.sub(r"<w:rFonts\b[^>]*/>", "", xml)
    x = re.sub(r"<w:szCs\b[^>]*/>", "", x)
    x = re.sub(r"<w:sz\b[^>]*/>", "", x)
    x = re.sub(r"<w:p(\s[^>]*)?/>", lambda m: "<w:p%s></w:p>" % (m.group(1) or "").rstrip(), x)
    prev = None
    while prev != x:
        prev = x
        x = re.sub(r"<w:rPr\s*/>|<w:rPr></w:rPr>", "", x)
        x = re.sub(r"<w:pPr\s*/>|<w:pPr></w:pPr>", "", x)
    return x


def visible_text(xml):
    parts = []
    for m in re.finditer(r"<w:t(?:\s[^>]*)?>(.*?)</w:t>|<w:tab\s*/>|<w:br\b[^>]*/>|<w:p(?=[\s/>])", xml, re.S):
        tok = m.group()
        if tok.startswith("<w:t") and not tok.startswith("<w:tab"):
            parts.append(html.unescape(m.group(1)))
        elif tok.startswith("<w:tab"):
            parts.append("\t")
        elif tok.startswith("<w:br"):
            parts.append("\n")
        else:
            parts.append("\n")
    return "".join(parts)


def verify(original, edited, changed):
    """Raise if anything other than font/size settings differs."""
    if [i.filename for i in original] != [i.filename for i in edited]:
        raise AssertionError("the list of files inside the document changed")
    for info in original:
        name = info.filename
        a, b = original[name], edited[name]
        if name not in changed:
            if a != b:
                raise AssertionError("%s changed but should not have" % name)
            continue
        xa, xb = a.decode("utf-8"), b.decode("utf-8")
        if visible_text(xa) != visible_text(xb):
            raise AssertionError("visible text of %s changed" % name)
        if strip_formatting(xa) != strip_formatting(xb):
            raise AssertionError("%s changed beyond font and size settings" % name)


# --------------------------------------------------------------------------- main

class Parts(dict):
    """Ordered name -> bytes, plus the original ZipInfo list (iterating yields ZipInfo)."""
    def __init__(self, infos, data):
        super().__init__(data)
        self.infos = infos

    def __iter__(self):
        return iter(self.infos)

    def __getitem__(self, key):
        if isinstance(key, zipfile.ZipInfo):
            key = key.filename
        return dict.__getitem__(self, key)


def process(src, dst, args):
    with zipfile.ZipFile(src) as z:
        infos = z.infolist()
        data = {i.filename: z.read(i.filename) for i in infos}
    original = Parts(infos, data)

    if "word/document.xml" not in data:
        raise SystemExit("error: %s does not look like a Word .docx file" % src)

    styles = load_styles(data.get("word/styles.xml", b"").decode("utf-8"))
    new = dict(data)
    changed = set()
    report = []

    # Main body: classify and set font + size.
    doc_xml = data["word/document.xml"].decode("utf-8")
    paras = scan(doc_xml)
    title_found = classify(paras, styles, args.title or [], args.heading or [], args.body or [])
    report = [(p.size, p.reason, p.text.strip()) for p in paras]
    new["word/document.xml"] = apply_edits(doc_xml, paras, True).encode("utf-8")
    changed.add("word/document.xml")

    # Footnotes / endnotes: font + body size. Headers / footers: font only.
    for name in data:
        if re.fullmatch(r"word/(footnotes|endnotes)\.xml", name):
            sizes = True
        elif re.fullmatch(r"word/(header|footer)\d*\.xml", name):
            sizes = False
        else:
            continue
        xml = data[name].decode("utf-8")
        ps = scan(xml)
        for p in ps:
            p.size = BODY_PT
        new[name] = apply_edits(xml, ps, sizes).encode("utf-8")
        changed.add(name)

    edited = Parts(infos, new)
    verify(original, edited, changed)

    print_report(report, title_found)
    if args.dry_run:
        print("\nDry run: nothing written.")
        return

    tmp = dst + ".tmp"
    with zipfile.ZipFile(tmp, "w") as out:
        for info in infos:
            out.writestr(info, new[info.filename], compress_type=info.compress_type)
    # Re-read what was written and verify once more from disk.
    with zipfile.ZipFile(tmp) as z:
        written = Parts(z.infolist(), {i.filename: z.read(i.filename) for i in z.infolist()})
    verify(original, written, changed)
    os.replace(tmp, dst)
    print("\nContent check passed: text and layout identical, only fonts and sizes changed.")
    print("Wrote %s" % dst)


def print_report(report, title_found):
    print("Size  Kind                          Paragraph")
    print("----  ----------------------------  " + "-" * 50)
    for size, reason, text in report:
        if reason == "empty":
            continue
        shown = text if len(text) <= 70 else text[:67] + "..."
        print("%3d   %-28s  %s" % (size, reason, shown))
    if not title_found:
        print("\nWARNING: no title line (e.g. 'Statement of Purpose') was recognised. "
              "Use --title \"exact title text\" to mark it.")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("input", help="the .docx file")
    ap.add_argument("-o", "--output", help="output file (default: <input>_formatted.docx)")
    ap.add_argument("--dry-run", action="store_true", help="only show the classification")
    ap.add_argument("--title", action="append", metavar="TEXT", help="text of the title paragraph")
    ap.add_argument("--heading", action="append", metavar="TEXT", help="force this paragraph to be a heading (repeatable)")
    ap.add_argument("--body", action="append", metavar="TEXT", help="force this paragraph to be body text (repeatable)")
    args = ap.parse_args(argv)

    src = args.input
    if not src.lower().endswith(".docx"):
        raise SystemExit("error: please give a .docx file (save .doc files as .docx in Word first)")
    dst = args.output or os.path.splitext(src)[0] + "_formatted.docx"
    if os.path.abspath(dst) == os.path.abspath(src):
        raise SystemExit("error: output must be a different file from the input")
    try:
        process(src, dst, args)
    except AssertionError as e:
        raise SystemExit("ABORTED, nothing written: content check failed (%s)" % e)


if __name__ == "__main__":
    main()
