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
- https://harshita-bose.github.io/GRAD/practice/apply.html (application page with tricky cases)

## Known limits

- It has not been tried on real school portals yet. Expect more **check** / **skip** rows there
  until the matching rules are tuned per portal.
- GradFill reads the section heading above each field. "First Name" under "Recommender 2" uses your
  recommender #2, and "City" under an address heading is your address city.
- If it still picks the wrong detail, open **"Wrong detail? Choose which of your details goes here"**
  on that row. GradFill remembers your choice for that site; settings lists what you taught it.
- Styled dropdowns that hide a real dropdown are filled. Type-to-search boxes with no real dropdown
  behind them, and forms inside iframes, are not detected yet.
- Your data is per browser. Use **Export backup** in settings to move it, and keep that file private.

## Development

```bash
pip install playwright==1.55.0
python tests/test_extension.py   # loads the extension into Chromium and drives the practice portal
```
