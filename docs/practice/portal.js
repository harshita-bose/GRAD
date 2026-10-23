// Practice portal: values are kept only in this tab's sessionStorage and never sent anywhere.
(function () {
  const KEY = "practice-application";
  const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const save = data => { try { sessionStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* private mode */ } };

  function labelOf(el) {
    const q = el.closest(".form_question, fieldset");
    const l = q && q.querySelector(".form_label, label.block, legend");
    return (l ? l.textContent : el.name).replace(/\*/g, "").trim();
  }

  const form = document.querySelector("form[data-next]");
  if (form) {
    const data = load();
    for (const el of form.elements) {  // restore earlier answers when going Back
      if (!el.name || !(el.name in data) || el.type === "file") continue;
      if (el.type === "radio" || el.type === "checkbox") el.checked = data[el.name].value === el.value;
      else el.value = data[el.name].value;
    }
    form.querySelector("[data-continue]").addEventListener("click", () => {
      if (!form.reportValidity()) return;
      const d = load();
      for (const el of form.elements) {
        if (!el.name) continue;
        if ((el.type === "radio" || el.type === "checkbox") && !el.checked) continue;
        const value = el.type === "file" ? [...el.files].map(f => f.name).join(", ")
                    : el.tagName === "SELECT" ? el.options[el.selectedIndex].text : el.value;
        d[el.name] = { label: labelOf(el), value };
      }
      save(d);
      location.href = form.dataset.next;
    });
  }

  const table = document.getElementById("summary");
  if (table) {
    const rows = Object.values(load());
    table.innerHTML = rows.length ? "" : "<tr><td colspan=2>Nothing saved yet — start from page 1.</td></tr>";
    for (const r of rows) {
      const tr = table.insertRow();
      tr.insertCell().textContent = r.label;
      tr.insertCell().textContent = r.value || "—";
    }
    document.getElementById("submit").addEventListener("click", () => {
      document.getElementById("done").style.display = "block";
      document.body.dataset.submitted = "yes";
    });
  }
})();
