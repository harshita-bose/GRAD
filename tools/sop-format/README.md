# SOP / PHS font formatter

Final formatting pass for Statement of Purpose / Personal History Statement Word files.

| What | Size | Font |
|---|---|---|
| Title ("Statement of Purpose", "Personal History Statement", …) | 14 pt | Times New Roman |
| Section headings | 12 pt | Times New Roman |
| Everything else (body, lists, tables, footnotes) | 11 pt | Times New Roman |
| Header / footer | unchanged size | Times New Roman |

**Content is never touched.** The script edits only the font and size settings in the
document's XML. Before saving, it confirms that the text and every other part of the file
are identical to the original. If anything else differs, it stops and writes nothing.
Bold, italics, colours, spacing, alignment and lists all stay as they are. The original
file is never overwritten.

## Usage (Python 3.8+, nothing to install)

```bash
python format_sop.py "SOP.docx" --dry-run     # preview how each paragraph is classified
python format_sop.py "SOP.docx"               # writes "SOP_formatted.docx"
```

How paragraphs are classified:
- **Title:** a short line containing "Statement of Purpose", "Personal History Statement" or similar.
- **Heading:** a paragraph in a Word Heading style, or a short paragraph (≤ 15 words) that
  is entirely bold and doesn't end in `.` `,` or `;`.
- **Body:** everything else.

If the preview gets one wrong, override it by the paragraph's text:

```bash
python format_sop.py "SOP.docx" --heading "Why Berkeley" --body "Harshita Bose"
python format_sop.py "SOP.docx" --title "Statement of Academic Purpose"
```

Old `.doc` files: open them in Word and *Save As* `.docx` first.
