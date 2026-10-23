"""Turn scanned fields into a reviewable fill plan, and verify the page after filling."""
import datetime as dt
import os

from . import profile as prof
from .browser import best_option, norm
from .rules import manual_reason, match_key

OK, FLAG, MANUAL, UNMATCHED = "OK", "FLAG", "MANUAL", "UNMATCHED"


def _format_date(iso, field):
    d = dt.date.fromisoformat(iso)
    hint = f"{field.get('placeholder', '')} {field['label']}".lower()
    if field["type"] == "date":
        return iso, None
    if field["type"] == "month":
        return d.strftime("%Y-%m"), None
    if "dd/mm" in hint:
        return d.strftime("%d/%m/%Y"), None
    if "mm/yyyy" in hint or ("mm/yy" in hint and "dd" not in hint):
        return d.strftime("%m/%Y"), None
    if "mm/dd" in hint:
        return d.strftime("%m/%d/%Y"), None
    if "yyyy-mm-dd" in hint:
        return iso, None
    return d.strftime("%m/%d/%Y"), "date format not stated on the form; assumed US MM/DD/YYYY"


def build(fields, profile, ctx, overrides=None):
    """overrides: {label_or_name: profile_key} remembered from earlier `m` commands."""
    overrides = overrides or {}
    rows = []
    for f in fields:
        label = f["label"] or f["name"]
        row = {"n": len(rows) + 1, "field": f, "label": label, "key": None, "value": None,
               "status": UNMATCHED, "notes": [], "approved": False}
        rows.append(row)

        why = manual_reason(label)
        if why:
            row.update(status=MANUAL, notes=[f"never auto-filled: {why}"])
            continue

        key, conf = overrides.get(label), "high"
        if not key:
            key, conf = match_key(label, is_file=f["type"] == "file")
        if not key:
            if f["required"]:
                row["notes"].append("REQUIRED field with no profile match")
            continue
        row["key"] = key

        value, resolved = prof.resolve(profile, key, ctx)
        if value is None:
            row.update(status=FLAG, notes=[resolved])
            continue
        row["key"] = resolved
        notes = []
        if conf == "low":
            notes.append("label match is uncertain — confirm this is the right field")
        if "*" in key or key.startswith(prof.LIST_SECTIONS):
            notes.append(f"using {resolved.rsplit('.', 1)[0]} — is that the right entry?")

        if resolved.endswith("date") or resolved.endswith("date_of_birth"):
            try:
                value, n = _format_date(value, f)
                if n:
                    notes.append(n)
            except ValueError:
                notes.append("profile date is not YYYY-MM-DD")

        if f["type"] == "file":
            if not os.path.isfile(value):
                notes.append(f"file not found: {value}")
            notes.append("check this is the FINAL version of the document")
        elif f.get("options"):
            opt, exact = best_option(f["options"], value)
            if not opt:
                shown = ", ".join(o["text"] for o in f["options"][:12] if o["text"])
                notes.append(f"no option matches {value!r}; options: {shown}")
                value = None
            elif not exact:
                notes.append(f"closest option is {opt['text']!r} (profile says {value!r})")
                value = opt["text"]
            else:
                value = opt["text"]

        if value is not None and f.get("maxlength") and len(value) > f["maxlength"]:
            notes.append(f"value is {len(value)} chars but field allows {f['maxlength']} — would be cut off")
        current = f.get("value") or ", ".join(o["text"] for o in f.get("options", []) if o.get("checked"))
        if current and f["tag"] != "select" and value is not None and norm(current) != norm(value):
            notes.append(f"field already contains {current!r} — will be overwritten")
        if resolved in ("personal.sex", "citizenship.country_of_citizenship", "citizenship.visa_type",
                        "citizenship.visa_required"):
            notes.append("legal/immigration field — always double-check")

        row["value"] = value
        row["notes"] = notes
        row["status"] = OK if not notes and value is not None else FLAG
        row["approved"] = row["status"] == OK
    return rows


def verify(rows, read_back):
    """Compare what the page now holds with what we meant to put there."""
    results = []
    for r in rows:
        if not r.get("filled"):
            continue
        got = read_back(r)
        want = os.path.basename(r["value"]) if r["field"]["type"] == "file" else r["value"]
        ok = norm(got) == norm(want)
        results.append({"n": r["n"], "label": r["label"], "expected": want, "actual": got, "ok": ok})
    return results
