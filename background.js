// ── Create context menu on install ──────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'saveAsWebP',
    title: 'Save as WebP',
    contexts: ['image']
  });
});

// ── Handle right-click → Save as WebP ───────────────────
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'saveAsWebP') return;

  const imageUrl = info.srcUrl;
  if (!imageUrl) return;

  // Send message to a temporary offscreen-like approach via content script
  // We'll inject a content script to do the conversion in page context
  chrome.tabs.sendMessage(tab.id, {
    action: 'convertAndDownload',
    imageUrl: imageUrl
  }, (response) => {
    if (chrome.runtime.lastError) {
      // Content script not ready, inject it first
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      }, () => {
        // Retry after injection
        setTimeout(() => {
          chrome.tabs.sendMessage(tab.id, {
            action: 'convertAndDownload',
            imageUrl: imageUrl
          });
        }, 300);
      });
    }
  });
});

// ── Listen for download requests from content script ────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'downloadWebP') {
    chrome.downloads.download({
      url: msg.dataUrl,
      filename: msg.filename,
      saveAs: false
    });
    sendResponse({ ok: true });
  }
  return true;
});
