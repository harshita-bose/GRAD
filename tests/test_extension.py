"""End-to-end: load the real extension into Chromium and drive the tracker + practice portal.

Run:  python tests/test_extension.py   (set GF_CHROMIUM to a full Chromium binary if needed)
The test copy of the extension adds host access to the local test server only, because a
test cannot click the toolbar icon (which is what grants activeTab in real use).
"""
import functools
import http.server
import json
import os
import pathlib
import shutil
import sys
import tempfile
import threading

from playwright.sync_api import expect, sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]

PROFILE = {
    "personal": {"first_name": "Test", "last_name": "Applicant", "middle_name": "", "date_of_birth": "2003-05-17"},
    "contact": {"email": "test@example.com", "phone": "+91 9800000000"},
    "address": {"line1": "1 Main Rd", "line2": "", "city": "Delhi", "postal_code": "110042", "country": "India"},
    "citizenship": {"country_of_citizenship": "India", "us_citizen": "No"},
    "education": [{"institution": "Delhi Technological University", "major": "Engineering Physics",
                   "start_date": "2023-08-01", "end_date": "2027-05-31", "gpa": "8.75", "gpa_scale": "10"}, {}, {}],
    "employment": [{}, {}, {}],
    "recommenders": [{"first_name": "Asha", "last_name": "Rao", "email": "asha@dtu.ac.in"}, {}, {}, {}],
    "tests": {},
}


def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT / "docs")))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_port}"


def test_copy(base):
    d = pathlib.Path(tempfile.mkdtemp()) / "ext"
    shutil.copytree(ROOT / "extension", d)
    m = json.loads((d / "manifest.json").read_text())
    m["host_permissions"] = [base + "/*"]
    m["content_scripts"][0]["matches"].append(base + "/*")
    (d / "manifest.json").write_text(json.dumps(m))
    return d


def panel(page):
    return page.locator("#gradfill-host .panel")


def card(page, text):
    return panel(page).locator(".card").filter(has=page.locator(".lbl", has_text=text)).first


def open_gradfill(sw):
    sw.evaluate("""async () => {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["schema.js", "content.js"] });
    }""")


def main():
    srv, base = serve()
    ext = test_copy(base)
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            tempfile.mkdtemp(), headless=True, executable_path=os.environ.get("GF_CHROMIUM") or None,
            args=[f"--disable-extensions-except={ext}", f"--load-extension={ext}"])
        sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
        # the settings page opens itself on first install; wait for it, then work in a fresh tab
        settings = next((pg for pg in ctx.pages if "options.html" in pg.url), None)
        if not settings:  # it may take over the initial blank tab instead of opening a new one
            settings = ctx.pages[0]
            settings.wait_for_url("**/options.html")
        expect(settings.locator("#sec-personal")).to_be_visible()
        settings.fill('#sec-personal [data-k=first_name]', "Typed")
        settings.fill('#sec-contact [data-k=phone]', "98000")  # no country code → a doubt
        expect(settings.locator("#checks")).to_contain_text("no +country code")
        settings.click("#save")
        expect(settings.locator("#status")).to_contain_text("Saved")
        saved = sw.evaluate("async () => (await chrome.storage.local.get('profile')).profile")
        assert saved["personal"]["first_name"] == "Typed" and len(saved["education"]) == 3, saved
        sw.evaluate("p => chrome.storage.local.set({ profile: p, tracker: { applications: [] } })", PROFILE)
        for pg in ctx.pages:
            pg.close()

        # --- tracker site: add a school through the UI, check it reaches extension storage
        page = ctx.new_page()
        page.goto(base + "/index.html")
        expect(page.locator("#toolbar")).to_be_visible()
        page.click("#add")
        page.fill("[name=school]", "Practice University")
        page.fill("[name=portalUrl]", base + "/practice/register.html")
        page.fill("[name=deadline]", "2026-12-15")
        page.click("#recs + button")  # + Recommender
        page.fill(".rec input", "Asha Rao")
        page.click("dialog button[value=save]")
        expect(page.locator(".app h2")).to_have_text("Practice University")
        stored = sw.evaluate("async () => (await chrome.storage.local.get('tracker')).tracker")
        assert stored["applications"][0]["school"] == "Practice University", stored
        assert stored["applications"][0]["recommenders"] == [{"name": "Asha Rao", "status": "Not asked"}]

        # --- registration page (like UCI's)
        page.goto(base + "/practice/register.html")
        open_gradfill(sw)
        expect(panel(page)).to_be_visible()
        expect(panel(page).locator("select").first).to_have_value(stored["applications"][0]["id"])  # auto-linked
        assert card(page, "Email Address").get_attribute("class") == "card ok"
        assert "manual" in card(page, "Password").get_attribute("class")
        assert "manual" in card(page, "Confirm Password").get_attribute("class")
        assert "manual" in card(page, "I agree").get_attribute("class")
        bd = panel(page).locator(".card").filter(has_text="Birthdate")
        assert bd.count() == 3 and all("flag" in bd.nth(i).get_attribute("class") for i in range(3))
        assert "flag" in card(page, "Country of Citizenship").get_attribute("class")
        for i in range(3):
            bd.nth(i).locator("input[type=checkbox]").check()  # the user reviews the flagged rows
        card(page, "Country of Citizenship").locator("input[type=checkbox]").check()
        panel(page).locator("button", has_text="Fill").click()
        expect(panel(page).locator(".msg.good")).to_be_visible()
        assert page.input_value("#email") == "test@example.com"
        assert (page.input_value("#bm"), page.input_value("[name=bd]"), page.input_value("[name=by]")) == ("5", "17", "2003")
        assert page.input_value("#cit") == "IN"
        assert page.input_value("#pw") == "" and not page.is_checked("[name=tos]")
        assert panel(page).locator(".res.bad").count() == 0

        # --- application page
        page.goto(base + "/practice/apply.html")
        open_gradfill(sw)
        expect(panel(page)).to_be_visible()
        assert "none" in card(page, "Street Address Line 2").get_attribute("class")  # empty → not guessed
        assert "Closest option" in card(page, "Country").inner_text()
        assert "manual" in card(page, "Hispanic").get_attribute("class")
        assert "upload" in card(page, "Statement of Purpose").get_attribute("class")
        assert "manual" in card(page, "I certify").get_attribute("class")
        assert "Required" in card(page, "favourite campus").inner_text()
        assert "choose which Education" in card(page, "Dates Attended From").inner_text()
        panel(page).locator("label", has_text="Dates on this page are for").locator("select").select_option("education")
        expect(card(page, "Dates Attended From").locator("input[type=text]")).to_have_value("08/2023")
        for c in panel(page).locator(".card.flag").all():
            c.locator("input[type=checkbox]").check()
        panel(page).locator("button", has_text="Fill").click()
        expect(panel(page).locator(".msg")).to_contain_text("Filled and checked")
        if os.environ.get("GF_SHOTS"):
            page.screenshot(path=os.path.join(os.environ["GF_SHOTS"], "panel.png"))
        assert panel(page).locator(".res.bad").count() == 0, panel(page).locator(".res.bad").all_inner_texts()
        vals = {k: page.input_value(f"#{k}") for k in ["phone", "a1", "a2", "city", "zip", "inst", "major", "from", "to", "gpa", "rf", "re"]}
        assert vals == {"phone": "+91 9800000000", "a1": "1 Main Rd", "a2": "", "city": "Delhi", "zip": "110042",
                        "inst": "Delhi Technological University", "major": "Engineering Physics", "from": "08/2023",
                        "to": "05/2027", "gpa": "8.75", "rf": "Asha", "re": "asha@dtu.ac.in"}, vals
        assert page.input_value("#ctry") == "India (IN)" and page.is_checked("[name=usc][value=N]")
        assert not page.is_checked("[name=hisp][value=Y]") and not page.is_checked("[name=hisp][value=N]")
        assert page.input_value("#fav") == ""

        # submit guard
        page.click("text=Submit Application")
        assert page.evaluate("document.body.dataset.submitted") is None, "guard failed"
        expect(panel(page).locator(".msg.err")).to_contain_text("Blocked")
        page.click("text=Save & Continue")  # not a submit button: never blocked
        page.fill("#fav", "Library")
        page.check("[name=cert]")
        panel(page).locator(".guard input").fill("Practice University")
        panel(page).locator(".guard button").click()
        page.click("text=Submit Application")
        assert page.evaluate("document.body.dataset.submitted") == "yes"

        # activity logged to the tracker (the app is linked by the portal's hostname)
        acts = sw.evaluate("async () => (await chrome.storage.local.get('tracker')).tracker.applications[0]")
        assert acts["status"] == "In progress" and len(acts["activity"]) == 2, acts
        page.goto(base + "/index.html")
        expect(page.locator(".app .last")).to_contain_text("Filled")
        if os.environ.get("GF_SHOTS"):
            page.screenshot(path=os.path.join(os.environ["GF_SHOTS"], "tracker.png"))

        # "Link this site": a school whose portal URL is elsewhere can be linked from the panel
        sw.evaluate("""async () => { const { tracker } = await chrome.storage.local.get('tracker');
            tracker.applications.push({ id: 'other', school: 'Other U', portalUrl: 'https://apply.other.edu/' });
            await chrome.storage.local.set({ tracker }); }""")
        page.goto(base + "/practice/apply.html")
        open_gradfill(sw)
        panel(page).locator("label", has_text="Application").locator("select").select_option("other")
        panel(page).locator("button", has_text="Link this site").click()
        expect(panel(page).locator(".msg.good")).to_contain_text("now linked to Other U")
        other = sw.evaluate("async () => (await chrome.storage.local.get('tracker')).tracker.applications[1]")
        assert other["portalHosts"] == ["127.0.0.1"], other
        page.goto(base + "/index.html")

        # profile is never readable by the tracker page
        leaked = page.evaluate("""() => new Promise(r => {
            addEventListener('message', e => { if (e.data && e.data.id === 99) r(JSON.stringify(e.data)); });
            postMessage({ source: 'gradfill-page', id: 99, type: 'get' }, location.origin);
        })""")
        assert "test@example.com" not in leaked
        ctx.close()
    srv.shutdown()
    print("EXTENSION END-TO-END: ALL PASSED")


if __name__ == "__main__":
    sys.exit(main())
