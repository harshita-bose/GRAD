"""Everything that touches the page: scanning fields, filling, reading back, and the submit guard."""
import difflib
import re

from .rules import NEXT_LIKE, SUBMIT_LIKE

SCAN_JS = r"""
() => {
  const vis = el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
                    && getComputedStyle(el).visibility !== 'hidden';
  const clean = s => (s || '').replace(/\s+/g, ' ').replace(/\*/g, '').trim();
  const textOf = id => { const n = document.getElementById(id); return n ? n.innerText : ''; };
  function labelFor(el) {
    if (el.getAttribute('aria-labelledby'))
      return el.getAttribute('aria-labelledby').split(/\s+/).map(textOf).join(' ');
    if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) return l.innerText; }
    const wrap = el.closest('label'); if (wrap) return wrap.innerText;
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
    // Slate-style and other common question wrappers
    const q = el.closest('.form_question, .question, .form-group, .field, tr');
    if (q) { const l = q.querySelector('.form_label, label, legend, th, .label'); if (l) return l.innerText; }
    return el.placeholder || el.title || el.name || '';
  }
  function groupLabel(el) {
    const fs = el.closest('fieldset'); if (fs) { const lg = fs.querySelector('legend'); if (lg) return lg.innerText; }
    const q = el.closest('.form_question, .question, .form-group, .field, tr');
    if (q) { const l = q.querySelector('.form_label, legend, th, .label'); if (l) return l.innerText; }
    return el.name || '';
  }
  const out = [];
  let n = 0;
  for (const el of document.querySelectorAll('input, select, textarea')) {
    const type = (el.type || el.tagName).toLowerCase();
    if (['hidden','submit','button','reset','image'].includes(type)) continue;
    if (type !== 'file' && !vis(el)) continue;
    if (el.disabled || el.readOnly) continue;
    el.setAttribute('data-gaf', String(n));
    const f = { gaf: n++, tag: el.tagName.toLowerCase(), type, name: el.name || '', id: el.id || '',
                required: el.required || el.getAttribute('aria-required') === 'true',
                placeholder: el.placeholder || '', maxlength: el.maxLength > 0 ? el.maxLength : null };
    if (type === 'radio' || type === 'checkbox') {
      f.label = clean(groupLabel(el)); f.option = clean(labelFor(el)); f.checked = el.checked;
    } else {
      f.label = clean(labelFor(el)); f.value = el.value;
    }
    if (el.tagName === 'SELECT')
      f.options = [...el.options].map(o => ({ value: o.value, text: clean(o.text) }));
    out.push(f);
  }
  return out;
}
"""

_GUARD_TEMPLATE = r"""
(() => {
  if (window.__gafGuard) return; window.__gafGuard = true;
  const RX = new RegExp(%s, 'i');
  document.addEventListener('click', ev => {
    const b = ev.target.closest('button, input[type=submit], input[type=button], a');
    if (!b || window.__gafAllowSubmit) return;
    const t = (b.innerText || b.value || b.getAttribute('aria-label') || '').trim();
    if (!RX.test(t)) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    let bar = document.getElementById('__gaf_bar');
    if (!bar) { bar = document.createElement('div'); bar.id = '__gaf_bar';
      bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:12px;' +
        'background:#b00020;color:#fff;font:16px sans-serif;text-align:center';
      document.body.appendChild(bar); }
    bar.textContent = `Blocked "${t}" — grad-autofill guard. Type "allow-submit" in the terminal to unlock.`;
  }, true);
})();
"""

GUARD_JS = _GUARD_TEMPLATE.replace("%s", repr(SUBMIT_LIKE.pattern))  # one source of truth


def norm(s):
    return re.sub(r"[^a-z0-9+@.]", "", str(s).lower())


def best_option(options, value):
    """Pick a select/radio option for value. Returns (option, exact: bool) or (None, False)."""
    texts = [o["text"] for o in options]
    target = norm(value)
    aliases = {"yes": ["y", "true"], "no": ["n", "false"]}
    for o in options:
        if norm(o["text"]) == target or norm(o.get("value", "")) == target:
            return o, True
    for o in options:
        if norm(o["text"]) in aliases.get(target, []):
            return o, True
    # "India" vs "India (IN)": one option that starts with the value as a whole word
    starts = [o for o in options if re.match(re.escape(value) + r"\b", o["text"], re.I)]
    if len(starts) == 1:
        return starts[0], False
    close = difflib.get_close_matches(value, texts, n=1, cutoff=0.75)
    if close:
        return options[texts.index(close[0])], False
    return None, False


def scan(page):
    page.evaluate(GUARD_JS)
    fields = page.evaluate(SCAN_JS)
    # Collapse radio groups / checkbox groups into one logical field each.
    grouped, seen = [], {}
    for f in fields:
        if f["type"] in ("radio", "checkbox") and f["name"]:
            g = seen.get((f["type"], f["name"]))
            if g is None:
                g = dict(f, options=[], members=[])
                seen[(f["type"], f["name"])] = g
                grouped.append(g)
            g["options"].append({"text": f["option"], "value": f["option"], "gaf": f["gaf"], "checked": f["checked"]})
            g["members"].append(f["gaf"])
        else:
            grouped.append(f)
    return grouped


def _loc(page, gaf):
    return page.locator(f'[data-gaf="{gaf}"]')


def fill(page, row):
    """Fill one approved plan row. Returns an error string or None."""
    f, value = row["field"], row["value"]
    try:
        if f["type"] == "file":
            _loc(page, f["gaf"]).set_input_files(value)
        elif f["tag"] == "select":
            opt, _ = best_option(f["options"], value)
            if not opt:
                return f"no option matching {value!r}"
            _loc(page, f["gaf"]).select_option(value=opt["value"])
        elif f["type"] in ("radio", "checkbox"):
            opt, _ = best_option(f["options"], value)
            if not opt:
                return f"no option matching {value!r}"
            _loc(page, opt["gaf"]).check()
        else:
            loc = _loc(page, f["gaf"])
            loc.fill("")
            loc.type(value, delay=15)  # real keystrokes so the page's own validators run
            loc.dispatch_event("change")
            loc.blur()
    except Exception as e:  # noqa: BLE001 — report every failure to the user
        return str(e).splitlines()[0]
    return None


def read_back(page, row):
    f = row["field"]
    if f["type"] == "file":
        return _loc(page, f["gaf"]).evaluate("e => [...e.files].map(x => x.name).join(', ')")
    if f["tag"] == "select":
        return _loc(page, f["gaf"]).evaluate("e => e.selectedIndex >= 0 ? e.options[e.selectedIndex].text.trim() : ''")
    if f["type"] in ("radio", "checkbox"):
        return ", ".join(o["text"] for o in f["options"] if _loc(page, o["gaf"]).is_checked())
    return _loc(page, f["gaf"]).input_value()


def find_next_button(page):
    for b in page.locator("button, input[type=submit], input[type=button], a.button, a[role=button]").all():
        try:
            if not b.is_visible():
                continue
            t = (b.inner_text() or b.get_attribute("value") or "").strip()
        except Exception:  # noqa: BLE001
            continue
        if t and NEXT_LIKE.search(t) and not SUBMIT_LIKE.search(t):
            return b, t
    return None, None
