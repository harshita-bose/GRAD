"""Tests for tools/sop_format.py.  Run:  python3 -m pytest tests/test_sop_format.py"""

import importlib.util
import sys
import zipfile
from pathlib import Path

import docx
from docx.shared import Pt
from lxml import etree

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("sop_format",
                                              ROOT / "tools" / "sop_format.py")
sf = importlib.util.module_from_spec(spec)
sys.modules["sop_format"] = sf
spec.loader.exec_module(sf)

W = sf.W


def make_sample(path):
    d = docx.Document()
    d.sections[0].header.paragraphs[0].text = "Harshita Bose - Statement of Purpose"
    t = d.add_paragraph()
    r = t.add_run("Statement of Purpose")
    r.bold = True
    r.font.size = Pt(16)
    r.font.name = "Arial"

    h = d.add_paragraph()
    h.add_run("Academic Background").bold = True

    p = d.add_paragraph()
    p.add_run("I study physics at DTU. My interest in optics began early")
    p.add_run(". ")                           # full stop and space in own run
    p.add_run("Dr. Sharma, my advisor, said \"try it.\" ")
    p.add_run("So I did. ").italic = True
    p.add_run("I worked with A. Kumar on spectra, e.g. CD spectra. ")
    p.add_run("My GPA is 9.1 out of 10. I want a Ph.D. Then I teach.")

    d.add_paragraph("Research Experience", style="Heading 2")
    p2 = d.add_paragraph("Already two spaces.  Keep them. Line one.")
    p2.add_run().add_break()
    p2.add_run("Line two (after a break). End of text.")

    tbl = d.add_table(rows=1, cols=1)
    tbl.cell(0, 0).text = "Table cell. Another sentence."

    d.add_paragraph("Item one. Item two.", style="List Number")
    d.add_paragraph("Short final line")
    d.save(path)


def body_paragraphs(path):
    with zipfile.ZipFile(path) as z:
        root = etree.fromstring(z.read("word/document.xml"))
    return root.find(W + "body").findall(W + "p"), root


def sizes(p):
    return {r.find(W + "rPr/" + W + "sz").get(W + "val")
            for r in sf.own_runs(p)}


def test_full_pass(tmp_path):
    src, dst = tmp_path / "sop.docx", tmp_path / "out.docx"
    make_sample(src)
    before = src.read_bytes()
    sf.process(src, dst)
    assert src.read_bytes() == before            # original untouched

    paras, root = body_paragraphs(dst)
    texts = [sf.para_text(p) for p in paras]

    assert sizes(paras[0]) == {"28"}             # title 14pt
    assert sizes(paras[1]) == {"24"}             # bold heading 12pt
    assert sizes(paras[2]) == {"22"}             # body 11pt
    assert sizes(paras[3]) == {"24"}             # Heading 2 style 12pt
    assert sizes(paras[-1]) == {"22"}            # short but not bold -> body

    # every run in every text part is Times New Roman
    with zipfile.ZipFile(dst) as z:
        for name in z.namelist():
            if sf.TEXT_PART_RE.match(name):
                r_ = etree.fromstring(z.read(name))
                for r in r_.iter(W + "r"):
                    f = r.find(W + "rPr/" + W + "rFonts")
                    assert f.get(W + "ascii") == "Times New Roman", name
                    assert f.get(W + "hAnsi") == "Times New Roman", name
                    assert f.get(W + "asciiTheme") is None

    assert texts[2] == (
        "I study physics at DTU.  My interest in optics began early.  "
        "Dr. Sharma, my advisor, said \"try it.\"  So I did.  "
        "I worked with A. Kumar on spectra, e.g. CD spectra.  "
        "My GPA is 9.1 out of 10.  I want a Ph.D. Then I teach.")
    assert texts[4] == ("Already two spaces.  Keep them.  Line one.\n"
                        "Line two (after a break).  End of text.")
    assert texts[0] == "Statement of Purpose"
    assert texts[1] == "Academic Background"

    # bold/italic untouched
    doc = docx.Document(dst)
    assert doc.paragraphs[0].runs[0].bold is True
    assert doc.paragraphs[2].runs[3].italic is True
    assert doc.tables[0].cell(0, 0).text == "Table cell.  Another sentence."


def test_text_identical_without_spacing(tmp_path):
    src, dst = tmp_path / "sop.docx", tmp_path / "out.docx"
    make_sample(src)
    sf.process(src, dst, sentence_spacing=False)
    a, _ = body_paragraphs(src)
    b, _ = body_paragraphs(dst)
    assert [sf.para_text(p) for p in a] == [sf.para_text(p) for p in b]


def test_verify_rejects_word_change():
    xml = (b'<w:document xmlns:w="%s"><w:body><w:p><w:r><w:t>Hello there.'
           b'</w:t></w:r></w:p></w:body></w:document>' % sf.W_NS.encode())
    bad = xml.replace(b"Hello", b"Hallo")
    try:
        sf.verify(xml, bad, "x")
    except sf.FormatError:
        return
    raise AssertionError("word change was not caught")


def test_verify_rejects_removed_paragraph():
    xml = (b'<w:document xmlns:w="%s"><w:body><w:p/><w:p><w:r><w:t>A.</w:t>'
           b'</w:r></w:p></w:body></w:document>' % sf.W_NS.encode())
    bad = xml.replace(b"<w:p/>", b"")
    try:
        sf.verify(xml, bad, "x")
    except sf.FormatError:
        return
    raise AssertionError("removed paragraph was not caught")
