// Settings page: edit your details, check them for doubts, back up / restore.
const form = document.getElementById("form");
const statusEl = document.getElementById("status");
let profile = GF.emptyProfile();
let dirty = false;

function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k instanceof Node ? k : String(k));
  return e;
}

function input(f, value, onchange) {
  const attrs = { "data-k": f.k, oninput: e => { onchange(e.target.value.trim()); dirty = true; check(); } };
  if (f.options) return h("select", attrs, f.options.map(o => h("option", { value: o, selected: o === value }, o || "—")));
  return h("input", { ...attrs, type: f.type || "text", value: value || "" });
}

function fieldsFor(s, obj) {
  return h("div", { class: "grid" }, s.fields.map(f =>
    h("label", { class: "f" }, f.label, input(f, obj[f.k], v => (obj[f.k] = v)), f.hint ? h("small", {}, f.hint) : null)));
}

function build() {
  form.replaceChildren();
  const nav = document.getElementById("tabs");
  nav.replaceChildren();
  for (const s of GF.SECTIONS) {
    const fs = h("fieldset", { id: `sec-${s.id}` }, h("legend", {}, s.title));
    if (s.hint) fs.append(h("p", { class: "muted" }, s.hint));
    if (s.list) {
      profile[s.id].forEach((entry, i) => fs.append(h("div", { class: "entry" }, h("h3", {}, `${s.title} #${i + 1}`), fieldsFor(s, entry))));
    } else fs.append(fieldsFor(s, profile[s.id]));
    form.append(fs);
    nav.append(h("button", { type: "button", onclick: () => fs.scrollIntoView({ behavior: "smooth" }) }, s.title));
  }
}

// Fill gaps so older/partial backups still match the current layout.
function normalise(p) {
  const base = GF.emptyProfile();
  for (const s of GF.SECTIONS) {
    if (!p || !p[s.id]) continue;
    if (s.list) base[s.id] = base[s.id].map((blank, i) => ({ ...blank, ...(p[s.id][i] || {}) }));
    else base[s.id] = { ...base[s.id], ...p[s.id] };
  }
  return base;
}

// Doubts about your saved details. Nothing is changed automatically.
function doubts(p) {
  const out = [], today = new Date();
  const need = [["personal", "first_name"], ["personal", "last_name"], ["personal", "date_of_birth"],
    ["contact", "email"], ["contact", "phone"], ["address", "line1"], ["address", "city"], ["address", "country"],
    ["citizenship", "country_of_citizenship"]];
  for (const [s, k] of need) if (!p[s][k]) out.push(`${s} → ${k.replace(/_/g, " ")} is empty`);
  const each = (fn) => GF.SECTIONS.forEach(s => (s.list ? p[s.id] : [p[s.id]]).forEach((o, i) => s.fields.forEach(f => fn(s, f, o[f.k], s.list ? ` #${i + 1}` : ""))));
  each((s, f, v, n) => {
    if (!v) return;
    const where = `${s.title}${n} → ${f.label}`;
    if (v !== v.trim() || /\s{2,}/.test(v)) out.push(`${where} has extra spaces`);
    if (f.type === "email" && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v)) out.push(`${where} doesn't look like an email`);
    if (f.type === "tel" && !v.startsWith("+")) out.push(`${where} has no +country code`);
  });
  const dob = Date.parse(p.personal.date_of_birth);
  if (dob) { const age = (today - dob) / 3.156e10; if (age < 16 || age > 80) out.push(`Date of birth gives age ${age.toFixed(0)} — check it`); }
  const exp = Date.parse(p.citizenship.passport_expiry);
  if (exp && exp < today.getTime() + 3.156e10) out.push("Passport expires within a year — schools and visas may need longer validity");
  const range = (v, lo, hi, what) => { if (v !== "" && !(Number(v) >= lo && Number(v) <= hi)) out.push(`${what} ${v} is outside ${lo}–${hi}`); };
  range(p.tests.gre_verbal, 130, 170, "GRE verbal"); range(p.tests.gre_quant, 130, 170, "GRE quant");
  range(p.tests.gre_writing, 0, 6, "GRE writing"); range(p.tests.toefl_total, 0, 120, "TOEFL total");
  range(p.tests.ielts_overall, 0, 9, "IELTS overall"); range(p.tests.duolingo_score, 10, 160, "Duolingo");
  p.education.forEach((e, i) => {
    if (e.gpa && !e.gpa_scale) out.push(`Education #${i + 1}: GPA has no scale`);
    if (e.gpa && e.gpa_scale && Number(e.gpa) > Number(e.gpa_scale)) out.push(`Education #${i + 1}: GPA is above its scale`);
    if (e.start_date && e.end_date && e.end_date < e.start_date) out.push(`Education #${i + 1}: ends before it starts`);
  });
  p.recommenders.forEach((r, i) => {
    if (/@(gmail|yahoo|outlook|hotmail)\./i.test(r.email)) out.push(`Recommender #${i + 1} uses a personal email — some schools want an institutional one`);
  });
  if (p.personal.first_name && p.personal.first_name.toLowerCase() === p.personal.last_name.toLowerCase())
    out.push("First and last name are the same — check your passport's convention (e.g. FNU)");
  return out;
}

function check() {
  const list = doubts(profile);
  const box = document.getElementById("checks");
  box.replaceChildren(h("h2", {}, "Doubts about your details"),
    list.length ? h("ul", {}, list.map(d => h("li", {}, d))) : h("p", { class: "muted" }, "None found. GradFill will still ask you to review every page."));
  statusEl.textContent = dirty ? "Unsaved changes" : "";
}

async function save() {
  await chrome.storage.local.set({ profile });
  dirty = false;
  statusEl.textContent = `Saved ${new Date().toLocaleTimeString()}`;
}

document.getElementById("save").addEventListener("click", save);
document.getElementById("export").addEventListener("click", async () => {
  const data = await chrome.storage.local.get(["profile", "tracker"]);
  const blob = new Blob([JSON.stringify({ gradfill: 1, ...data }, null, 2)], { type: "application/json" });
  const a = h("a", { href: URL.createObjectURL(blob), download: `gradfill-backup-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
document.getElementById("import").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.gradfill !== 1) throw new Error("not a GradFill backup");
    if (!confirm("Replace your current details and tracker with this backup?")) return;
    const next = { profile: normalise(data.profile) };
    if (data.tracker && Array.isArray(data.tracker.applications)) next.tracker = data.tracker;
    await chrome.storage.local.set(next);
    profile = next.profile; build(); check();
    statusEl.textContent = "Backup restored";
  } catch (err) {
    alert(`Could not import: ${err.message}`);
  } finally { e.target.value = ""; }
});
window.addEventListener("beforeunload", e => { if (dirty) e.preventDefault(); });

async function showTaught() {
  const { mappings = {} } = await chrome.storage.local.get("mappings");
  const box = document.getElementById("taught");
  const sites = Object.entries(mappings).filter(([, m]) => Object.keys(m).length);
  box.replaceChildren(...(sites.length ? sites.map(([host, m]) => h("div", { class: "entry" },
    h("h3", {}, host, " ", h("button", { type: "button", onclick: async () => {
      delete mappings[host]; await chrome.storage.local.set({ mappings }); showTaught();
    } }, "Forget this site")),
    h("ul", {}, Object.entries(m).map(([q, key]) => h("li", { class: "muted" }, `${q.replace(/^\w+:/, "")} → ${key === "-" ? "leave alone" : key.replace(".*.", " → ")}`)))))
    : [h("p", { class: "muted" }, "Nothing yet.")]));
}
showTaught();

const auto = document.getElementById("autoFill");
auto.addEventListener("change", async () => {
  await chrome.storage.local.set({ settings: { autoFill: auto.checked } });
  statusEl.textContent = auto.checked ? "GradFill will fill sure fields when you click it" : "GradFill will wait for you to press Fill";
});
chrome.storage.local.get("settings").then(got => { auto.checked = (got.settings || {}).autoFill !== false; });

chrome.storage.local.get("profile").then(got => {
  profile = normalise(got.profile);
  build();
  check();
});
