// ── State ──────────────────────────────────────────────
let files = []; // { file, name, origSize, status, blob, finalSize }
let zipEnabled = true;
let sizeTargetEnabled = false;

// ── DOM refs ───────────────────────────────────────────
const fileInput     = document.getElementById('fileInput');
const dropZone      = document.getElementById('dropZone');
const fileList      = document.getElementById('fileList');
const emptyHint     = document.getElementById('emptyHint');
const qualitySlider = document.getElementById('qualitySlider');
const qualityVal    = document.getElementById('qualityVal');
const sizeToggle    = document.getElementById('sizeToggle');
const sizeInputWrap = document.getElementById('sizeInputWrap');
const maxSizeInput  = document.getElementById('maxSizeInput');
const zipToggle     = document.getElementById('zipToggle');
const convertBtn    = document.getElementById('convertBtn');
const clearBtn      = document.getElementById('clearBtn');
const summary       = document.getElementById('summary');

// ── Quality Slider ─────────────────────────────────────
qualitySlider.addEventListener('input', () => {
  qualityVal.textContent = qualitySlider.value + '%';
});

// ── Toggles ────────────────────────────────────────────
sizeToggle.addEventListener('click', () => {
  sizeTargetEnabled = !sizeTargetEnabled;
  sizeToggle.classList.toggle('on', sizeTargetEnabled);
  sizeInputWrap.style.display = sizeTargetEnabled ? 'flex' : 'none';
});

zipToggle.addEventListener('click', () => {
  zipEnabled = !zipEnabled;
  zipToggle.classList.toggle('on', zipEnabled);
});

// ── File Input / Drop Zone ─────────────────────────────
fileInput.addEventListener('change', e => handleFiles(e.target.files));

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  handleFiles(e.dataTransfer.files);
});

function handleFiles(rawFiles) {
  const imageFiles = Array.from(rawFiles).filter(f => f.type.startsWith('image/'));
  if (!imageFiles.length) return;

  imageFiles.forEach(f => {
    // avoid duplicates by name+size
    const dup = files.find(x => x.file.name === f.name && x.file.size === f.size);
    if (!dup) {
      files.push({ file: f, name: f.name, origSize: f.size, status: 'pending', blob: null, finalSize: 0 });
    }
  });

  renderList();
  updateConvertBtn();
  fileInput.value = '';
}

// ── Render File List ───────────────────────────────────
function renderList() {
  if (files.length === 0) {
    fileList.innerHTML = '<div class="empty-hint" id="emptyHint">No images selected yet</div>';
    summary.classList.remove('visible');
    return;
  }

  fileList.innerHTML = '';
  files.forEach((f, i) => {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.id = `fi-${i}`;

    const statusColor = f.status === 'done' ? '#3ecfcf' : f.status === 'error' ? '#ff6b6b' : '#6666888';
    const statusText  = f.status === 'done'
      ? `✓ ${formatSize(f.finalSize)} (${Math.round((1 - f.finalSize / f.origSize) * 100)}% saved)`
      : f.status === 'error' ? '✗ Failed'
      : f.status === 'working' ? '⏳ Processing...'
      : `${formatSize(f.origSize)}`;

    item.innerHTML = `
      <img class="file-thumb" id="thumb-${i}" src="" alt="" />
      <div class="file-info">
        <div class="file-name">${escHtml(outputName(f.file.name))}</div>
        <div class="file-status" style="color:${statusColor}">${statusText}</div>
        <div class="progress-bar"><div class="progress-fill" id="prog-${i}" style="width:${f.status==='done'?'100':f.status==='working'?'50':'0'}%"></div></div>
      </div>
      <button class="file-remove" data-idx="${i}" title="Remove">×</button>
    `;

    fileList.appendChild(item);

    // load thumbnail
    const reader = new FileReader();
    reader.onload = e => {
      const img = document.getElementById(`thumb-${i}`);
      if (img) img.src = e.target.result;
    };
    reader.readAsDataURL(f.file);
  });

  // remove buttons
  fileList.querySelectorAll('.file-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      const idx = parseInt(e.target.dataset.idx);
      files.splice(idx, 1);
      renderList();
      updateConvertBtn();
    });
  });

  updateSummary();
}

function outputName(originalName) {
  const dotIdx = originalName.lastIndexOf('.');
  const base = dotIdx !== -1 ? originalName.substring(0, dotIdx) : originalName;
  return base + '_compressed.webp';
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function updateConvertBtn() {
  convertBtn.disabled = files.length === 0;
}

function updateSummary() {
  const done = files.filter(f => f.status === 'done');
  if (done.length === 0) { summary.classList.remove('visible'); return; }

  const origTotal  = done.reduce((s, f) => s + f.origSize, 0);
  const finalTotal = done.reduce((s, f) => s + f.finalSize, 0);
  const savedPct   = Math.round((1 - finalTotal / origTotal) * 100);

  document.getElementById('sumCount').textContent    = done.length;
  document.getElementById('sumOriginal').textContent = formatSize(origTotal);
  document.getElementById('sumFinal').textContent    = formatSize(finalTotal);
  document.getElementById('sumSaved').textContent    = savedPct + '%';
  summary.classList.add('visible');
}

// ── Clear ──────────────────────────────────────────────
clearBtn.addEventListener('click', () => {
  files = [];
  renderList();
  updateConvertBtn();
});

// ── Convert ────────────────────────────────────────────
convertBtn.addEventListener('click', async () => {
  convertBtn.disabled = true;
  convertBtn.textContent = '⏳ Processing...';

  const quality    = parseInt(qualitySlider.value) / 100;
  const maxSizeKB  = sizeTargetEnabled ? parseInt(maxSizeInput.value) : null;

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (f.status === 'done') continue;

    f.status = 'working';
    updateItemUI(i);

    try {
      const blob = await compressToWebP(f.file, quality, maxSizeKB);
      f.blob      = blob;
      f.finalSize = blob.size;
      f.status    = 'done';
    } catch (err) {
      f.status = 'error';
    }

    updateItemUI(i);
  }

  updateSummary();
  convertBtn.textContent = '⚡ Convert & Download';
  convertBtn.disabled = false;

  // now download
  const done = files.filter(f => f.status === 'done');
  if (done.length === 0) return;

  if (zipEnabled && done.length > 1) {
    await downloadAsZip(done);
  } else {
    done.forEach(f => downloadBlob(f.blob, outputName(f.file.name)));
  }
});

function updateItemUI(i) {
  const f    = files[i];
  const item = document.getElementById(`fi-${i}`);
  if (!item) return;

  const statusEl = item.querySelector('.file-status');
  const progEl   = item.querySelector('.progress-fill');

  if (f.status === 'working') {
    statusEl.style.color   = '#ffcc44';
    statusEl.textContent   = '⏳ Processing...';
    progEl.style.width     = '60%';
  } else if (f.status === 'done') {
    statusEl.style.color   = '#3ecfcf';
    statusEl.textContent   = `✓ ${formatSize(f.finalSize)} (${Math.round((1 - f.finalSize / f.origSize) * 100)}% saved)`;
    progEl.style.width     = '100%';
  } else if (f.status === 'error') {
    statusEl.style.color   = '#ff6b6b';
    statusEl.textContent   = '✗ Failed';
    progEl.style.width     = '100%';
    progEl.style.background = '#ff6b6b';
  }
}

// ── Core: Compress to WebP ─────────────────────────────
async function compressToWebP(file, quality, maxSizeKB) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      if (maxSizeKB) {
        // Binary search quality to hit target size
        binarySearchQuality(canvas, maxSizeKB * 1024, quality, resolve, reject);
      } else {
        canvas.toBlob(blob => {
          if (blob) resolve(blob);
          else reject(new Error('Conversion failed'));
        }, 'image/webp', quality);
      }
    };

    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Load failed')); };
    img.src = url;
  });
}

function binarySearchQuality(canvas, targetBytes, initialQuality, resolve, reject) {
  let lo = 0.05, hi = initialQuality, best = null, iter = 0;

  function attempt(q) {
    canvas.toBlob(blob => {
      if (!blob) { reject(new Error('Blob failed')); return; }
      iter++;

      if (blob.size <= targetBytes) {
        best = blob;
        if (hi - lo < 0.03 || iter >= 10) { resolve(best); return; }
        lo = q;
        attempt((lo + hi) / 2);
      } else {
        if (iter >= 10) {
          // Even at lowest quality still too big — return best effort
          resolve(best || blob);
          return;
        }
        hi = q;
        attempt((lo + hi) / 2);
      }
    }, 'image/webp', q);
  }

  // First try initial quality
  canvas.toBlob(blob => {
    if (!blob) { reject(new Error('Blob failed')); return; }
    if (blob.size <= targetBytes) { resolve(blob); return; }
    best = blob;
    attempt((lo + hi) / 2);
  }, 'image/webp', initialQuality);
}

// ── Download helpers ───────────────────────────────────
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadAsZip(doneFiles) {
  // Load JSZip from CDN via fetch-as-blob trick using importScripts alternative
  // We'll create a minimal zip manually using the ZIP format spec
  // For simplicity, use the Web Streams approach with a data URL

  try {
    const zipBlob = await buildZip(doneFiles);
    downloadBlob(zipBlob, 'compressed_webp_images.zip');
  } catch (e) {
    // Fallback: download individually
    doneFiles.forEach(f => downloadBlob(f.blob, outputName(f.file.name)));
  }
}

// ── Minimal ZIP builder (no external lib needed) ───────
async function buildZip(doneFiles) {
  // Load JSZip dynamically
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');

  const zip = new JSZip();
  doneFiles.forEach(f => {
    zip.file(outputName(f.file.name), f.blob);
  });

  return await zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload  = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}
