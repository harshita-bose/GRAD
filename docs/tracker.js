// GradTrack: reads and writes tracker data held by the GradFill extension (via its bridge script).
// Without the extension this page stores nothing.
const STATUSES = ["Not started", "In progress", "Submitted", "Interview", "Admitted", "Waitlisted", "Rejected", "Withdrawn"];
const WAIVERS = ["None", "Requested", "Granted", "Denied"];
const DOC_STATES = ["To do", "Done", "Sent", "Not needed"];
const DOCS = [["sop", "Statement of purpose"], ["cv", "CV / résumé"], ["transcripts", "Transcripts"],
  ["personal", "Personal history"], ["gre", "GRE score report"], ["english", "TOEFL / IELTS report"]];
const REC_STATES = ["Not asked", "Asked", "Request sent", "Submitted"];

let data = null;          // { applications: [...] }
let editing = null;       // application being edited

const $ = id => document.getElementById(id);
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

// ---------- extension bridge ----------
const pending = new Map();
let seq = 0, connected = false;
window.addEventListener("message", ev => {
  if (ev.source !== window || ev.origin !== location.origin) return;
  const m = ev.data;
  if (!m || m.source !== "gradfill-ext") return;
  if (m.type === "hello" && !connected) { connected = true; start(); }
  else if (m.type === "changed") { data = m.data || { applications: [] }; render(); }
  else if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
function ask(type, payload) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, m => (m.ok ? resolve(m.data) : reject(new Error(m.error))));
    window.postMessage({ source: "gradfill-page", id, type, data: payload }, location.origin);
    setTimeout(() => { if (pending.delete(id)) reject(new Error("GradFill did not answer")); }, 3000);
  });
}
const persist = () => ask("set", data).catch(e => alert(`Not saved: ${e.message}`));

window.postMessage({ source: "gradfill-page", type: "hello" }, location.origin);
setTimeout(() => { if (!connected) noExtension(); }, 1500);

function noExtension() {
  $("banner").replaceChildren(h("div", { class: "msg" },
    h("b", {}, "GradFill extension not detected. "),
    "This tracker keeps your data inside the extension, in your own browser. To use it:",
    h("ol", {},
      h("li", {}, "Download the repository: ", h("a", { href: "https://github.com/harshita-bose/GRAD" }, "github.com/harshita-bose/GRAD"), " → Code → Download ZIP, then unzip it."),
      h("li", {}, "In Chrome / Edge / Brave open chrome://extensions and turn on Developer mode."),
      h("li", {}, "Click “Load unpacked” and choose the extension folder."),
      h("li", {}, "Reload this page."))));
}

async function start() {
  $("banner").replaceChildren();
  $("toolbar").hidden = false;
  data = (await ask("get")) || { applications: [] };
  render();
}

// ---------- list ----------
function daysLeft(d) {
  if (!d) return null;
  const ms = new Date(d + "T23:59:59") - new Date();
  return Math.ceil(ms / 86400000);
}
function deadlineChip(a) {
  const n = daysLeft(a.deadline);
  if (n == null) return h("span", { class: "chip warn" }, "No deadline set");
  if (["Submitted", "Interview", "Admitted", "Waitlisted", "Rejected", "Withdrawn"].includes(a.status))
    return h("span", { class: "chip" }, `Deadline ${a.deadline}`);
  if (n < 0) return h("span", { class: "chip bad" }, `Deadline passed ${-n}d ago`);
  return h("span", { class: `chip ${n <= 14 ? "bad" : n <= 30 ? "warn" : ""}` }, `${a.deadline} · ${n}d left`);
}
function statusChip(s) {
  const cls = { Submitted: "good", Admitted: "good", Interview: "good", Rejected: "bad", Withdrawn: "bad", "In progress": "warn" }[s] || "";
  return h("span", { class: `chip ${cls}` }, s || "Not started");
}

function render() {
  const apps = [...data.applications];
  const by = $("sort").value;
  apps.sort((a, b) => by === "school" ? a.school.localeCompare(b.school)
    : by === "status" ? STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status)
    : (a.deadline || "9999").localeCompare(b.deadline || "9999"));

  const open = apps.filter(a => !["Submitted", "Interview", "Admitted", "Waitlisted", "Rejected", "Withdrawn"].includes(a.status));
  const next = open.filter(a => daysLeft(a.deadline) >= 0).sort((a, b) => a.deadline.localeCompare(b.deadline))[0];
  $("stats").replaceChildren(
    stat(apps.length, "schools"),
    stat(apps.filter(a => a.status === "In progress").length, "in progress"),
    stat(apps.filter(a => !open.includes(a)).length, "submitted or decided"),
    stat(next ? `${daysLeft(next.deadline)}d` : "—", next ? `to ${next.school}` : "no upcoming deadline"));

  const list = $("list");
  list.replaceChildren();
  if (!apps.length) { list.append(h("p", { class: "empty" }, "No schools yet. Use “+ Add school”.")); return; }
  for (const a of apps) {
    const docs = DOCS.filter(([k]) => (a.docs?.[k] || "To do") !== "Not needed");
    const docsDone = docs.filter(([k]) => ["Done", "Sent"].includes(a.docs?.[k])).length;
    const recs = a.recommenders || [];
    const recsIn = recs.filter(r => r.status === "Submitted").length;
    const waiver = a.waiver && a.waiver !== "None" ? ` · waiver ${a.waiver.toLowerCase()}` : "";
    const last = (a.activity || [])[0];
    list.append(h("article", { class: "app" },
      h("div", { class: "top" }, h("h2", {}, a.school), statusChip(a.status)),
      h("div", { class: "meta" }, [a.degree, a.program, a.term].filter(Boolean).join(" · ") || "Program not set"),
      h("div", { class: "chips" },
        deadlineChip(a),
        h("span", { class: `chip ${docsDone === docs.length ? "good" : ""}` }, `Docs ${docsDone}/${docs.length}`),
        h("span", { class: `chip ${recs.length && recsIn === recs.length ? "good" : ""}` }, `Letters ${recsIn}/${recs.length}`),
        h("span", { class: `chip ${a.feePaid || a.waiver === "Granted" ? "good" : ""}` },
          a.feePaid ? `Fee paid ${a.feePaid}` : `Fee ${a.fee || "?"}${waiver}`)),
      last ? h("div", { class: "last" }, `Last GradFill activity ${new Date(last.t).toLocaleString()}: ${last.text}`) : null,
      h("div", { class: "acts" },
        h("button", { type: "button", class: "small", onclick: () => edit(a) }, "Edit"),
        a.portalUrl ? h("a", { class: "button small", href: a.portalUrl, target: "_blank", rel: "noopener" }, "Open portal ↗") : null)));
  }
}
const stat = (v, l) => h("div", { class: "stat" }, h("b", {}, v), h("span", {}, l));

// ---------- edit dialog ----------
function options(sel, list, value) {
  sel.replaceChildren(...list.map(o => h("option", { value: o, selected: o === value }, o)));
}
function recRow(r) {
  const st = h("select", { "aria-label": "Letter status" }); options(st, REC_STATES, r.status || "Not asked");
  const row = h("div", { class: "rec" },
    h("label", {}, "Name", h("input", { value: r.name || "", "aria-label": "Recommender name" })),
    h("label", {}, "Status", st),
    h("button", { type: "button", class: "small danger", onclick: () => row.remove() }, "Remove"));
  return row;
}
function edit(a) {
  editing = a;
  const f = $("edit");
  $("dlg-title").textContent = a ? `Edit ${a.school}` : "Add school";
  for (const k of ["school", "program", "degree", "term", "portalUrl", "deadline", "fee", "feePaid", "notes"]) f.elements[k].value = a?.[k] || "";
  options(f.elements.status, STATUSES, a?.status || "Not started");
  options(f.elements.waiver, WAIVERS, a?.waiver || "None");
  $("docs").replaceChildren(...DOCS.map(([k, label]) => {
    const s = h("select", { "data-doc": k }); options(s, DOC_STATES, a?.docs?.[k] || "To do");
    return h("label", {}, label, s);
  }));
  $("recs").replaceChildren(...(a?.recommenders || []).map(recRow));
  $("activity").replaceChildren(...((a?.activity || []).length
    ? a.activity.map(x => h("li", {}, `${new Date(x.t).toLocaleString()} — ${x.text}`))
    : [h("li", {}, "Nothing yet. Open GradFill on this school's portal to start.")]));
  const hosts = a?.portalHosts || [];
  $("hosts").replaceChildren(...(hosts.length ? [h("small", {}, `Also linked from GradFill: ${hosts.join(", ")} `),
    h("button", { type: "button", class: "small", onclick: () => { delete a.portalHosts; $("hosts").replaceChildren(h("small", {}, "Unlinked — press Save to keep this.")); } }, "Unlink")] : []));
  $("del").hidden = !a;
  $("dlg").showModal();
}
$("addRec").addEventListener("click", () => $("recs").append(recRow({})));
$("add").addEventListener("click", () => edit(null));
$("sort").addEventListener("change", render);
$("del").addEventListener("click", () => {
  if (!editing || !confirm(`Delete ${editing.school}? Its activity log goes too.`)) return;
  data.applications = data.applications.filter(x => x !== editing);
  $("dlg").close(); persist(); render();
});
$("dlg").addEventListener("close", () => {
  if ($("dlg").returnValue !== "save") return;
  const f = $("edit");
  const a = editing || { id: crypto.randomUUID(), activity: [] };
  for (const k of ["school", "program", "degree", "term", "portalUrl", "deadline", "fee", "feePaid", "notes"]) a[k] = f.elements[k].value.trim();
  a.status = f.elements.status.value;
  a.waiver = f.elements.waiver.value;
  a.docs = Object.fromEntries([...$("docs").querySelectorAll("select")].map(s => [s.dataset.doc, s.value]));
  a.recommenders = [...$("recs").querySelectorAll(".rec")].map(r => ({ name: r.querySelector("input").value.trim(), status: r.querySelector("select").value })).filter(r => r.name);
  if (!editing) data.applications.push(a);
  persist(); render();
});

// ---------- backup (tracker only; full backup with your details is in GradFill settings) ----------
$("export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ gradtrack: 1, tracker: data }, null, 2)], { type: "application/json" });
  const a = h("a", { href: URL.createObjectURL(blob), download: `gradtrack-${new Date().toISOString().slice(0, 10)}.json` });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$("import").addEventListener("change", async e => {
  try {
    const got = JSON.parse(await e.target.files[0].text());
    const t = got.tracker;
    if (!t || !Array.isArray(t.applications)) throw new Error("not a GradTrack file");
    if (!confirm(`Replace your tracker with ${t.applications.length} school(s) from this file?`)) return;
    data = t; await persist(); render();
  } catch (err) { alert(`Could not import: ${err.message}`); }
  finally { e.target.value = ""; }
});
