# GradFill + GradTrack

Two pieces that work together, with all your data kept **only in your own browser**:

- **GradFill**: a Chrome / Edge / Brave extension that fills graduate application forms from
  your saved details, **one page at a time, only after you review it**. It never clicks Next or
  Submit, never types passwords, and never uploads files.
- **GradTrack**: a tracker site (https://harshita-bose.github.io/GRAD/) for deadlines, status,
  fees, documents and recommenders. Its data lives inside the extension, and GradFill logs each page
  it fills there.

## Install the extension (once)

1. Download this repo (Code → Download ZIP) and unzip it.
2. Open `chrome://extensions` (Edge: `edge://extensions`), turn on **Developer mode**.
3. Click **Load unpacked** and choose the `extension` folder.
4. The GradFill settings page opens. Enter your details and press **Save details**.
   The "Doubts about your details" box lists anything that looks off (missing fields, no
   country code, GPA above its scale, passport expiring soon, and so on).
5. Pin the GradFill icon to the toolbar.

## Updating GradFill without losing your details

Your details and tracker are stored inside the extension. **Clicking "Remove" on
`chrome://extensions` deletes them.** To update:

1. GradFill settings → **Export backup** (just in case).
2. Download the new ZIP and copy the new `extension` folder's files **over your existing
   extension folder**.
3. On `chrome://extensions`, click the reload ↻ button on GradFill.

From version 0.2.0 GradFill always has the same ID (`nkoenhabpebhdkmbhjmfekdilflihipj`), so loading it
from a different folder keeps your data too, as long as you never press Remove.

## Track your schools

Open https://harshita-bose.github.io/GRAD/ and use **+ Add school**. Put the school's
**application portal URL** in each entry (e.g. `https://apply.grad.uci.edu/apply/`). GradFill
uses its hostname to link pages to the right school. If a school's form lives on a different site
(many schools use separate portals per department), open GradFill there, pick the school under
**Application**, and press **Link this site** once.

### Requirements checklist

Each school has an editable checklist. When you add UC Santa Barbara, UChicago or CU Boulder,
it starts from a list researched for that school (others get a generic list), with notes and
source links. Requirements differ by department, so **every starter item is marked "confirm on
program page"** until you tick *confirmed* in Edit. Tick items off straight from the school's card.

## Fill an application page

1. Log in to the portal yourself (or open its registration page) and go to a form page.
2. Click the **GradFill icon**. It immediately fills every field it is **sure** about, and reads each one
   back to check it:
   - **green outline**: filled and checked.
   - **amber outline**: filled, but an important detail (birthdate, citizenship, visa…). Double-check it.
   - **dashed outline**: **not filled**. GradFill has a doubt (uncertain label, inexact dropdown
     option, assumed date format, the field already holds something else…). The panel explains the
     doubt. Tick the row, or edit its value, and press **Fill** to use it. Otherwise fill it yourself.
   - Never filled: passwords, CAPTCHAs, demographics, conduct questions, agreements and certifications,
     payments, checkboxes and file uploads. The panel lists them for you.
3. Read the page, then click the site's own **Continue / Next** yourself. Click GradFill again on the
   next page.

Prefer to approve everything before anything is typed? In GradFill settings, turn off
**"Fill the fields GradFill is sure about straight away"**.

**Submit / Pay / Certify buttons are blocked** on any page where GradFill is open. To submit, type the
school's name in the unlock box at the bottom of the panel, then click Submit yourself.

## Try it safely first

The practice portal is built like Slate, the platform UCI and many other schools use. Nothing typed
there is sent anywhere:
- https://harshita-bose.github.io/GRAD/practice/register.html (built like the UCI registration page: email, names, 3-part birthdate, Continue)
- https://harshita-bose.github.io/GRAD/practice/register-b.html (built like the UC Berkeley registration page: dropdowns labelled only Month / Day / Year)
- https://harshita-bose.github.io/GRAD/practice/apply.html (application page with tricky cases)
- https://harshita-bose.github.io/GRAD/practice/tricky.html (different wordings, other formats, type-to-search dropdowns)

## How GradFill reads a question

- **Every clue on the page:** the label, the section heading above it ("Recommender 2" → your
  recommender #2), the page's own autofill hint, and the field's internal name (`fname`,
  `birthdate_m`…). Many wordings are understood: "Given name(s)", "Surname / Family name",
  "E-mail ID", "Mobile no.", "Pincode", "Nationality", "D.O.B."…
- **Your value in the form's format:**
  - **Dates:** any order or separator (DD-MM-YYYY, MM/YY…), or split month / day / year boxes.
  - **Countries:** "India", "IND", "IN" or "Indian".
  - **Phone:** a separate "+91 (India)" code box plus the number alone.
  - **Yes/No:** Y/N.
  - **Female/Male:** F/M.
  - **Degree names:** "B.Tech" → "Bachelor's degree".
- **Dropdowns, including type-to-search boxes,** are picked automatically when one option clearly
  matches. If two options are equally close, GradFill asks instead.
- **Filled automatically only when the evidence is strong:** a clear label, the page's autofill
  hint, or two clues that agree. Anything else waits for your tick.
- **Never filled with your details:** questions about someone else (emergency contact, parent,
  guardian, spouse, sponsor).
- **Still wrong somewhere?** Use **"Wrong detail? Choose which of your details goes here"** on that
  row once. GradFill remembers your choice for that site.

## Known limits

- Forms inside iframes are not read yet.
- Your data is per browser. Use **Export backup** in settings to move it, and keep that file private.

## Development

```bash
pip install playwright==1.55.0
node tests/test_labels.js         # how 40+ real-world question wordings are read
python tests/test_extension.py   # loads the extension into Chromium and drives the practice portal
```
