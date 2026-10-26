// Injected into the current tab when you click the GradFill icon.
// Scans the page, proposes a value per field, fills ONLY what you approve, then reads it back.
// It never clicks buttons or links, never navigates, and blocks Submit/Pay/Certify buttons.
(() => {
  if (window.__gradfill) { window.__gradfill.show(); return; }

  const S = {
    profile: null, tracker: null, appId: "", rows: [], unlocked: false, filledOnce: false,
    ctx: Object.fromEntries(GF.LIST_SECTIONS.map(s => [s, 0])),
    active: null, // list section that bare "start/end date" fields refer to
    maps: {}, allMaps: {}, // fields you taught GradFill, per site: { host: { learnKey: profileKey | "-" } }
  };

  // ---------- helpers ----------
  const norm = s => String(s ?? "").toLowerCase().replace(/[^a-z0-9+@.]/g, "");
  const clean = s => String(s ?? "").replace(/\s+/g, " ").replace(/\*/g, "").trim();
  const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august",
    "september", "october", "november", "december"];

  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") e.className = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) e.append(k instanceof Node ? k : String(k));
    return e;
  }

  function bigrams(s) { const b = new Set(); for (let i = 0; i < s.length - 1; i++) b.add(s.slice(i, i + 2)); return b; }
  function similar(a, b) {
    const x = bigrams(norm(a)), y = bigrams(norm(b));
    if (!x.size || !y.size) return 0;
    let n = 0; for (const g of x) if (y.has(g)) n++;
    return (2 * n) / (x.size + y.size);
  }

  // Returns {opt, exact} for the first candidate value that matches an option.
  function withAliases(cands) {
    const out = [...cands];
    for (const c of cands) {
      const set = GF.COUNTRY_ALIASES.find(g => g.some(x => norm(x) === norm(c)));
      if (set) out.push(...set);
    }
    return out;
  }
  function bestOption(options, candidates) {
    const real = options.filter(o => clean(o.text) || o.value);
    candidates = withAliases(candidates);
    for (const c of candidates) {
      const t = norm(c);
      const hit = real.find(o => norm(o.text) === t || (o.value && norm(o.value) === t));
      if (hit) return { opt: hit, exact: true };
    }
    const alias = { yes: ["y", "true"], no: ["n", "false"] };
    for (const c of candidates) {
      const hit = real.find(o => (alias[norm(c)] || []).includes(norm(o.text)));
      if (hit) return { opt: hit, exact: true };
    }
    const c0 = String(candidates[0]);
    const word = new RegExp("^" + c0.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
    const starts = real.filter(o => word.test(clean(o.text)));
    if (starts.length === 1) return { opt: starts[0], exact: false };
    let best = null, score = 0;
    for (const o of real) { const s = similar(c0, o.text); if (s > score) { score = s; best = o; } }
    if (score >= 0.8) return { opt: best, exact: false };
    return { opt: null, exact: false };
  }

  // ---------- scan ----------
  function shown(el) { return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden"; }
  function visible(el) {
    if (el.type === "file") return true; // custom uploaders often hide the real input
    if (shown(el)) return true;
    // styled dropdowns (select2, chosen, …) hide the real <select> next to a visible widget
    return el.tagName === "SELECT" && !!el.parentElement && shown(el.parentElement) && el.options.length > 1;
  }
  // The element to outline / scroll to: the visible widget when the real select is hidden.
  function shownTarget(el) {
    if (shown(el)) return el;
    const sib = el.nextElementSibling;
    return sib && shown(sib) ? sib : el.parentElement;
  }

  // ---------- section headings ----------
  const HEAD_SEL = "h1, h2, h3, h4, h5, h6, legend, [role=heading], caption, .section-title, .form_section_header";
  function headingLevel(h) {
    const m = /^H(\d)$/.exec(h.tagName);
    return m ? Number(m[1]) : Number(h.getAttribute("aria-level")) || 7;
  }
  function headingsFor(scope) {
    return [...scope.querySelectorAll(HEAD_SEL)].filter(h => !h.closest("#gradfill-host, header, nav, footer") &&
      shown(h) && clean(h.innerText).length > 0 && clean(h.innerText).length < 80);
  }
  const ORDINALS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };
  // Which part of your details the field's section is about, from the heading outline above it.
  function sectionOf(el, cache) {
    const scope = el.closest("form") || el.closest("main, [role=main]") || document.body;
    if (!cache.has(scope)) cache.set(scope, headingsFor(scope));
    const hs = cache.get(scope);
    let i = -1;
    for (let k = 0; k < hs.length; k++) if (hs[k].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) i = k; else break;
    let level = 99;
    for (; i >= 0; i--) {
      const h = hs[i], lv = headingLevel(h);
      if (lv >= level) continue; // only walk up the outline: parent headings, not earlier siblings
      level = lv;
      const text = clean(h.innerText);
      const hit = GF.HEADINGS.find(([, rx]) => rx.test(text));
      if (hit) {
        const num = /\b(\d{1,2})\b/.exec(text) || /\b(first|second|third|fourth|fifth)\b/i.exec(text);
        const index = num ? (Number(num[1]) || ORDINALS[num[1].toLowerCase()]) - 1 : null;
        return { sec: hit[0], word: hit[2], index, heading: text };
      }
    }
    return null;
  }
  const textOf = id => { const n = document.getElementById(id); return n ? n.innerText : ""; };
  const WRAP = ".form_question, .question, .form-group, .field, fieldset, tr, li";

  function labelFor(el) {
    if (el.getAttribute("aria-labelledby"))
      return el.getAttribute("aria-labelledby").split(/\s+/).map(textOf).join(" ");
    if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) return l.innerText; }
    const wrap = el.closest("label"); if (wrap) return wrap.innerText;
    if (el.getAttribute("aria-label")) return el.getAttribute("aria-label");
    const q = el.closest(WRAP);
    if (q) { const l = q.querySelector(".form_label, label, legend, th, .label"); if (l) return l.innerText; }
    return el.placeholder || el.title || el.name || "";
  }
  function questionLabel(el) {
    const fs = el.closest("fieldset"); if (fs) { const lg = fs.querySelector("legend"); if (lg) return lg.innerText; }
    const q = el.closest(".form_question, .question, .form-group, .field, tr");
    if (q) { const l = q.querySelector(".form_label, legend, th, .label"); if (l) return l.innerText; }
    return el.getAttribute("aria-label") || "";
  }

  function scan() {
    const out = [], groups = new Map(), cache = new Map();
    let n = 0;
    for (const el of document.querySelectorAll("input, select, textarea")) {
      if (el.closest("#gradfill-host")) continue;
      const type = (el.type || el.tagName).toLowerCase();
      if (["hidden", "submit", "button", "reset", "image"].includes(type)) continue;
      if (el.disabled || el.readOnly || !visible(el)) continue;
      el.dataset.gradfill = String(n);
      const f = {
        gid: String(n++), el, tag: el.tagName.toLowerCase(), type, name: el.name || "",
        required: el.required || el.getAttribute("aria-required") === "true",
        placeholder: el.placeholder || "", maxlength: el.maxLength > 0 ? el.maxLength : null,
        section: sectionOf(el, cache),
      };
      if (type === "radio" || type === "checkbox") {
        const key = type + ":" + (el.name || f.gid);
        const opt = { text: clean(labelFor(el)), value: el.value, el, checked: el.checked };
        if (groups.has(key)) { groups.get(key).options.push(opt); groups.get(key).required ||= f.required; continue; }
        Object.assign(f, { label: clean(questionLabel(el)) || opt.text || el.name, options: [opt], group: true });
        groups.set(key, f);
      } else {
        f.label = clean(labelFor(el));
        f.current = el.value;
        if (f.tag === "select") f.options = [...el.options].map(o => ({ text: clean(o.text), value: o.value }));
      }
      out.push(f);
    }
    return out;
  }

  // ---------- plan ----------
  const FILLABLE = new Set(["ok", "verify", "flag"]);
  function pick(obj, k) {
    const d = GF.DERIVED[k];
    if (d) return d.from.map(x => obj[x]).filter(Boolean).join(" ");
    return obj[k];
  }
  function resolve(key, f) {
    let parts = key.split(".");
    const sect = f && f.section;
    if (parts[0] === "*") {
      const active = sect && ["education", "employment"].includes(sect.sec) ? sect.sec : S.active;
      if (!active) return { err: "Date field: choose which Education / Work entry this page is about (top of panel)" };
      parts = [active, "*", parts[1]];
    }
    const [sec, a, b] = parts;
    const section = S.profile?.[sec];
    if (!section) return { err: "Not in your details" };
    if (a === "*") {
      const fromHeading = sect && sect.sec === sec && sect.index != null && sect.index < section.length;
      const i = fromHeading ? sect.index : S.ctx[sec] || 0, entry = section[i];
      const v = entry && pick(entry, b);
      const base = { list: sec, index: i, fromHeading, path: `${sec}.${i}.${b}` };
      return v ? { ...base, value: String(v) } : { ...base, err: `Empty in your details (${title(sec)} #${i + 1}${fromHeading ? `, from the heading “${sect.heading}”` : ""})` };
    }
    const v = pick(section, a);
    return v ? { value: String(v), path: key } : { err: "Empty in your details" };
  }
  const title = sec => (GF.SECTIONS.find(s => s.id === sec) || {}).title || sec;
  const NAME_KEYS = { education: ["institution", "degree"], employment: ["employer", "title"], recommenders: ["first_name", "last_name"] };
  const entryName = (sec, e) => (NAME_KEYS[sec] || []).map(k => e[k]).filter(Boolean).join(" · ") || "(empty)";
  function isDateKey(path) {
    const parts = path.split("."), sec = GF.SECTIONS.find(s => s.id === parts[0]);
    const f = sec && sec.fields.find(x => x.k === parts[parts.length - 1]);
    return !!f && f.type === "date";
  }

  function datePart(f) {
    if (f.tag !== "select") {
      const p = norm(f.placeholder || f.label);
      if (p === "mm" || p === "month") return "month";
      if (p === "dd" || p === "day") return "day";
      if (p === "yyyy" || p === "year" || f.maxlength === 4) return "year";
      if (/\byear\b/i.test(f.label) && !/month|day|date|mm|dd/i.test(f.label + f.placeholder)) return "year";
      return null;
    }
    const t = f.options.map(o => norm(o.text)).filter(Boolean);
    if (t.some(x => MONTHS.includes(x) || MONTHS.some(m => m.slice(0, 3) === x))) return "month";
    const nums = t.map(Number).filter(Number.isFinite);
    if (nums.length && nums.every(x => x >= 1900 && x <= 2100)) return "year";
    if (nums.length >= 28 && Math.max(...nums) === 31) return "day";
    if (nums.length === 12 && Math.max(...nums) === 12) return "month";
    return null;
  }

  // Returns {value | candidates, note}
  function formatDate(iso, f) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return { note: `Your saved date "${iso}" is not a valid date` };
    const [, y, mo, d] = m, mi = Number(mo) - 1;
    if (f.type === "date") return { value: iso };
    if (f.type === "month") return { value: `${y}-${mo}` };
    const part = datePart(f);
    if (part === "month") return { candidates: [MONTHS[mi], MONTHS[mi].slice(0, 3), mo, String(Number(mo))] };
    if (part === "day") return { candidates: [d, String(Number(d))] };
    if (part === "year") return f.tag === "select" ? { candidates: [y] } : { value: y };
    if (f.tag === "select") return { note: "Date dropdown not understood — choose it yourself" };
    const hint = (f.placeholder + " " + f.label).toLowerCase();
    if (/dd\s*\/\s*mm/.test(hint)) return { value: `${d}/${mo}/${y}` };
    if (/mm\s*\/\s*dd/.test(hint)) return { value: `${mo}/${d}/${y}` };
    if (/yyyy-mm-dd/.test(hint)) return { value: iso };
    if (/mm\s*\/\s*yy/.test(hint)) return { value: `${mo}/${y}` };
    return { value: `${mo}/${d}/${y}`, note: "The form does not say which date format it wants — assumed U.S. MM/DD/YYYY" };
  }

  function manualReason(label) {
    for (const [rx, why] of GF.MANUAL) if (rx.test(label)) return why;
    return null;
  }

  // Same question on the same site → same key, so a choice you make once is reused.
  const learnKey = f => (f.section ? f.section.sec + ":" : "") + norm(f.label || f.name);

  async function teach(r, key) {
    const k = learnKey(r.f);
    if (key) S.maps[k] = key; else delete S.maps[k];
    S.allMaps[location.hostname] = S.maps;
    await chrome.storage.local.set({ mappings: S.allMaps });
    const fresh = planField(r.f);
    fresh.n = r.n;
    S.rows[r.n - 1] = fresh;
    render(h("div", { class: "msg" }, key === "-" ? `GradFill will leave “${r.label}” alone on this site.`
      : key ? `Remembered for ${location.hostname}: “${r.label}” → ${keyLabel(key)}. Press Fill to use it.`
      : `“${r.label}” is back to automatic matching.`));
  }
  function keyLabel(key) {
    const [sec, a, b] = key.split("."), s = GF.SECTIONS.find(x => x.id === sec);
    const k = a === "*" ? b : a;
    const f = s && (s.fields.find(x => x.k === k) || (GF.DERIVED[k] && { label: GF.DERIVED[k].label }));
    return `${s ? s.title : sec} → ${f ? f.label : k}`;
  }
  function teachOptions(current) {
    const groups = GF.SECTIONS.map(s => {
      const fields = [...s.fields];
      if (s.id === "personal" || s.id === "recommenders") fields.push({ k: "full_name", label: GF.DERIVED.full_name.label });
      return h("optgroup", { label: s.list ? `${s.title} (entry from the heading or the picker above)` : s.title },
        fields.map(f => { const key = s.list ? `${s.id}.*.${f.k}` : `${s.id}.${f.k}`;
          return h("option", { value: key, selected: key === current }, `${s.title} → ${f.label}`); }));
    });
    return [h("option", { value: "" }, "— automatic —"), h("option", { value: "-", selected: current === "-" }, "— leave this field alone —"), ...groups];
  }

  function planField(f) {
    const label = f.label || f.name || "(unlabelled field)";
    const row = { f, label, key: null, value: "", status: "none", notes: [], soft: [], approved: false, list: null };
    if (f.type === "password") return { ...row, status: "manual", notes: ["Password — always typed by you"] };
    const why = manualReason(label) || (f.options && f.group ? f.options.map(o => manualReason(o.text)).find(Boolean) : null);
    if (why) return { ...row, status: "manual", notes: [`Never filled by GradFill: ${why}`] };
    if (f.type === "checkbox") return { ...row, status: "manual", notes: ["Checkbox — tick it yourself if it applies"] };
    if (f.type === "file") {
      const doc = GF.DOCS.find(([rx]) => rx.test(label));
      return { ...row, status: "upload", notes: [doc ? `Upload your ${doc[1]} here yourself` : "File upload — attach the right document yourself"] };
    }

    const ctxLabel = (f.section ? f.section.word + " " : "") + label;
    const taught = S.maps[learnKey(f)];
    if (taught === "-") { row.taught = true; row.notes.push("You chose to leave this field alone on this site"); return row; }
    const rule = taught ? [taught, null, "taught"] : GF.RULES.find(([, rx]) => rx.test(ctxLabel));
    if (!rule) {
      if (f.required) row.notes.push("Required, but not in your details — answer it yourself, or choose a detail below");
      return row;
    }
    const [key, , conf] = rule;
    row.taught = conf === "taught";
    const r = resolve(key, f);
    row.key = r.path || key;
    row.list = r.list || (key.startsWith("*") ? S.active : null);
    if (r.err) { row.notes.push(r.err); return row; }

    const notes = [], soft = [];
    let value = r.value, candidates = [value];
    if (conf === "low") notes.push("Label match is uncertain — is this the right field?");
    if (row.taught) soft.push("Matched the way you taught GradFill on this site");
    if (r.list && r.fromHeading) soft.push(`From ${title(r.list)} #${r.index + 1}, because of the heading “${f.section.heading}”`);
    else if (r.list) {
      const filled = (S.profile[r.list] || []).filter(e => Object.values(e).some(Boolean)).length;
      if (filled > 1) notes.push(`Using ${title(r.list)} #${r.index + 1} — is that the right entry for this page?`);
    }
    if (/full_name$/.test(row.key)) soft.push("Full name built as first + middle + last — check the order this form wants");
    if (isDateKey(row.key)) {
      const d = formatDate(value, f);
      if (d.note) notes.push(d.note);
      if (d.candidates) candidates = d.candidates;
      if (d.value) value = candidates[0] = d.value;
      if (!d.value && !d.candidates) { row.notes = notes; return row; }
    }
    // "soft" notes: the value is certain but worth a second look; the row is still filled
    if (/confirm|re-?enter|verify|again/i.test(label)) soft.push("Confirmation field — check it matches the field above");
    if (GF.ALWAYS_CHECK.has(row.key.replace(/\.\d+\./, ".*."))) soft.push("Important detail — please double-check it on the page");

    if (f.options) {
      const { opt, exact } = bestOption(f.options, candidates);
      if (!opt) {
        notes.push(`No option matches "${value}" — choose it yourself`);
        row.notes = notes; return row;
      }
      if (!exact) notes.push(`Closest option is "${opt.text}" (your details say "${value}")`);
      else if (!candidates.some(c => norm(c) === norm(opt.text) || norm(c) === norm(opt.value))) soft.push(`Chose "${opt.text}" for your "${value}"`);
      row.option = opt;
      value = opt.text;
      const cur = f.group ? f.options.find(o => o.el.checked) : null;
      if (cur && cur !== opt) notes.push(`Currently "${cur.text}" — will be changed`);
    } else {
      if (f.maxlength && value.length > f.maxlength) notes.push(`${value.length} characters but the field allows ${f.maxlength} — it would be cut off`);
      if (f.current && norm(f.current) !== norm(value)) notes.push(`Already contains "${f.current}" — will be replaced`);
      if (f.current && norm(f.current) === norm(value)) soft.push("Already filled with this value");
    }
    if (f.tag === "select" && f.current && f.options.find(o => o.value === f.current && clean(o.text)) && row.option && row.option.value !== f.current)
      notes.push(`Currently "${f.options.find(o => o.value === f.current).text}" — will be changed`);

    Object.assign(row, { value, notes, soft, status: notes.length ? "flag" : soft.length ? "verify" : "ok" });
    row.approved = row.status !== "flag";
    return row;
  }

  function plan() {
    S.rows = scan().map(planField);
    S.rows.forEach((r, i) => (r.n = i + 1));
  }

  // ---------- fill & verify ----------
  function setNative(el, v) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v); // works with React-style inputs too
  }
  const fire = (el, ...types) => types.forEach(t => el.dispatchEvent(new Event(t, { bubbles: true })));

  function fillRow(r) {
    const { f } = r, el = f.el;
    if (!el.isConnected) return "Field disappeared from the page — rescan";
    if (f.group) {
      const o = r.option || bestOption(f.options, [r.value]).opt;
      if (!o) return `No option matches "${r.value}"`;
      if (!o.el.checked) o.el.click();
      if (!o.el.checked) { o.el.checked = true; fire(o.el, "input", "change"); }
      return null;
    }
    if (f.tag === "select") {
      const o = bestOption(f.options, [r.value]).opt;
      if (!o) return `No option matches "${r.value}"`;
      el.value = o.value;
      fire(el, "input", "change");
      return null;
    }
    el.focus();
    setNative(el, r.value);
    fire(el, "input", "change");
    el.blur();
    return null;
  }

  function readBack(r) {
    const { f } = r;
    if (f.group) return (f.options.find(o => o.el.checked) || {}).text || "";
    if (f.tag === "select") { const o = f.el.options[f.el.selectedIndex]; return o ? clean(o.text) : ""; }
    return f.el.value;
  }

  const COLORS = { ok: "#1f9d55", verify: "#e8a400", bad: "#d93025", flag: "#e8a400", find: "#2a5bd7" };
  const elOf = r => (r.f.group ? (r.option || r.f.options[0]).el : shownTarget(r.f.el));
  function mark(el, color, dashed) {
    const target = el.type === "radio" ? el.closest("fieldset, .form_question, label") || el : el;
    target.style.outline = color ? `2px ${dashed ? "dashed" : "solid"} ${color}` : "";
    target.style.outlineOffset = color ? "2px" : "";
  }

  async function fillApproved() {
    const todo = S.rows.filter(r => r.approved && FILLABLE.has(r.status) && r.value !== "");
    let ok = 0, bad = 0;
    for (const r of todo) {
      r.error = fillRow(r);
      const actual = r.error ? "" : readBack(r);
      r.result = { actual, ok: !r.error && norm(actual) === norm(r.value) };
      r.result.ok ? ok++ : bad++;
      if (r.result.ok) r.approved = false; // done: don't offer to fill it again
      mark(elOf(r), !r.result.ok ? COLORS.bad : r.status === "ok" ? COLORS.ok : COLORS.verify);
    }
    // fields waiting for your decision get a dashed outline so you can spot them on the page
    for (const r of S.rows) if (r.status === "flag" && !r.result) mark(elOf(r), COLORS.flag, true);
    S.filledOnce = true;
    const newFields = scan().length - S.rows.length;
    await logActivity(ok, bad);
    return { ok, bad, newFields: Math.max(0, newFields) };
  }

  // ---------- tracker ----------
  async function logActivity(ok, bad) {
    if (!S.appId || !ok) return;
    const { tracker } = await chrome.storage.local.get("tracker");
    const app = tracker && tracker.applications.find(a => a.id === S.appId);
    if (!app) return;
    app.activity = [{ t: new Date().toISOString(), text: `Filled ${ok} field(s)${bad ? `, ${bad} problem(s)` : ""} on “${document.title.slice(0, 80)}”`, url: location.href }, ...(app.activity || [])].slice(0, 200);
    if (!app.status || app.status === "Not started") app.status = "In progress";
    await chrome.storage.local.set({ tracker });
  }
  function matchApp() {
    const apps = (S.tracker && S.tracker.applications) || [];
    const host = location.hostname;
    const hit = apps.find(a => linked(a, host));
    return hit ? hit.id : "";
  }
  function linked(a, host) {
    if ((a.portalHosts || []).includes(host)) return true;
    try { return new URL(a.portalUrl).hostname === host; } catch { return false; }
  }
  async function linkSite() {
    const { tracker } = await chrome.storage.local.get("tracker");
    const app = tracker && tracker.applications.find(a => a.id === S.appId);
    if (!app) return;
    app.portalHosts = [...new Set([...(app.portalHosts || []), location.hostname])];
    await chrome.storage.local.set({ tracker });
    S.tracker = tracker;
    render(h("div", { class: "msg good" }, `${location.hostname} is now linked to ${app.school}. GradFill will pick it automatically here.`));
  }

  // ---------- submit guard ----------
  let onBlocked = () => {};
  function buttonText(b) { return clean(b.innerText || b.value || b.getAttribute("aria-label") || ""); }
  document.addEventListener("click", ev => {
    if (S.unlocked || !(ev.target instanceof Element) || ev.target.closest("#gradfill-host")) return;
    const b = ev.target.closest("button, input[type=submit], input[type=button], a, [role=button]");
    if (!b || !GF.SUBMIT_LIKE.test(buttonText(b))) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    onBlocked(buttonText(b));
  }, true);
  document.addEventListener("submit", ev => {
    if (S.unlocked || !ev.submitter || !GF.SUBMIT_LIKE.test(buttonText(ev.submitter))) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    onBlocked(buttonText(ev.submitter));
  }, true);

  // ---------- panel ----------
  const host = h("div", { id: "gradfill-host" });
  const root = host.attachShadow({ mode: "open" });
  root.append(h("style", {}, `
    :host { all: initial; }
    .panel { position: fixed; top: 0; right: 0; width: min(440px, 100vw); height: 100vh; z-index: 2147483646;
      display: flex; flex-direction: column; background: #fff; color: #1d2433; box-shadow: -4px 0 24px rgba(0,0,0,.18);
      font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
    @media (prefers-color-scheme: dark) { .panel { background: #1b1f27; color: #e6e9ef; } .card { border-color: #333a48 !important; }
      input, select { background: #12151b !important; color: inherit !important; border-color: #3a4252 !important; } .muted { color: #9aa3b2 !important; } }
    header { display: flex; align-items: center; gap: 8px; padding: 12px 14px; background: #1d2433; color: #fff; }
    header b { flex: 1; font-size: 15px; }
    header button { background: none; border: 0; color: #fff; font-size: 20px; cursor: pointer; }
    .body { flex: 1; overflow-y: auto; padding: 12px 14px; }
    .foot { padding: 10px 14px; border-top: 1px solid #d9dee7; display: flex; gap: 8px; flex-wrap: wrap; }
    .muted { color: #5b6475; font-size: 12px; }
    .bar { display: grid; gap: 6px; margin-bottom: 10px; }
    .bar label { display: grid; grid-template-columns: 130px 1fr; align-items: center; gap: 8px; font-size: 13px; }
    select, input[type=text] { width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid #c9d0dc; border-radius: 6px; font: inherit; background: #fff; color: #1d2433; }
    .card { border: 1px solid #d9dee7; border-left-width: 4px; border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; }
    .card.ok { border-left-color: #1f9d55; } .card.verify { border-left-color: #e8a400; }
    .card.flag { border-left-color: #e8a400; border-left-style: dashed; }
    .soft { font-size: 12px; margin: 4px 0 0; color: #5b6475; }
    .where { font-weight: 400; color: #5b6475; }
    .teach { margin-top: 6px; font-size: 12px; } .teach summary { cursor: pointer; color: #2a5bd7; }
    .teach select { margin-top: 4px; font-size: 13px; }
    .card.manual, .card.upload { border-left-color: #6b4fbb; } .card.none { border-left-color: #9aa3b2; }
    .top { display: flex; gap: 8px; align-items: flex-start; }
    .top .lbl { flex: 1; font-weight: 600; cursor: pointer; }
    .badge { font-size: 11px; padding: 1px 6px; border-radius: 10px; background: #eef1f6; color: #1d2433; white-space: nowrap; }
    .note { font-size: 12px; margin: 4px 0 0; color: #8a5a00; }
    .card.manual .note, .card.upload .note { color: #5a3fa8; } .card.none .note { color: #5b6475; }
    .val { margin-top: 6px; }
    .res { font-size: 12px; margin-top: 4px; font-weight: 600; } .res.ok { color: #1f9d55; } .res.bad { color: #d93025; }
    button.act { padding: 8px 12px; border-radius: 6px; border: 1px solid #2a5bd7; background: #2a5bd7; color: #fff; font: inherit; cursor: pointer; }
    button.sec { background: transparent; color: #2a5bd7; }
    button:disabled { opacity: .5; cursor: default; }
    .msg { padding: 10px; border-radius: 8px; margin-bottom: 10px; font-size: 13px; background: #eef4ff; color: #1d2433; }
    .msg.warn { background: #fff4d6; } .msg.err { background: #fde7e7; } .msg.good { background: #e3f4e6; }
    .guard { margin-top: 14px; padding-top: 10px; border-top: 1px dashed #c9d0dc; font-size: 13px; }
    .row2 { display: flex; gap: 6px; margin-top: 6px; }
  `));
  const panel = h("div", { class: "panel", role: "dialog", "aria-label": "GradFill review panel" });
  root.append(panel);

  function render(message) {
    panel.replaceChildren();
    panel.append(h("header", {}, h("b", {}, "GradFill — review this page"),
      h("button", { title: "Close", "aria-label": "Close", onclick: () => host.remove() }, "×")));
    const body = h("div", { class: "body" });
    panel.append(body);
    if (message) body.append(message);

    if (!S.profile || !Object.values(S.profile.personal || {}).some(Boolean)) {
      body.append(h("div", { class: "msg warn" }, "Your details are empty. Add them in GradFill settings first.",
        h("div", { class: "row2" }, h("button", { class: "act", onclick: () => chrome.runtime.sendMessage({ type: "open-options" }) }, "Open settings"))));
      return;
    }

    // linked application + list-entry pickers
    const apps = (S.tracker && S.tracker.applications) || [];
    const bar = h("div", { class: "bar" });
    const appSel = h("select", { onchange: e => { S.appId = e.target.value; render(); } },
      h("option", { value: "" }, apps.length ? "— not linked —" : "— add schools on the tracker site —"),
      apps.map(a => h("option", { value: a.id, selected: a.id === S.appId }, `${a.school}${a.program ? " · " + a.program : ""}`)));
    bar.append(h("label", {}, "Application", appSel));
    const chosen = apps.find(a => a.id === S.appId);
    if (chosen && !linked(chosen, location.hostname))
      bar.append(h("div", { class: "msg warn" }, `This site (${location.hostname}) isn't linked to ${chosen.school} yet. `,
        h("button", { class: "act sec", onclick: linkSite }, "Link this site")));
    const lists = [...new Set(S.rows.map(r => r.list).filter(Boolean))];
    const needsActive = S.rows.some(r => r.key && r.key.startsWith("*"));
    for (const sec of GF.LIST_SECTIONS) {
      if (!lists.includes(sec) && !needsActive) continue;
      const entries = S.profile[sec] || [];
      const sel = h("select", { onchange: e => { S.ctx[sec] = Number(e.target.value); if (needsActive) S.active = sec; replan(); } },
        entries.map((e, i) => h("option", { value: i, selected: i === S.ctx[sec] },
          `#${i + 1} ${entryName(sec, e)}`)));
      bar.append(h("label", {}, `${title(sec)} entry`, sel));
    }
    if (needsActive) {
      const sel = h("select", { onchange: e => { S.active = e.target.value || null; replan(); } },
        h("option", { value: "" }, "— choose —"),
        ["education", "employment"].map(s => h("option", { value: s, selected: S.active === s }, title(s))));
      bar.append(h("label", {}, "Dates on this page are for", sel));
    }
    body.append(bar);

    const c = k => S.rows.filter(r => r.status === k).length;
    body.append(h("p", { class: "muted" },
      `${S.rows.length} fields · ${c("ok") + c("verify")} sure · ${c("flag")} need your decision · ${c("manual") + c("upload")} for you to do · ${c("none")} not in your details. ` +
      (S.autoFill ? "GradFill fills the fields it is sure about when you click its icon; ticked rows are filled again when you press the button below."
        : "Ticked rows will be filled. Nothing is filled until you press the button below.")));

    for (const r of S.rows) body.append(card(r));

    body.append(guardBox());

    const n = S.rows.filter(r => r.approved).length;
    panel.append(h("div", { class: "foot" },
      h("button", { class: "act sec", onclick: replan }, "Rescan page"),
      h("button", { class: "act", disabled: !n, onclick: doFill }, `Fill ${n} ticked field${n === 1 ? "" : "s"}`)));
  }

  function card(r) {
    const fillable = FILLABLE.has(r.status);
    const badge = { ok: "ready", verify: "verify", flag: "decide", manual: "you", upload: "upload", none: "skip" }[r.status];
    const box = fillable ? h("input", { type: "checkbox", "aria-label": `Fill ${r.label}`, checked: r.approved,
      onchange: e => { r.approved = e.target.checked; render(); } }) : null;
    const where = r.f.section && !norm(r.label).includes(norm(r.f.section.heading)) ? h("span", { class: "where" }, `${r.f.section.heading} › `) : null;
    const lbl = h("span", { class: "lbl", title: "Show on page", onclick: () => locate(r) }, where, r.label, r.f.required ? " *" : "");
    const el = h("div", { class: `card ${r.status}` }, h("div", { class: "top" }, box, lbl, h("span", { class: "badge" }, badge)));

    if (fillable || (r.status === "none" && r.key && r.f.type !== "file")) {
      let input;
      if (r.f.options) {
        input = h("select", { "aria-label": `Value for ${r.label}`, onchange: e => {
          const o = r.f.options[Number(e.target.value)];
          Object.assign(r, { option: o, value: o ? o.text : "", approved: !!o, status: o ? "flag" : "none" });
          if (o && !r.notes.includes("Chosen by you")) r.notes.push("Chosen by you");
          render();
        } }, h("option", { value: "" }, "— leave unchanged —"),
          r.f.options.map((o, i) => clean(o.text) ? h("option", { value: i, selected: r.option === o }, o.text) : null));
      } else {
        input = h("input", { type: "text", value: r.value, "aria-label": `Value for ${r.label}`, onchange: e => {
          Object.assign(r, { value: e.target.value, approved: !!e.target.value, status: e.target.value ? "flag" : "none" });
          if (!r.notes.includes("Typed by you")) r.notes.push("Typed by you");
          render();
        } });
      }
      el.append(h("div", { class: "val" }, input));
    }
    if (r.status !== "manual" && r.status !== "upload") {
      const current = S.maps[learnKey(r.f)] || "";
      el.append(h("details", { class: "teach", open: !!current && current !== "" && r.status === "none" },
        h("summary", {}, current ? "Taught on this site — change" : "Wrong detail? Choose which of your details goes here"),
        h("select", { "aria-label": `Which of your details goes in ${r.label}`, onchange: e => teach(r, e.target.value) }, teachOptions(current))));
    }
    for (const n of r.notes) el.append(h("p", { class: "note" }, "⚠ ", n));
    for (const n of r.soft || []) el.append(h("p", { class: "soft" }, "ⓘ ", n));
    if (r.result) el.append(h("p", { class: `res ${r.result.ok ? "ok" : "bad"}` },
      r.result.ok ? `✓ Checked: page shows "${r.result.actual}"` : `✗ ${r.error || `Page shows "${r.result.actual}", expected "${r.value}"`}`));
    return el;
  }

  function locate(r) {
    const el = r.f.group ? r.f.options[0].el : r.f.el;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    mark(el, COLORS.find);
    setTimeout(() => { if (!r.result) mark(el, r.status === "flag" ? COLORS.flag : "", r.status === "flag"); }, 1800);
  }

  function guardBox() {
    const app = ((S.tracker && S.tracker.applications) || []).find(a => a.id === S.appId);
    const word = app ? app.school : "SUBMIT";
    if (S.unlocked) return h("div", { class: "guard" }, "Submit buttons are unlocked on this page. GradFill still will not click them — that is yours.");
    const inp = h("input", { type: "text", placeholder: `Type ${word} to unlock`, "aria-label": "Unlock submit" });
    return h("div", { class: "guard" },
      "🔒 Submit / Pay / Certify buttons are blocked on this page while GradFill is open.",
      h("div", { class: "row2" }, inp, h("button", { class: "act sec", onclick: () => {
        if (inp.value.trim() === word) { S.unlocked = true; render(h("div", { class: "msg" }, "Unlocked for this page only.")); }
        else inp.value = "";
      } }, "Unlock")));
  }

  function replan() {
    S.rows.forEach(r => mark(elOf(r), ""));
    plan();
    render();
  }

  async function doFill() {
    const { ok, bad, newFields } = await fillApproved();
    const waiting = S.rows.filter(r => r.status === "flag" && !r.result).length;
    const yours = S.rows.filter(r => (r.status === "manual" || r.status === "upload") && r.f.required).length;
    const msg = h("div", { class: `msg ${bad ? "err" : "good"}` },
      `Filled and checked ${ok} field(s) — green outline on the page, amber means please double-check${bad ? `; ${bad} problem(s) — see the red ✗ rows` : ""}. `,
      waiting ? h("b", {}, `${waiting} field(s) with a dashed outline were NOT filled — decide on them below. `) : "",
      yours ? `${yours} required field(s) are yours to fill (e.g. password). ` : "",
      newFields ? `${newFields} new question(s) appeared — press “Rescan page”. ` : "",
      "Read the page yourself, then click the site's own Continue / Next button and open GradFill again on the next page.");
    render(msg);
    panel.querySelector(".body").scrollTop = 0;
  }

  onBlocked = text => {
    show();
    render(h("div", { class: "msg err" }, `Blocked “${text}”. Review everything, then unlock at the bottom of this panel if you really want to submit.`));
  };

  async function load() {
    const got = await chrome.storage.local.get(["profile", "tracker", "settings", "mappings"]);
    S.allMaps = got.mappings || {};
    S.maps = S.allMaps[location.hostname] || {};
    S.autoFill = (got.settings || {}).autoFill !== false; // on unless you turn it off in settings
    S.profile = got.profile || null;
    S.tracker = got.tracker || null;
    S.appId = matchApp();
  }

  function show() {
    if (!host.isConnected) document.documentElement.append(host);
  }

  const hasProfile = () => S.profile && Object.values(S.profile.personal || {}).some(Boolean);
  // Clicking the icon = scan, and (unless turned off) fill the fields GradFill is sure about.
  async function start() {
    await load();
    S.rows.forEach(r => mark(elOf(r), ""));
    plan();
    show();
    if (S.autoFill && hasProfile()) await doFill(); else render();
  }
  window.__gradfill = { show: start, state: S, fill: doFill, render };
  start();
})();
