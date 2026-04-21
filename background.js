chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'saveAsWebP',
    title: 'Save as WebP',
    contexts: ['image']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'saveAsWebP') return;
  if (!info.srcUrl) return;

  // Load settings then send to content script
  chrome.storage.local.get(['maxSizeKB', 'quality'], (stored) => {
    const payload = {
      action:    'convertAndDownload',
      imageUrl:  info.srcUrl,
      maxSizeKB: stored.maxSizeKB || 50,
      quality:   stored.quality   || 25
    };

    chrome.tabs.sendMessage(tab.id, payload, (res) => {
      if (chrome.runtime.lastError) {
        chrome.scripting.executeScript(
          { target: { tabId: tab.id }, files: ['content.js'] },
          () => setTimeout(() => chrome.tabs.sendMessage(tab.id, payload), 300)
        );
      }
    });
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'downloadWebP') {
    chrome.downloads.download({ url: msg.dataUrl, filename: msg.filename, saveAs: false });
    sendResponse({ ok: true });
  }
  return true;
});
