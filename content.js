chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action !== 'convertAndDownload') return;

  convertImageToWebP(msg.imageUrl, msg.maxSizeKB, msg.quality)
    .then(({ dataUrl, filename }) => {
      chrome.runtime.sendMessage({ action: 'downloadWebP', dataUrl, filename });
      sendResponse({ ok: true });
    })
    .catch(err => {
      console.error('[WebP Compressor]', err);
      sendResponse({ ok: false });
    });

  return true;
});

async function convertImageToWebP(imageUrl, maxSizeKB, quality) {
  const targetBytes = (maxSizeKB || 150) * 1024;
  const maxQuality  = (quality || 75) / 100;

  const blob        = await fetchImage(imageUrl);
  const bitmap      = await createImageBitmap(blob);
  const canvas      = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext('2d').drawImage(bitmap, 0, 0);

  const resultBlob  = await binarySearch(canvas, targetBytes, maxQuality);
  const dataUrl     = await blobToDataUrl(resultBlob);
  const filename    = buildFilename(imageUrl);

  return { dataUrl, filename };
}

async function fetchImage(url) {
  const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!res.ok) throw new Error('Fetch failed');
  return res.blob();
}

async function binarySearch(canvas, targetBytes, maxQuality) {
  // First try at maxQuality
  let blob = await canvas.convertToBlob({ type: 'image/webp', quality: maxQuality });
  if (blob.size <= targetBytes) return blob;

  let lo = 0.01, hi = maxQuality, best = blob;

  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    blob = await canvas.convertToBlob({ type: 'image/webp', quality: mid });

    if (blob.size <= targetBytes) {
      best = blob;
      lo = mid;
    } else {
      hi = mid;
    }

    if (hi - lo < 0.01) break;
  }

  return best;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function buildFilename(url) {
  try {
    const path = new URL(url).pathname;
    const last = path.split('/').filter(Boolean).pop() || '';
    const dot  = last.lastIndexOf('.');
    const base = dot !== -1 ? last.slice(0, dot) : last;

    // If base is meaningful (not empty, not just numbers/random hash-like short string)
    if (base && base.length > 2 && !/^\d+$/.test(base)) {
      return base + '_compressed.webp';
    }
  } catch {}

  // Fallback: date-time format DD-MM-YYYY_HH-MM-SS.webp
  const now = new Date();
  const dd  = String(now.getDate()).padStart(2,'0');
  const mm  = String(now.getMonth()+1).padStart(2,'0');
  const yyyy = now.getFullYear();
  const hh  = String(now.getHours()).padStart(2,'0');
  const min = String(now.getMinutes()).padStart(2,'0');
  const ss  = String(now.getSeconds()).padStart(2,'0');

  return `${dd}-${mm}-${yyyy}_${hh}-${min}-${ss}.webp`;
}
