"""Interactive, page-by-page application filler. It never submits anything on its own.

Usage:  python -m grad_autofill <school_id> [--profile profile.yaml] [--schools schools.yaml]
"""
import argparse
import datetime as dt
import json
import os
import textwrap

from . import browser, plan
from . import profile as prof

HELP = """
Commands (main prompt):
  f               scan the current page, show a fill plan, fill what you approve, verify
  v               verify only: compare every field on the page with your profile (types nothing)
  ctx <list> <n>  pick which entry to use, e.g. `ctx education 1`, `ctx recommenders 0`
  next            click this page's Save/Continue button (asks first; never a Submit button)
  allow-submit    unlock the Submit-button guard on the CURRENT page (asks you to confirm)
  goto <url>      open a URL
  q               quit (the browser keeps your login for next time)

Plan prompt:
  <Enter>/f       fill the approved rows
  +3,5            approve rows 3 and 5 (after you have checked their flags)
  -4              un-approve row 4
  e 4 <text>      use <text> for row 4 (and approve it)
  m 4 <key>       map row 4 to a profile key, e.g. `m 4 contact.alternate_email`
  x               cancel, type nothing
"""

ICON = {plan.OK: "  ok", plan.FLAG: "  ? ", plan.MANUAL: "  ✋", plan.UNMATCHED: "  - "}


def show(rows):
    print()
    for r in rows:
        mark = "[x]" if r["approved"] else "[ ]"
        val = "" if r["value"] is None else repr(r["value"])
        req = "*" if r["field"]["required"] else " "
        print(f"{ICON[r['status']]} {mark} {r['n']:>3}{req} {r['label'][:48]:<48} {val[:40]}")
        for note in r["notes"]:
            print(textwrap.indent(f"⚠ {note}", " " * 14))
    counts = {s: sum(r["status"] == s for r in rows) for s in ICON}
    print(f"\n  {counts['OK']} ok · {counts['FLAG']} flagged · {counts['MANUAL']} for you to answer by hand"
          f" · {counts['UNMATCHED']} not in profile   (* = required)")


def review_loop(rows, profile, ctx, overrides):
    while True:
        show(rows)
        cmd = input("\nplan> ").strip()
        if cmd in ("", "f"):
            if any(r["approved"] and r["status"] == plan.FLAG and not r.get("checked") for r in rows):
                print("A flagged row is approved without being checked — approve it explicitly with +N.")
                continue
            return True
        if cmd == "x":
            return False
        try:
            if cmd[0] in "+-":
                for n in cmd[1:].split(","):
                    r = rows[int(n) - 1]
                    if cmd[0] == "+" and r["value"] is None:
                        print(f"row {n} has no value — use `e {n} <text>` or `m {n} <key>`")
                        continue
                    if cmd[0] == "+" and r["status"] == plan.MANUAL:
                        print(f"row {n} is manual-only; fill it in the browser yourself")
                        continue
                    r["approved"] = cmd[0] == "+"
                    r["checked"] = True
            elif cmd.startswith("e "):
                _, n, text = cmd.split(" ", 2)
                r = rows[int(n) - 1]
                if r["status"] == plan.MANUAL:
                    print("manual-only fields are never typed by the tool")
                    continue
                r.update(value=text, approved=True, checked=True, status=plan.FLAG,
                         notes=r["notes"] + [f"value typed by you: {text!r}"])
            elif cmd.startswith("m "):
                _, n, key = cmd.split(" ", 2)
                r = rows[int(n) - 1]
                overrides[r["label"]] = key
                fresh = plan.build([r["field"]], profile, ctx, overrides)[0]
                fresh["n"] = r["n"]
                rows[r["n"] - 1] = fresh
            else:
                print(HELP)
        except (ValueError, IndexError):
            print("didn't understand that row number / command")


def report(results, rows):
    print("\nVerification (read back from the page):")
    bad = 0
    for v in results:
        bad += not v["ok"]
        mark = "✓" if v["ok"] else "✗ MISMATCH"
        print(f"  {mark:<11} {v['n']:>3} {v['label'][:45]:<45} page={v['actual']!r}"
              + ("" if v["ok"] else f" expected={v['expected']!r}"))
    for r in rows:
        if r.get("error"):
            bad += 1
            print(f"  ✗ FAILED    {r['n']:>3} {r['label'][:45]} — {r['error']}")
    left = [r for r in rows if r["field"]["required"] and not r.get("filled")]
    for r in left:
        print(f"  … REQUIRED  {r['n']:>3} {r['label'][:45]} — still yours to fill")
    print(f"\n  {len(results) - sum(not v['ok'] for v in results)} verified, {bad} problem(s), "
          f"{len(left)} required field(s) left for you. Check the page yourself before moving on.")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("school")
    ap.add_argument("--profile", default="profile.yaml")
    ap.add_argument("--schools", default="schools.yaml")
    args = ap.parse_args()

    profile, school = prof.load(args.profile, args.schools, args.school)
    print(f"\n== {school['name']} ==\nProfile check:")
    flags = prof.validate(profile)
    for fl in flags:
        print(f"  ⚠ {fl}")
    if not flags:
        print("  no problems found")
    elif input("\nThere are doubts above. Continue anyway? (type yes) ").strip().lower() != "yes":
        return

    from playwright.sync_api import sync_playwright

    os.makedirs("logs", exist_ok=True)
    log_path = f"logs/{args.school}-{dt.datetime.now():%Y%m%d-%H%M%S}.jsonl"
    log = open(log_path, "a")
    ctx, overrides = {}, {}

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            f".browser-profile/{args.school}", headless=False,
            executable_path=os.environ.get("GAF_CHROMIUM") or None, no_viewport=True)
        context.add_init_script(browser.GUARD_JS)
        page = context.pages[0] if context.pages else context.new_page()
        page.goto(school["start_url"])
        print(HELP)
        print("Log in and open the first form page in the browser yourself, then type `f`.")

        while True:
            page = context.pages[-1]  # follow the tab you are looking at most recently opened
            cmd = input(f"\n[{args.school}] {page.url[:70]}\n> ").strip()
            if cmd == "q":
                break
            elif cmd in ("f", "v"):
                rows = plan.build(browser.scan(page), profile, ctx, overrides)
                if cmd == "v":
                    for r in rows:
                        r["filled"] = r["value"] is not None
                    report(plan.verify(rows, lambda r: browser.read_back(page, r)), [])
                    continue
                if not review_loop(rows, profile, ctx, overrides):
                    continue
                for r in rows:
                    if r["approved"]:
                        r["error"] = browser.fill(page, r)
                        r["filled"] = r["error"] is None
                results = plan.verify(rows, lambda r: browser.read_back(page, r))
                report(results, rows)
                log.write(json.dumps({"t": dt.datetime.now().isoformat(), "url": page.url, "ctx": ctx,
                                      "filled": [{k: r[k] for k in ("label", "key", "value")} for r in rows if r.get("filled")],
                                      "verify": results}) + "\n")
                log.flush()
            elif cmd.startswith("ctx "):
                try:
                    _, section, n = cmd.split()
                    if section not in prof.LIST_SECTIONS:
                        raise ValueError
                    entries = profile.get(section) or []
                    if not 0 <= int(n) < len(entries):
                        print(f"{section} has entries 0..{len(entries) - 1}")
                        continue
                    ctx[section], ctx["_active"] = int(n), section
                    print(f"now using {section}[{n}]: {json.dumps(entries[int(n)])[:150]}")
                except ValueError:
                    print(f"usage: ctx <{'|'.join(prof.LIST_SECTIONS)}> <n>")
            elif cmd == "next":
                btn, text = browser.find_next_button(page)
                if not btn:
                    print("no Save/Continue button found — click it yourself")
                elif input(f"Click '{text}'? (y/n) ").strip().lower() == "y":
                    btn.click()
            elif cmd == "allow-submit":
                print("This unlocks Submit/Pay/Certify buttons on the current page only.")
                if input(f"Type the school id '{args.school}' to confirm: ").strip() == args.school:
                    page.evaluate("window.__gafAllowSubmit = true")
                    print("Unlocked. The tool still will not click it — you do.")
            elif cmd.startswith("goto "):
                page.goto(cmd[5:].strip())
            else:
                print(HELP)
        context.close()
    log.close()
    print(f"Session log: {log_path}")
