// Runs only on the tracker site. Lets that page read and write the *tracker* data held by the
// extension. Your personal profile is never exposed to any web page.
(() => {
  const KEY = "tracker";
  const post = msg => window.postMessage({ source: "gradfill-ext", ...msg }, location.origin);

  window.addEventListener("message", async ev => {
    if (ev.source !== window || ev.origin !== location.origin) return;
    const m = ev.data;
    if (!m || m.source !== "gradfill-page") return;
    try {
      if (m.type === "get") {
        const got = await chrome.storage.local.get(KEY);
        post({ id: m.id, ok: true, data: got[KEY] || null });
      } else if (m.type === "set") {
        if (!m.data || !Array.isArray(m.data.applications)) throw new Error("bad tracker data");
        await chrome.storage.local.set({ [KEY]: m.data });
        post({ id: m.id, ok: true });
      } else if (m.type === "hello") {
        post({ type: "hello", version: chrome.runtime.getManifest().version });
      }
    } catch (e) {
      post({ id: m.id, ok: false, error: String(e.message || e) });
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[KEY]) post({ type: "changed", data: changes[KEY].newValue || null });
  });

  post({ type: "hello", version: chrome.runtime.getManifest().version });
})();
