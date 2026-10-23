// Clicking the toolbar icon injects the review panel into the current tab only (activeTab):
// GradFill never reads a page you have not opened it on.
async function openPanel(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["schema.js", "content.js"] });
}

chrome.action.onClicked.addListener(tab => {
  openPanel(tab.id).catch(err => console.warn("GradFill cannot run on this page:", err.message));
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg && msg.type === "open-options") chrome.runtime.openOptionsPage();
  reply({ ok: true });
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") chrome.runtime.openOptionsPage();
});
