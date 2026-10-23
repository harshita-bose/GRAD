"""Walk the 3-page practice portal in docs/ end to end, served over local HTTP."""
import functools
import http.server
import os
import pathlib
import sys
import threading

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from playwright.sync_api import sync_playwright  # noqa: E402

from grad_autofill import browser, plan  # noqa: E402

PROFILE = {
    "personal": {"first_name": "Test", "last_name": "Applicant", "date_of_birth": "2003-05-17"},
    "contact": {"email": "test@example.com", "phone": "+91 9800000000",
                "address": {"line1": "1 Main Rd", "city": "Delhi", "postal_code": "110042", "country": "India"}},
    "citizenship": {"country_of_citizenship": "India", "us_citizen": "No"},
    "program": {"term": "Fall 2027", "degree": "MS", "area_of_interest": "Systems"},
    "education": [{"institution": "Delhi Technological University", "major": "Engineering Physics",
                   "start_date": "2023-08-01", "end_date": "2027-05-31", "gpa": "8.75", "gpa_scale": "10"}],
    "tests": {"gre": {"verbal": "160", "quantitative": "168"}},
    "recommenders": [{"first_name": "Asha", "last_name": "Rao", "email": "asha@dtu.ac.in"}],
}


def fill_page(page, ctx):
    rows = plan.build(browser.scan(page), PROFILE, ctx, {})
    for r in rows:  # stand in for the user approving every row that has a value
        if r["value"] is not None and r["status"] != plan.MANUAL:
            r["error"] = browser.fill(page, r)
            r["filled"] = r["error"] is None
    results = plan.verify(rows, lambda r: browser.read_back(page, r))
    bad = [v for v in results if not v["ok"]] + [r["label"] for r in rows if r.get("error")]
    assert not bad, bad
    return {r["label"]: r for r in rows}


def main():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

    handler = functools.partial(Quiet, directory=str(ROOT / "docs"))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_port}/practice/"

    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=os.environ.get("GAF_CHROMIUM") or None)
        page = b.new_context().new_page()
        page.add_init_script(browser.GUARD_JS)
        page.goto(base + "1-personal.html")

        by = fill_page(page, {})
        assert by["Date of Birth"]["status"] == plan.FLAG  # format not stated
        assert by["Country"]["value"] == "India (IN)" and by["Country"]["status"] == plan.FLAG
        assert by["Are you Hispanic or Latino?"]["status"] == plan.MANUAL
        btn, text = browser.find_next_button(page)
        btn.click()
        page.wait_for_url("**/2-academics.html")

        by = fill_page(page, {"education": 0, "_active": "education"})
        assert by["Start Date (MM/YYYY)"]["value"] == "08/2023"
        assert by["How many hours do you sleep?"]["status"] == plan.UNMATCHED
        page.fill("[name=sleep]", "8")  # the user answers what the tool can't
        browser.find_next_button(page)[0].click()
        page.wait_for_url("**/3-review.html")

        summary = page.inner_text("#summary")
        assert "Delhi Technological University" in summary and "India (IN)" in summary
        rows = plan.build(browser.scan(page), PROFILE, {}, {})
        assert [r["status"] for r in rows] == [plan.MANUAL]  # certification checkbox
        assert browser.find_next_button(page) == (None, None)  # never offers Submit

        page.click("#submit")
        assert page.evaluate("document.body.dataset.submitted") is None, "guard failed"
        page.evaluate("window.__gafAllowSubmit = true")
        page.click("#submit")
        assert page.evaluate("document.body.dataset.submitted") == "yes"
        b.close()
    srv.shutdown()
    print("PRACTICE PORTAL: ALL PASSED")


if __name__ == "__main__":
    main()
