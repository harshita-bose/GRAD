#!/usr/bin/env python3
"""Final formatting pass for an SOP / Personal History Statement (.docx).

What it changes, and nothing else:
  * Font of every piece of text -> Times New Roman.
  * Font size: main title ("Statement of Purpose", "Personal History Statement")
    14 pt, section headings 12 pt, everything else 11 pt.
  * One extra space after a full stop that ends a sentence, so sentences are
    separated by two spaces.

Words, punctuation, bold/italic, paragraphs, line breaks, tables, images and
layout are left untouched. Before saving, the tool compares the original and
the new file and refuses to write anything if the text differs in any way
other than those extra spaces, or if any paragraph or run was added, removed or
moved.

Usage:
  python3 tools/sop_format.py SOP.docx                 # writes SOP_formatted.docx
  python3 tools/sop_format.py SOP.docx -o final.docx
  python3 tools/sop_format.py SOP.docx --dry-run       # only show what it would do
  python3 tools/sop_format.py SOP.docx --heading "Research Experience"
  python3 tools/sop_format.py SOP.docx --not-heading "Harshita Bose"

The original file is never modified.
"""

import argparse
import difflib
import re
import sys
import zipfile
from pathlib import Path

from lxml import etree

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
XML_NS = "http://www.w3.org/XML/1998/namespace"
W = "{%s}" % W_NS
NS = {"w": W_NS, "a": A_NS}

FONT = "Times New Roman"
TITLE_PT, HEADING_PT, BODY_PT = 14, 12, 11

TITLE_PHRASES = ("statement of purpose", "personal history statement")

# Words that end in a full stop but do not end a sentence.
ABBREVIATIONS = {
    "dr", "mr", "mrs", "ms", "prof", "sr", "jr", "st", "mt", "vs", "etc",
    "e.g", "i.e", "eg", "ie", "cf", "al", "fig", "figs", "eq", "eqs", "no",
    "nos", "vol", "vols", "pp", "p", "ch", "sec", "dept", "univ", "inst",
    "approx", "ca", "inc", "ltd", "co", "corp", "jan", "feb", "mar", "apr",
    "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec", "ph.d", "phd",
    "b.tech", "m.tech", "b.sc", "m.sc", "b.e", "m.e", "b.a", "m.a", "m.s",
    "b.s", "u.s", "u.k", "u.s.a", "a.m", "p.m", "ref", "refs", "resp",
}

# Schema order of children inside <w:rPr>. Word can reject a file whose
# children are out of order, so new elements are inserted in the right place.
RPR_ORDER = [
    "ins", "del", "moveFrom", "moveTo", "rStyle", "rFonts", "b", "bCs", "i",
    "iCs", "caps", "smallCaps", "strike", "dstrike", "outline", "shadow",
    "emboss", "imprint", "noProof", "snapToGrid", "vanish", "webHidden",
    "color", "spacing", "w", "kern", "position", "sz", "szCs", "highlight",
    "u", "effect", "bdr", "shd", "fitText", "vertAlign", "rtl", "cs", "em",
    "lang", "eastAsianLayout", "specVanish", "oMath", "rPrChange",
]
PPR_ORDER = [
    "pStyle", "keepNext", "keepLines", "pageBreakBefore", "framePr",
    "widowControl", "numPr", "suppressLineNumbers", "pBdr", "shd", "tabs",
    "suppressAutoHyphens", "kinsoku", "wordWrap", "overflowPunct",
    "topLinePunct", "autoSpaceDE", "autoSpaceDN", "bidi", "adjustRightInd",
    "snapToGrid", "spacing", "ind", "contextualSpacing", "mirrorIndents",
    "suppressOverlap", "jc", "textDirection", "textAlignment",
    "textboxTightWrap", "outlineLvl", "divId", "cnfStyle", "rPr", "sectPr",
    "pPrChange",
]

# Parts whose text gets fonts/sizes (and sentence spacing).
TEXT_PART_RE = re.compile(
    r"^word/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$")
SYMBOL_FONTS = {"symbol", "wingdings", "wingdings 2", "wingdings 3", "webdings"}


class FormatError(Exception):
    pass


# --------------------------------------------------------------------------
# small XML helpers

def local(el):
    return etree.QName(el).localname


def insert_ordered(parent, child, order):
    """Insert child into parent respecting the schema order list."""
    name = local(child)
    idx = order.index(name)
    for i, existing in enumerate(parent):
        if not isinstance(existing.tag, str):
            continue
        try:
            if order.index(local(existing)) > idx:
                parent.insert(i, child)
                return child
        except ValueError:
            continue
    parent.append(child)
    return child


def get_or_add(parent, name, order):
    el = parent.find(W + name)
    if el is None:
        el = insert_ordered(parent, etree.Element(W + name), order)
    return el


def set_fonts(rpr):
    rfonts = get_or_add(rpr, "rFonts", RPR_ORDER)
    for attr in ("asciiTheme", "hAnsiTheme", "cstheme", "eastAsiaTheme"):
        rfonts.attrib.pop(W + attr, None)
    for attr in ("ascii", "hAnsi", "cs", "eastAsia"):
        rfonts.set(W + attr, FONT)


def set_size(rpr, pt):
    half = str(pt * 2)
    get_or_add(rpr, "sz", RPR_ORDER).set(W + "val", half)
    get_or_add(rpr, "szCs", RPR_ORDER).set(W + "val", half)


def run_rpr(run):
    rpr = run.find(W + "rPr")
    if rpr is None:
        rpr = etree.Element(W + "rPr")
        run.insert(0, rpr)
    return rpr


def para_mark_rpr(p):
    ppr = p.find(W + "pPr")
    if ppr is None:
        ppr = etree.Element(W + "pPr")
        p.insert(0, ppr)
    rpr = ppr.find(W + "rPr")
    if rpr is None:
        rpr = insert_ordered(ppr, etree.Element(W + "rPr"), PPR_ORDER)
    return rpr


def own_runs(p):
    """Runs that belong to paragraph p (not to a text box nested inside it)."""
    return [r for r in p.iter(W + "r")
            if next(r.iterancestors(W + "p"), None) is p]


def own_text_nodes(p):
    """(element, kind) in reading order: kind is 't', 'tab' or 'br'."""
    out = []
    for r in own_runs(p):
        for el in r:
            name = local(el) if isinstance(el.tag, str) else None
            if name == "t":
                out.append((el, "t"))
            elif name in ("tab", "ptab"):
                out.append((el, "tab"))
            elif name in ("br", "cr"):
                out.append((el, "br"))
    return out


def para_text(p):
    parts = []
    for el, kind in own_text_nodes(p):
        if kind == "t":
            parts.append(el.text or "")
        else:
            parts.append("\t" if kind == "tab" else "\n")
    return "".join(parts)


def all_paragraphs(root):
    return list(root.iter(W + "p"))


# --------------------------------------------------------------------------
# styles: resolve names and effective bold

class Styles:
    def __init__(self, root):
        self.by_id = {}
        if root is None:
            return
        for s in root.findall(W + "style"):
            sid = s.get(W + "styleId")
            name_el = s.find(W + "name")
            based = s.find(W + "basedOn")
            rpr = s.find(W + "rPr")
            bold = None
            if rpr is not None and rpr.find(W + "b") is not None:
                bold = _on(rpr.find(W + "b"))
            self.by_id[sid] = {
                "name": name_el.get(W + "val") if name_el is not None else sid,
                "based": based.get(W + "val") if based is not None else None,
                "bold": bold,
            }

    def name(self, sid):
        return self.by_id.get(sid, {}).get("name", sid or "")

    def bold(self, sid):
        seen = set()
        while sid and sid not in seen:
            seen.add(sid)
            info = self.by_id.get(sid)
            if info is None:
                return None
            if info["bold"] is not None:
                return info["bold"]
            sid = info["based"]
        return None


def _on(el):
    return el.get(W + "val", "true").lower() not in ("0", "false", "off")


def para_style_id(p):
    ps = p.find(W + "pPr/" + W + "pStyle")
    return ps.get(W + "val") if ps is not None else None


def run_is_bold(run, p_style, styles):
    rpr = run.find(W + "rPr")
    if rpr is not None:
        b = rpr.find(W + "b")
        if b is not None:
            return _on(b)
        rs = rpr.find(W + "rStyle")
        if rs is not None:
            v = styles.bold(rs.get(W + "val"))
            if v is not None:
                return v
    return bool(styles.bold(p_style))


def run_is_underlined(run):
    rpr = run.find(W + "rPr")
    u = rpr.find(W + "u") if rpr is not None else None
    return u is not None and u.get(W + "val", "single") != "none"


# --------------------------------------------------------------------------
# classification of body paragraphs

def norm(s):
    return re.sub(r"\s+", " ", s).strip().strip(":.").strip().lower()


def looks_like_heading(p, styles):
    text = para_text(p).strip()
    if not text:
        return False
    sname = styles.name(para_style_id(p)).lower()
    if sname.startswith("heading") or sname in ("title", "subtitle"):
        return True
    words = text.split()
    if len(words) > 12 or text.endswith((".", ",", ";")):
        return False
    text_runs = [r for r in own_runs(p)
                 if "".join(t.text or "" for t in r.findall(W + "t")).strip()]
    if not text_runs:
        return False
    p_style = para_style_id(p)
    all_bold = all(run_is_bold(r, p_style, styles) for r in text_runs)
    all_under = all(run_is_underlined(r) for r in text_runs)
    return all_bold or all_under


def classify(paragraphs, styles, force_title=None, force_heading=(),
             force_body=()):
    """Return {paragraph: 'title'|'heading'|'body'} for the main document."""
    force_heading = {norm(x) for x in force_heading}
    force_body = {norm(x) for x in force_body}
    force_title = norm(force_title) if force_title else None
    kinds = {}
    title_done = False
    for p in paragraphs:
        text = para_text(p)
        n = norm(text)
        if not n:
            kinds[p] = "body"
            continue
        if force_title is not None:
            is_title = (n == force_title)
        else:
            is_title = (len(text.split()) <= 12 and
                        any(n.startswith(ph) or n == ph for ph in TITLE_PHRASES))
        if is_title and not title_done:
            kinds[p] = "title"
            title_done = True
        elif n in force_body:
            kinds[p] = "body"
        elif n in force_heading or looks_like_heading(p, styles):
            kinds[p] = "heading"
        else:
            kinds[p] = "body"
    return kinds


# --------------------------------------------------------------------------
# sentence spacing

OPEN_Q = "\"'“‘(["
CLOSE_Q = "\"'”’)]"
SENTENCE_GAP = re.compile(
    r"\.([" + re.escape(CLOSE_Q) + r"]*)( )(?=[" + re.escape(OPEN_Q) +
    r"]?[A-Z0-9])")


def sentence_gaps(text):
    """Positions of single spaces that follow a sentence-ending full stop.

    Returns (positions, skipped) where skipped lists (word, context) of
    full stops that were left alone because they look like abbreviations.
    """
    positions, skipped = [], []
    for m in SENTENCE_GAP.finditer(text):
        dot = m.start()
        # the word that the full stop belongs to
        start = dot
        while start > 0 and not text[start - 1].isspace():
            start -= 1
        word = text[start:dot].lstrip(OPEN_Q)
        ctx = text[max(0, start - 15):m.end(2) + 15].replace("\n", " ")
        if not word:
            continue
        if word.lower() in ABBREVIATIONS:
            skipped.append((word + ".", ctx))
            continue
        if re.fullmatch(r"[A-Z]", word):            # initial, e.g. "A. Kumar"
            skipped.append((word + ".", ctx))
            continue
        if re.fullmatch(r"(?:[A-Za-z]{1,3}\.)+[A-Za-z]{1,3}", word):  # Ph.D, U.S
            skipped.append((word + ".", ctx))
            continue
        positions.append(m.start(2))
    return positions, skipped


def add_sentence_spaces(p):
    """Insert a second space at each sentence gap. Returns (count, skipped)."""
    nodes = own_text_nodes(p)
    # map paragraph character index -> (element, offset) for w:t text
    index = []
    for el, kind in nodes:
        if kind == "t":
            for off in range(len(el.text or "")):
                index.append((el, off))
        else:
            index.append((None, None))
    text = para_text(p)
    assert len(text) == len(index)
    positions, skipped = sentence_gaps(text)
    per_el = {}
    for pos in positions:
        el, off = index[pos]
        per_el.setdefault(el, []).append(off)
    for el, offs in per_el.items():
        s = el.text
        for off in sorted(offs, reverse=True):
            s = s[:off] + " " + s[off:]
        el.text = s
        el.set("{%s}space" % XML_NS, "preserve")
    return len(positions), skipped


# --------------------------------------------------------------------------
# verification: original vs new must match apart from fonts/sizes/spaces

def structure(root):
    """Every element outside <w:rPr>, as (path-tag, attributes), in order."""
    out = []

    def walk(el):
        if not isinstance(el.tag, str):
            return
        if el.tag == W + "rPr":
            return
        if el.tag == W + "pPr":          # may be added just to hold an rPr
            for c in el:
                walk(c)
            return
        attrs = {k: v for k, v in el.attrib.items()
                 if k != "{%s}space" % XML_NS}
        out.append((el.tag, tuple(sorted(attrs.items()))))
        for c in el:
            walk(c)

    walk(root)
    return out


def check_only_sentence_spaces(old, new, where):
    sm = difflib.SequenceMatcher(None, old, new, autojunk=False)
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal":
            continue
        inserted = new[j1:j2]
        if op != "insert" or set(inserted) != {" "}:
            raise FormatError(
                f"{where}: text would change ({op} {old[i1:i2]!r} -> "
                f"{new[j1:j2]!r}). Nothing was saved.")
        # the inserted space must sit right after a space preceded by
        # a full stop (optionally followed by closing quotes/brackets)
        left = old[:i1].rstrip(" ").rstrip(CLOSE_Q)
        if not (old[i1 - 1:i1] == " " or old[i1:i1 + 1] == " ") or \
                not left.endswith("."):
            raise FormatError(
                f"{where}: unexpected extra space at "
                f"{old[max(0, i1 - 20):i1 + 20]!r}. Nothing was saved.")


def verify(orig_xml, new_xml, partname):
    o, n = etree.fromstring(orig_xml), etree.fromstring(new_xml)
    if structure(o) != structure(n):
        raise FormatError(f"{partname}: document structure would change. "
                          "Nothing was saved.")
    op, np_ = all_paragraphs(o), all_paragraphs(n)
    for i, (a, b) in enumerate(zip(op, np_)):
        ta, tb = para_text(a), para_text(b)
        if ta != tb:
            check_only_sentence_spaces(ta, tb, f"{partname} paragraph {i + 1}")
    # deleted text in tracked changes must be untouched too
    dels_o = [e.text for e in o.iter(W + "delText")]
    dels_n = [e.text for e in n.iter(W + "delText")]
    if dels_o != dels_n:
        raise FormatError(f"{partname}: tracked deletions would change.")


# --------------------------------------------------------------------------
# main transformation

def serialize(root):
    return etree.tostring(root, xml_declaration=True, encoding="UTF-8",
                          standalone=True)


def format_styles(root):
    for rpr in root.iter(W + "rPr"):
        set_fonts(rpr)
    # docDefaults: make sure a default run font and size exist
    dd = root.find(W + "docDefaults")
    if dd is None:
        dd = etree.Element(W + "docDefaults")
        root.insert(0, dd)
    rd = dd.find(W + "rPrDefault")
    if rd is None:
        rd = etree.SubElement(dd, W + "rPrDefault")
        dd.remove(rd)
        dd.insert(0, rd)
    rpr = rd.find(W + "rPr")
    if rpr is None:
        rpr = etree.SubElement(rd, W + "rPr")
    set_fonts(rpr)
    set_size(rpr, BODY_PT)


def format_numbering(root):
    """List numbers ("1.", "a)") in Times New Roman; bullets keep their font."""
    for lvl in root.iter(W + "lvl"):
        fmt = lvl.find(W + "numFmt")
        if fmt is not None and fmt.get(W + "val") == "bullet":
            continue
        rpr = lvl.find(W + "rPr")
        if rpr is None:
            continue
        rf = rpr.find(W + "rFonts")
        if rf is not None and any((v or "").lower() in SYMBOL_FONTS
                                  for v in rf.attrib.values()):
            continue
        set_fonts(rpr)


def format_theme(xml):
    root = etree.fromstring(xml)
    for tag in ("majorFont", "minorFont"):
        for f in root.iter("{%s}%s" % (A_NS, tag)):
            latin = f.find("a:latin", NS)
            if latin is not None:
                latin.set("typeface", FONT)
    return serialize(root)


def format_text_part(root, kinds, sentence_spacing, report):
    for p in all_paragraphs(root):
        kind = kinds.get(p, "body")
        pt = {"title": TITLE_PT, "heading": HEADING_PT}.get(kind, BODY_PT)
        for r in own_runs(p):
            rpr = run_rpr(r)
            set_fonts(rpr)
            set_size(rpr, pt)
        mark = para_mark_rpr(p)
        set_fonts(mark)
        set_size(mark, pt)
        if sentence_spacing and kind == "body":
            n, skipped = add_sentence_spaces(p)
            report["spaces"] += n
            report["skipped"].extend(skipped)


def process(src, dst, *, dry_run=False, sentence_spacing=True,
            force_title=None, force_heading=(), force_body=()):
    with zipfile.ZipFile(src) as zin:
        names = zin.namelist()
        data = {n: zin.read(n) for n in names}
        infos = {n: zin.getinfo(n) for n in names}

    if "word/document.xml" not in data:
        raise FormatError(f"{src} does not look like a Word document.")
    if b"<w:ins " in data["word/document.xml"] or \
            b"<w:del " in data["word/document.xml"]:
        print("WARNING: the document has tracked changes. Accept or reject "
              "them in Word first, then run this again.", file=sys.stderr)

    styles_root = (etree.fromstring(data["word/styles.xml"])
                   if "word/styles.xml" in data else None)
    styles = Styles(styles_root)

    report = {"spaces": 0, "skipped": [], "kinds": []}
    out = dict(data)

    for name in names:
        if not TEXT_PART_RE.match(name):
            continue
        root = etree.fromstring(data[name])
        if name == "word/document.xml":
            body = root.find(W + "body")
            # classify only top-level body paragraphs (not table cells)
            top = [p for p in body.iter(W + "p")
                   if next(p.iterancestors(W + "tbl"), None) is None and
                   next(p.iterancestors(W + "txbxContent"), None) is None]
            kinds = classify(top, styles, force_title, force_heading,
                             force_body)
            report["kinds"] = [(kinds[p], para_text(p)) for p in top]
        else:
            kinds = {}
        format_text_part(root, kinds, sentence_spacing, report)
        new = serialize(root)
        verify(data[name], new, name)
        out[name] = new

    if styles_root is not None:
        format_styles(styles_root)
        out["word/styles.xml"] = serialize(styles_root)
    if "word/numbering.xml" in data:
        nroot = etree.fromstring(data["word/numbering.xml"])
        format_numbering(nroot)
        out["word/numbering.xml"] = serialize(nroot)
    for name in names:
        if re.match(r"^word/theme/theme\d*\.xml$", name):
            out[name] = format_theme(data[name])

    print_report(report)
    if dry_run:
        print("\nDry run: nothing was saved.")
        return report

    with zipfile.ZipFile(dst, "w") as zout:
        for name in names:
            info = infos[name]
            zout.writestr(info, out[name],
                          compress_type=info.compress_type)
    # read back the saved file and check it once more against the original
    with zipfile.ZipFile(dst) as zchk:
        for name in names:
            if TEXT_PART_RE.match(name):
                verify(data[name], zchk.read(name), name)
    print(f"\nSaved: {dst}")
    return report


def print_report(report):
    labels = {"title": f"TITLE   {TITLE_PT}pt", "heading": f"HEADING {HEADING_PT}pt",
              "body": f"body    {BODY_PT}pt"}
    print("Paragraphs in the main text:")
    for kind, text in report["kinds"]:
        t = text.strip().replace("\n", " ")
        if not t:
            continue
        print(f"  [{labels[kind]}] {t[:70]}{'...' if len(t) > 70 else ''}")
    counts = {k: sum(1 for kk, t in report["kinds"] if kk == k and t.strip())
              for k in ("title", "heading", "body")}
    print(f"\nTitle: {counts['title']}  Headings: {counts['heading']}  "
          f"Body paragraphs: {counts['body']}")
    if counts["title"] == 0:
        print("WARNING: no title found. Use --title \"exact title text\".")
    print(f"Double spaces added after full stops: {report['spaces']}")
    if report["skipped"]:
        print("Full stops left with one space (look like abbreviations; "
              "check these):")
        for word, ctx in report["skipped"]:
            print(f"  {word:10} ...{ctx}...")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", type=Path)
    ap.add_argument("-o", "--output", type=Path)
    ap.add_argument("--dry-run", action="store_true",
                    help="show the classification and changes without saving")
    ap.add_argument("--no-sentence-spacing", action="store_true",
                    help="only change fonts and sizes")
    ap.add_argument("--title", help="exact text of the title paragraph")
    ap.add_argument("--heading", action="append", default=[],
                    help="treat this paragraph text as a heading (repeatable)")
    ap.add_argument("--not-heading", action="append", default=[],
                    help="treat this paragraph text as body text (repeatable)")
    args = ap.parse_args(argv)

    src = args.input
    dst = args.output or src.with_name(src.stem + "_formatted.docx")
    if dst.resolve() == src.resolve():
        ap.error("output must be a different file from the input")
    try:
        process(src, dst, dry_run=args.dry_run,
                sentence_spacing=not args.no_sentence_spacing,
                force_title=args.title, force_heading=args.heading,
                force_body=args.not_heading)
    except FormatError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
