# grad-autofill

A supervised, page-by-page filler for graduate applications. **It never submits.**

You drive the browser (log in, move between sections); the tool reads each page, matches
the fields to your `profile.yaml`, shows you a plan with every doubt flagged, types only
what you approve, then reads the page back and reports any mismatch.

## Safety rules built in

- **No submission.** The tool never clicks Submit/Pay/Certify. An in-page guard also *blocks your
  own click* on those buttons until you type `allow-submit` and confirm with the school id.
- **Never auto-filled** (listed for you to answer by hand): SSN, race/ethnicity, disability,
  veteran status, conduct/criminal history, signatures/certifications, payment/fee waivers, passwords.
- **Flagged, so you approve each one yourself (`+N`):** label matches the tool is unsure of, closest-option (not exact)
  dropdown picks, assumed date formats, values longer than the field allows, fields that already
  hold something different, list entries (which degree / recommender), file uploads, and
  legal/immigration fields.
- **Verification after every fill:** each value is read back from the page and compared.
- **Profile check at start:** missing required data, date formats, implausible test scores,
  GPA above its scale, phone without country code, and so on.
- Personal data (`profile.yaml`, `logs/`, `.browser-profile/`) is git-ignored.

## Setup (on your own computer, so you can see and use the browser)

```bash
pip install -r requirements.txt
playwright install chromium
cp profile.example.yaml profile.yaml   # then fill it in
```

Set `term`, `degree` and `program_name` for each school in `schools.yaml`.

## Run

```bash
python -m grad_autofill ucr     # or: uiuc
```

Log in to the portal in the browser window that opens, go to a form page, then type `f` in the terminal.
Type `help` at either prompt to see the commands. A typical page:

```
> ctx education 0        # this page is about my most recent degree
> f                      # scan, review the plan, approve flagged rows with +N, Enter to fill
  ...verification table...
> next                   # click Save & Continue (asks first)
```

On the final review page, run `v` to compare everything visible with your profile, read the
application yourself, then decide on submission.

## Practice first

`docs/` is a fake three-page application portal, published with GitHub Pages at
https://harshita-bose.github.io/GRAD/ (enable it in **Settings → Pages → Deploy from a branch →
your branch, `/docs` folder**). It includes the tricky cases: an unstated date format, an inexact
dropdown option, a demographic question, a certification checkbox and an unanswerable required
question. Nothing typed there leaves your browser tab.

```bash
python -m grad_autofill practice
```

## Test

```bash
python tests/test_smoke.py      # headless run against tests/mock_form.html
python tests/test_practice.py   # walks the 3-page practice portal end to end
```
