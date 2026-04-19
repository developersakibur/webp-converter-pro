// ── State ────────────────────────────────────────────────
let files      = [];
let zipEnabled = true;

// ── DOM ──────────────────────────────────────────────────
const drop          = document.getElementById('drop');
const fileIn        = document.getElementById('fileIn');
const fileList      = document.getElementById('fileList');
const qualitySlider = document.getElementById('qualitySlider');
const qVal          = document.getElementById('qVal');
const maxSizeInp    = document.getElementById('maxSize');
const zipToggle     = document.getElementById('zipToggle');
const convertBtn    = document.getElementById('convertBtn');
const clearBtn      = document.getElementById('clearBtn');
const summary       = document.getElementById('summary');

// ── Load saved settings ───────────────────────────────────
chrome.storage.local.get(['maxSizeKB','quality'], r => {
  if (r.maxSizeKB) maxSizeInp.value    = r.maxSizeKB;
  if (r.quality)   { qualitySlider.value = r.quality; qVal.textContent = r.quality + '%'; }
});

function saveSettings() {
  chrome.storage.local.set({
    maxSizeKB: parseInt(maxSizeInp.value)    || 150,
    quality:   parseInt(qualitySlider.value) || 75
  });
}

// ── Quality slider ────────────────────────────────────────
qualitySlider.addEventListener('input', () => {
  qVal.textContent = qualitySlider.value + '%';
  saveSettings();
});
maxSizeInp.addEventListener('change', saveSettings);

// ── ZIP toggle ────────────────────────────────────────────
zipToggle.addEventListener('click', () => {
  zipEnabled = !zipEnabled;
  zipToggle.classList.toggle('on', zipEnabled);
});

// ── File input / drop ─────────────────────────────────────
fileIn.addEventListener('change', e => { addFiles(e.target.files); fileIn.value=''; });
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', e => {
  e.preventDefault(); drop.classList.remove('over');
  addFiles(e.dataTransfer.files);
});

function addFiles(raw) {
  Array.from(raw)
    .filter(f => f.type.startsWith('image/'))
    .forEach(f => {
      if (!files.find(x => x.file.name===f.name && x.file.size===f.size))
        files.push({ file:f, status:'pending', blob:null, finalSize:0 });
    });
  render(); updateBtn();
}

// ── Render list ───────────────────────────────────────────
function render() {
  if (!files.length) {
    fileList.innerHTML = '<div class="empty">No images selected yet</div>';
    summary.classList.remove('show'); return;
  }
  fileList.innerHTML = '';
  files.forEach((f, i) => {
    const el = document.createElement('div');
    el.className='fi'; el.id=`fi${i}`;
    el.innerHTML = `
      <img class="fi-thumb" id="th${i}" src="" alt=""/>
      <div class="fi-info">
        <div class="fi-name">${esc(outName(f.file.name))}</div>
        <div class="fi-stat" id="st${i}">${fmt(f.file.size)}</div>
        <div class="fi-prog"><div class="fi-fill" id="pr${i}"></div></div>
      </div>
      <button class="fi-rm" data-i="${i}">×</button>`;
    fileList.appendChild(el);
    const r = new FileReader();
    r.onload = e => { const t=document.getElementById(`th${i}`); if(t) t.src=e.target.result; };
    r.readAsDataURL(f.file);
  });
  fileList.querySelectorAll('.fi-rm').forEach(b => b.addEventListener('click', e => {
    files.splice(+e.target.dataset.i, 1); render(); updateBtn();
  }));
  updateSummary();
}

function updateItem(i) {
  const f=files[i];
  const st=document.getElementById(`st${i}`);
  const pr=document.getElementById(`pr${i}`);
  if (!st) return;
  if (f.status==='working') {
    st.style.color='#ffcc44'; st.textContent='⏳ Processing...'; pr.style.width='50%';
  } else if (f.status==='done') {
    const pct = Math.round((1 - f.finalSize/f.file.size)*100);
    st.style.color='#3ecfcf';
    st.textContent = `✓ ${fmt(f.finalSize)}  (${pct > 0 ? pct+'% saved' : 'no reduction'})`;
    pr.style.width='100%';
  } else if (f.status==='error') {
    st.style.color='#ff6b6b'; st.textContent='✗ Failed';
    pr.style.width='100%'; pr.style.background='#ff6b6b';
  }
}

function updateSummary() {
  const done = files.filter(f => f.status==='done');
  if (!done.length) { summary.classList.remove('show'); return; }
  const orig  = done.reduce((s,f)=>s+f.file.size, 0);
  const final = done.reduce((s,f)=>s+f.finalSize,  0);
  document.getElementById('sCount').textContent = done.length;
  document.getElementById('sOrig').textContent  = fmt(orig);
  document.getElementById('sFinal').textContent = fmt(final);
  document.getElementById('sSaved').textContent = Math.round((1-final/orig)*100)+'%';
  summary.classList.add('show');
}

function updateBtn() { convertBtn.disabled = !files.length; }

// ── Clear ─────────────────────────────────────────────────
clearBtn.addEventListener('click', () => { files=[]; render(); updateBtn(); });

// ── Convert & Download ────────────────────────────────────
convertBtn.addEventListener('click', async () => {
  convertBtn.disabled   = true;
  convertBtn.textContent = '⏳ Processing...';
  saveSettings();

  const maxBytes  = (parseInt(maxSizeInp.value)    || 150) * 1024;
  const maxQuality = (parseInt(qualitySlider.value) || 75)  / 100;

  for (let i=0; i<files.length; i++) {
    const f = files[i];
    if (f.status==='done') continue;
    f.status='working'; updateItem(i);
    try {
      f.blob      = await compressToWebP(f.file, maxBytes, maxQuality);
      f.finalSize = f.blob.size;
      f.status    = 'done';
    } catch { f.status='error'; }
    updateItem(i);
  }

  updateSummary();
  convertBtn.textContent = '⚡ Convert & Download';
  convertBtn.disabled    = false;

  const done = files.filter(f => f.status==='done');
  if (!done.length) return;

  if (zipEnabled && done.length > 1) {
    await downloadZip(done);
  } else {
    done.forEach(f => dlBlob(f.blob, outName(f.file.name)));
  }
});

// ── Core: compress image to WebP ──────────────────────────
function compressToWebP(file, targetBytes, maxQuality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      binarySearch(canvas, targetBytes, maxQuality, resolve, reject);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load')); };
    img.src = url;
  });
}

function binarySearch(canvas, targetBytes, maxQuality, resolve, reject) {
  // First try at maxQuality — maybe it already fits
  canvas.toBlob(firstBlob => {
    if (!firstBlob) { reject(new Error('blob')); return; }
    if (firstBlob.size <= targetBytes) { resolve(firstBlob); return; }

    // Need to go lower — binary search from 0.01 to maxQuality
    let lo = 0.01, hi = maxQuality, best = firstBlob, iter = 0;

    function step(q) {
      canvas.toBlob(blob => {
        if (!blob) { resolve(best); return; }
        iter++;

        if (blob.size <= targetBytes) {
          best = blob; // fits — try higher quality
          lo   = q;
        } else {
          hi = q; // too big — go lower
        }

        if (iter >= 20 || hi - lo < 0.01) { resolve(best); return; }
        step((lo + hi) / 2);
      }, 'image/webp', q);
    }

    step((lo + hi) / 2);
  }, 'image/webp', maxQuality);
}

// ── ZIP with local JSZip ──────────────────────────────────
async function downloadZip(done) {
  const zip = new JSZip();
  done.forEach(f => zip.file(outName(f.file.name), f.blob));
  const zipBlob = await zip.generateAsync({
    type:'blob', compression:'DEFLATE', compressionOptions:{level:6}
  });
  dlBlob(zipBlob, 'webp_compressed_images.zip');
}

// ── Helpers ───────────────────────────────────────────────
function dlBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

function outName(original) {
  const dot  = original.lastIndexOf('.');
  const base = dot !== -1 ? original.slice(0, dot) : original;
  return base + '_compressed.webp';
}

function fmt(bytes) {
  if (bytes < 1024)    return bytes + ' B';
  if (bytes < 1048576) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/1048576).toFixed(2) + ' MB';
}

function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
