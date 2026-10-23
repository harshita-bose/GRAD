"""Load the applicant profile, resolve keys, and sanity-check values before anything is typed."""
import copy
import datetime as dt
import re

import yaml

LIST_SECTIONS = ("education", "employment", "recommenders")


def load(profile_path, schools_path, school_id):
    with open(profile_path) as f:
        profile = yaml.safe_load(f) or {}
    with open(schools_path) as f:
        schools = yaml.safe_load(f) or {}
    if school_id not in schools:
        raise SystemExit(f"Unknown school '{school_id}'. Known: {', '.join(schools)}")
    school = schools[school_id]
    profile = copy.deepcopy(profile)
    for k, v in (school.get("program") or {}).items():
        if v not in (None, ""):
            profile.setdefault("program", {})[k] = v
    return profile, school


def resolve(profile, key, ctx):
    """Resolve 'education.*.gpa' using ctx={'education': 0}. Returns (value, resolved_key) or (None, reason)."""
    parts = key.split(".")
    if parts[0] == "*":  # bare start/end date: needs an active list context
        active = ctx.get("_active")
        if not active:
            return None, "date field is ambiguous: set `ctx education N` or `ctx employment N` first"
        parts = [active, "*"] + parts[1:]
    node, path = profile, []
    for p in parts:
        if p == "*":
            section = path[-1]
            idx = ctx.get(section, 0)
            if not isinstance(node, list) or idx >= len(node):
                return None, f"no entry {section}[{idx}] in profile"
            node, p = node[idx], str(idx)
        elif isinstance(node, dict) and p in node:
            node = node[p]
        else:
            return None, f"'{key}' not in profile"
        path.append(p)
    if node in (None, "") or isinstance(node, (dict, list)):
        return None, f"'{'.'.join(path)}' is empty in profile"
    return str(node), ".".join(path)


def _date(v):
    try:
        return dt.date.fromisoformat(str(v))
    except ValueError:
        return None


def _walk(node, prefix=""):
    if isinstance(node, dict):
        for k, v in node.items():
            yield from _walk(v, f"{prefix}{k}.")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from _walk(v, f"{prefix}{i}.")
    else:
        yield prefix[:-1], node


REQUIRED = [
    "personal.first_name", "personal.last_name", "personal.date_of_birth",
    "contact.email", "contact.phone", "contact.address.line1", "contact.address.city",
    "contact.address.postal_code", "contact.address.country",
    "citizenship.country_of_citizenship", "program.term", "program.degree", "program.program_name",
]

RANGES = {
    "tests.toefl.total": (0, 120), "tests.ielts.overall": (0, 9),
    "tests.gre.verbal": (130, 170), "tests.gre.quantitative": (130, 170), "tests.gre.writing": (0, 6),
    "tests.duolingo.score": (10, 160),
}


def validate(profile):
    """Return a list of human-readable doubts. Nothing here is auto-corrected."""
    flags = []
    flat = dict(_walk(profile))
    today = dt.date.today()

    for k in REQUIRED:
        if flat.get(k) in (None, ""):
            flags.append(f"MISSING  {k} is empty")

    for k, v in flat.items():
        if v in (None, ""):
            continue
        s = str(v)
        if s != s.strip() or "  " in s:
            flags.append(f"SPACING  {k} has leading/trailing/double spaces: {s!r}")
        if k.endswith("date") or k.endswith("date_of_birth") or k.endswith("_date"):
            d = _date(s)
            if not d:
                flags.append(f"DATE     {k}={s!r} is not YYYY-MM-DD")
            elif k == "personal.date_of_birth" and not (15 <= (today - d).days / 365.25 <= 80):
                flags.append(f"DATE     date of birth {s} gives an implausible age")
        if k.endswith("email") and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[A-Za-z]{2,}", s):
            flags.append(f"EMAIL    {k}={s!r} does not look like an email")
        if k.endswith("phone") and not s.startswith("+"):
            flags.append(f"PHONE    {k}={s!r} has no +country code")
        if k.startswith("documents.") and not s.startswith("/") and not re.match(r"[A-Za-z]:\\", s):
            flags.append(f"FILE     {k}={s!r} is not an absolute path")

    for k, (lo, hi) in RANGES.items():
        v = flat.get(k)
        if v not in (None, ""):
            try:
                if not lo <= float(v) <= hi:
                    flags.append(f"RANGE    {k}={v} outside {lo}-{hi}")
            except ValueError:
                flags.append(f"RANGE    {k}={v!r} is not a number")

    for section in LIST_SECTIONS:
        for i, e in enumerate(profile.get(section) or []):
            s, e_ = _date(e.get("start_date", "")), _date(e.get("end_date", ""))
            if s and e_ and e_ < s:
                flags.append(f"DATE     {section}[{i}] ends before it starts")
            if section == "education":
                gpa, scale = e.get("gpa"), e.get("gpa_scale")
                if gpa and not scale:
                    flags.append(f"GPA      education[{i}] has a GPA but no scale")
                try:
                    if gpa and scale and float(gpa) > float(scale):
                        flags.append(f"GPA      education[{i}] GPA {gpa} exceeds scale {scale}")
                except ValueError:
                    flags.append(f"GPA      education[{i}] GPA/scale not numeric")
                if e_ and e_ > today and str(e.get("status", "")).lower().startswith("complet"):
                    flags.append(f"STATUS   education[{i}] marked completed but ends in the future")

    for i, r in enumerate(profile.get("recommenders") or []):
        if r.get("email", "").lower().endswith(("gmail.com", "yahoo.com", "outlook.com", "hotmail.com")):
            flags.append(f"RECOMMENDER recommenders[{i}] uses a personal email; some schools prefer institutional")

    first, last = flat.get("personal.first_name"), flat.get("personal.last_name")
    if first and last and first.strip().lower() == last.strip().lower():
        flags.append("NAME     first and last name are identical — check passport convention (e.g. FNU)")
    if first and not last:
        flags.append("NAME     no last name — check how your passport handles single names")
    return flags
