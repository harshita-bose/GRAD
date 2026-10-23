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
uses its hostname to link pages to the right school.

## Fill an application page

1. Log in to the portal yourself and open a form page.
2. Click the **GradFill icon**. A panel lists every field on the page:
   - **ready** (green): clean match, ticked.
   - **check** (amber): something is uncertain, and each one is explained. It is **not ticked** until you tick it.
   - **you** (purple): never filled by GradFill. These are passwords, CAPTCHAs, demographics,
     conduct questions, agreements and certifications, payments and fee waivers, and checkboxes.
   - **upload** (purple): it tells you which document is wanted. You attach it yourself.
   - **skip** (grey): not in your details. You can type a value to use.
   Click a field's name to scroll to it on the page. Edit any value in the panel. For pages
   about a degree, job or recommender, pick which entry to use at the top.
3. Press **Fill N ticked fields**. GradFill fills only those, then reads each one back: ✓ means
   the page holds what you approved, ✗ means it doesn't.
4. Read the page yourself, then click the site's own **Save / Next** button. Open GradFill again
   on the next page. It does nothing until you do.

**Submit / Pay / Certify buttons are blocked** on any page where GradFill is open. To submit, type the
school's name in the unlock box at the bottom of the panel, then click Submit yourself.

## Try it safely first

The practice portal is built like Slate, the platform UCI and many other schools use. Nothing typed
there is sent anywhere:
- https://harshita-bose.github.io/GRAD/practice/register.html (account registration, with a 3-part birthdate)
- https://harshita-bose.github.io/GRAD/practice/apply.html (application page with tricky cases)

## Known limits

- It has not been tried on real school portals yet. Expect more **check** / **skip** rows there
  until the matching rules are tuned per portal.
- Forms inside iframes and custom dropdown widgets (type-to-search lists) are not detected yet.
- Your data is per browser. Use **Export backup** in settings to move it, and keep that file private.

## Development

```bash
pip install playwright==1.55.0
python tests/test_extension.py   # loads the extension into Chromium and drives the practice portal
```
