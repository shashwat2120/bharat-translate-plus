// Bharat Translate+ — background service worker
// Opens the side panel from the toolbar icon and adds a right-click menu item.

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error(err));

  chrome.contextMenus.create({
    id: "bt-selection",
    title: "Translate & simplify with Bharat Translate+",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "bt-selection" || !tab) return;
  // Open the panel first, while Chrome still counts this as a user click.
  chrome.sidePanel.open({ tabId: tab.id }).catch((err) => console.error(err));
  // Hand the selected text to the panel.
  chrome.storage.session.set({
    pendingSelection: { text: info.selectionText || "", ts: Date.now() },
  });
});
