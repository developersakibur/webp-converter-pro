// content.js — injected into the active tab when user right-clicks an image

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action !== 'convertAndDownload') return;

  convertImageToWebP(msg.imageUrl)
    .then(({ dataUrl, filename }) => {
      chrome.runtime.sendMessage({
        action: 'downloadWebP',
        dataUrl,
        filename
      });
      sendResponse({ ok: true });
    })
    .catch(err => {
      console.error('[WebP Compressor] Error:', err);
      sendResponse({ ok: false, error: err.message });
    });

  return true; // keep message channel open for async
});

async function convertImageToWebP(imageUrl) {
  // Load max size setting from storage
  const stored = await new Promise(resolve =>
    chrome.storage.local.get(['maxSizeKB'], resolve)
  );
  const maxSizeKB = stored.maxSizeKB || 150;

  // Fetch the image as blob (works for same-origin and permissioned cross-origin)
  const blob = await fetchImage(imageUrl);
  const imageBitmap = await createImageBitmap(blob);

  const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageBitmap, 0, 0);

  // Binary search to hit target size
  const resultBlob = await compressToTarget(canvas, maxSizeKB * 1024);

  const dataUrl = await blobToDataUrl(resultBlob);
  const filename = buildFilename(imageUrl);

  return { dataUrl, filename };
}

async function fetchImage(url) {
  const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!res.ok) throw new Error('Fetch failed: ' + res.status);
  return res.blob();
}

async function compressToTarget(canvas, targetBytes) {
  // Try from quality 0.9 down; binary search
  let lo = 0.05, hi = 0.92, best = null;

  // First pass at hi quality
  let blob = await canvas.convertToBlob({ type: 'image/webp', quality: hi });
  if (blob.size <= targetBytes) return blob;

  best = blob;

  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    blob = await canvas.convertToBlob({ type: 'image/webp', quality: mid });

    if (blob.size <= targetBytes) {
      best = blob;
      lo = mid;
    } else {
      hi = mid;
    }

    if (hi - lo < 0.02) break;
  }

  return best;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function buildFilename(url) {
  try {
    const path = new URL(url).pathname;
    const parts = path.split('/');
    const last = parts[parts.length - 1] || 'image';
    const dotIdx = last.lastIndexOf('.');
    const base = dotIdx !== -1 ? last.substring(0, dotIdx) : last;
    return base + '_compressed.webp';
  } catch {
    return 'image_compressed.webp';
  }
}
