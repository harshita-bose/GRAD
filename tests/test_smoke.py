"""Headless smoke test: scan -> plan -> fill -> verify on a mock form, plus the submit guard."""
import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from playwright.sync_api import sync_playwright  # noqa: E402

from grad_autofill import browser, plan  # noqa: E402

HERE = pathlib.Path(__file__).parent
PROFILE = {
    "personal": {"first_name": "Harshita", "middle_name": "", "last_name": "Bose", "date_of_birth": "2003-05-17"},
    "contact": {"email": "test@example.com"},
    "citizenship": {"country_of_citizenship": "India", "us_citizen": "No"},
    "education": [{"institution": "Delhi Technological University", "gpa": "8.75", "gpa_scale": "10"}],
    "documents": {"cv": str(HERE / "mock_form.html")},
}


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=os.environ.get("GAF_CHROMIUM") or None)
        page = b.new_page()
        page.goto((HERE / "mock_form.html").as_uri())
        rows = plan.build(browser.scan(page), PROFILE, {}, {})
        by = {r["label"]: r for r in rows}
        for r in rows:
            print(r["status"], r["label"], r["key"], r["value"], r["notes"])

        assert by["First Name"]["status"] == plan.OK and by["First Name"]["value"] == "Harshita"
        assert by["Middle Name"]["status"] == plan.FLAG  # empty in profile -> flagged, not guessed
        assert by["Date of Birth (mm/dd/yyyy)"]["value"] == "05/17/2003"
        assert by["Country of Citizenship"]["value"] == "India"
        assert by["Are you a U.S. citizen?"]["value"] == "No"
        assert by["Are you Hispanic or Latino?"]["status"] == plan.MANUAL
        assert by["Favourite colour"]["status"] == plan.UNMATCHED
        assert not by["Upload Resume / CV"]["approved"]  # files always need explicit approval

        for r in rows:  # simulate the user approving everything that has a value
            if r["value"] is not None and r["status"] != plan.MANUAL:
                r["error"] = browser.fill(page, r)
                r["filled"] = r["error"] is None
        results = plan.verify(rows, lambda r: browser.read_back(page, r))
        for v in results:
            print("verify", v)
        assert results and all(v["ok"] for v in results)
        assert page.input_value("#eth") == ""  # manual field untouched

        btn, text = browser.find_next_button(page)
        assert text == "Save & Continue", text

        page.click("text=Submit Application")
        assert page.evaluate("document.body.dataset.submitted") is None, "guard failed"
        assert "Blocked" in page.inner_text("#__gaf_bar")
        page.fill("#fav", "blue")  # required field the tool left for the user
        page.evaluate("window.__gafAllowSubmit = true")
        page.click("text=Submit Application")
        assert page.evaluate("document.body.dataset.submitted") == "yes"
        b.close()
    print("ALL PASSED")


if __name__ == "__main__":
    main()
