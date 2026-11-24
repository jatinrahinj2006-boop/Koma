// ============================================================
// PDF Studio — pdf-maker.js (v2.2 Robust Multi-Folder & Previews)
// ============================================================

// ── State ────────────────────────────────────────────────────
let allChapters            = [];   // [{ name, customTitle, images:[{name,blob,hash,url}], excluded:Set<hash>, historyMatch:null, isExpanded:true }]
let selectedIds            = new Set(); // Stores chapter NAMES (strings) — survives re-sorts
let isCompiling            = false;
let pdfHistoryList         = [];
let scanlationBannerHashes = new Set();
let draggedIdx             = null;

// Lightbox modal state
let activeLightboxChapter  = null;
let activeLightboxPageIdx  = 0;

// ── Supported image extensions ────────────────────────────────
const IMAGE_EXTS = new Set([
  'jpg','jpeg','png','gif','webp','bmp','tiff','tif','avif','svg'
]);

// ── Metadata & Junk File Filter (Filters __MACOSX, ._*, .DS_Store, Thumbs.db) ─
function isJunkOrMetadata(path) {
  if (!path) return true;
  const clean = path.replace(/\\/g, '/');
  const parts = clean.split('/').filter(Boolean);

  for (const part of parts) {
    if (part === '__MACOSX' || part === '.DS_Store' || part === 'Thumbs.db' || part === '.git') {
      return true;
    }
  }

  const filename = parts[parts.length - 1];
  if (filename.startsWith('._') || filename.startsWith('.')) {
    return true;
  }
  const lower = filename.toLowerCase();
  if (lower === 'thumbs.db' || lower === 'desktop.ini') {
    return true;
  }

  return false;
}

function isImageFile(name) {
  if (!name || isJunkOrMetadata(name)) return false;
  const ext = name.split('.').pop().toLowerCase();
  return IMAGE_EXTS.has(ext);
}

// ── DOM refs ──────────────────────────────────────────────────
const btnBrowseZip        = document.getElementById('btn-browse-zip');
const zipFileInput        = document.getElementById('zip-file-input');
const btnBrowseFolder     = document.getElementById('btn-browse-folder');
const folderFileInput     = document.getElementById('folder-file-input');
const btnBrowseImages     = document.getElementById('btn-browse-images');
const imageFileInput      = document.getElementById('image-file-input');
const btnDropzoneFolder   = document.getElementById('btn-dropzone-folder');
const chaptersContainer   = document.getElementById('chapters-container');
const dropzoneEmpty       = document.getElementById('dropzone-empty');
const compileBtn          = document.getElementById('btn-compile-pdf');
const clearBtn            = document.getElementById('btn-clear-all');
const selectAllBtn        = document.getElementById('btn-select-all');
const deselectAllBtn      = document.getElementById('btn-deselect-all');
const reverseBtn          = document.getElementById('btn-reverse-all');
const btnExpandAll        = document.getElementById('btn-expand-all');
const btnCollapseAll      = document.getElementById('btn-collapse-all');

const seriesNameInput     = document.getElementById('series-name-input');
const outputModeEl        = document.getElementById('output-mode-select');
const volumeSplitGroup    = document.getElementById('volume-split-group');
const volumeSplitCountEl  = document.getElementById('volume-split-count');
const namingTemplateSelect= document.getElementById('naming-template-select');
const qualityEl           = document.getElementById('quality-select');
const normalizeEl         = document.getElementById('normalize-width-select');
const einkEl              = document.getElementById('eink-grayscale-toggle');
const webtoonSliceEl      = document.getElementById('webtoon-slice-toggle');

const progressWrap        = document.getElementById('progress-wrap');
const progressFill        = document.getElementById('progress-fill');
const progressStatus      = document.getElementById('progress-status');
const progressPct         = document.getElementById('progress-percent');
const progressSub         = document.getElementById('progress-sub');

const statChapters        = document.getElementById('stat-chapters');
const statPages           = document.getElementById('stat-pages');
const statSelected        = document.getElementById('stat-selected');
const statDupPill         = document.getElementById('stat-dup-pill');
const statDups            = document.getElementById('stat-dups');
const statHistPill        = document.getElementById('stat-hist-pill');
const statHist            = document.getElementById('stat-hist');

const dupSection          = document.getElementById('duplicate-sidebar-section');
const dupBadgeCount       = document.getElementById('dup-badge-count');
const autoExcludeDups     = document.getElementById('btn-auto-exclude-dups');
const creditBannerWrap    = document.getElementById('credit-banner-wrap');
const btnAutoExcludeCredits = document.getElementById('btn-auto-exclude-credits');

const historyDupCard      = document.getElementById('history-dup-card');
const historyDupCount     = document.getElementById('history-dup-count');
const btnSkipHistoryCompiled = document.getElementById('btn-skip-history-compiled');
const toggleHistoryList   = document.getElementById('toggle-history-list');
const historyItemsList    = document.getElementById('pdf-history-items');
const btnClearPdfHistory  = document.getElementById('btn-clear-pdf-history');

// Lightbox DOM refs
const lightboxModal       = document.getElementById('lightbox-modal');
const lightboxBackdrop    = document.getElementById('lightbox-backdrop');
const lightboxClose       = document.getElementById('lightbox-close');
const lightboxImg         = document.getElementById('lightbox-img');
const lightboxTitle       = document.getElementById('lightbox-title');
const lightboxCounter     = document.getElementById('lightbox-counter');
const lightboxPrev        = document.getElementById('lightbox-prev');
const lightboxNext        = document.getElementById('lightbox-next');

// ── Init & Event Listeners ────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadPdfHistory();
  setupDragAndDrop();
});

if (zipFileInput) {
  zipFileInput.addEventListener('change', async () => {
    if (zipFileInput.files && zipFileInput.files.length > 0) {
      const files = Array.from(zipFileInput.files);
      try {
        await handleFiles(files);
      } finally {
        zipFileInput.value = '';
      }
    }
  });
}

if (folderFileInput) {
  folderFileInput.addEventListener('change', async () => {
    if (folderFileInput.files && folderFileInput.files.length > 0) {
      const files = Array.from(folderFileInput.files);
      try {
        await handleFiles(files);
      } finally {
        folderFileInput.value = '';
      }
    }
  });
}

if (imageFileInput) {
  imageFileInput.addEventListener('change', async () => {
    if (imageFileInput.files && imageFileInput.files.length > 0) {
      const files = Array.from(imageFileInput.files);
      try {
        await handleFiles(files);
      } finally {
        imageFileInput.value = '';
      }
    }
  });
}

if (btnBrowseZip && zipFileInput) {
  btnBrowseZip.addEventListener('click', (e) => {
    e.preventDefault();
    zipFileInput.click();
  });
}

if (btnBrowseFolder) {
  btnBrowseFolder.addEventListener('click', (e) => {
    e.preventDefault();
    openParentFolderPicker();
  });
}

if (btnBrowseImages && imageFileInput) {
  btnBrowseImages.addEventListener('click', (e) => {
    e.preventDefault();
    imageFileInput.click();
  });
}

if (btnDropzoneFolder) {
  btnDropzoneFolder.addEventListener('click', (e) => {
    e.preventDefault();
    openParentFolderPicker();
  });
}

if (compileBtn)     compileBtn.addEventListener('click', startCompilation);
if (clearBtn)       clearBtn.addEventListener('click', clearAll);
if (selectAllBtn)   selectAllBtn.addEventListener('click', () => setSelectAll(true));
if (deselectAllBtn) deselectAllBtn.addEventListener('click', () => setSelectAll(false));
if (reverseBtn)     reverseBtn.addEventListener('click', reverseChapters);

if (btnExpandAll)   btnExpandAll.addEventListener('click', () => setAllExpanded(true));
if (btnCollapseAll) btnCollapseAll.addEventListener('click', () => setAllExpanded(false));

if (autoExcludeDups) autoExcludeDups.addEventListener('click', excludeAllDuplicates);
if (btnAutoExcludeCredits) btnAutoExcludeCredits.addEventListener('click', excludeAllCreditBanners);
if (btnSkipHistoryCompiled) btnSkipHistoryCompiled.addEventListener('click', skipHistoryCompiledChapters);
if (btnClearPdfHistory) btnClearPdfHistory.addEventListener('click', clearPdfHistory);

if (outputModeEl) {
  outputModeEl.addEventListener('change', () => {
    if (volumeSplitGroup) {
      volumeSplitGroup.style.display = outputModeEl.value === 'volume' ? 'block' : 'none';
    }
  });
}

if (toggleHistoryList && historyItemsList) {
  toggleHistoryList.addEventListener('click', (e) => {
    if (e.target === btnClearPdfHistory) return;
    const isHidden = historyItemsList.style.display === 'none';
    historyItemsList.style.display = isHidden ? 'block' : 'none';
    const icon = document.getElementById('history-expand-icon');
    if (icon) icon.textContent = isHidden ? '▲' : '▼';
  });
}

// Lightbox listeners
if (lightboxClose)    lightboxClose.addEventListener('click', closeLightbox);
if (lightboxBackdrop) lightboxBackdrop.addEventListener('click', closeLightbox);
if (lightboxPrev)     lightboxPrev.addEventListener('click', () => stepLightbox(-1));
if (lightboxNext)     lightboxNext.addEventListener('click', () => stepLightbox(1));

document.addEventListener('keydown', (e) => {
  if (lightboxModal && !lightboxModal.classList.contains('hidden')) {
    if (e.key === 'ArrowLeft')  stepLightbox(-1);
    if (e.key === 'ArrowRight') stepLightbox(1);
    if (e.key === 'Escape')     closeLightbox();
  }
});

// ── Open Native Folder Picker (Parent Folder with Sub-Folders) ──
function openParentFolderPicker() {
  if (folderFileInput) {
    folderFileInput.click();
  }
}

async function handleDirectoryHandle(dirHandle) {
  showProgress(true);
  setStatus(`Scanning parent folder "${dirHandle.name}"…`);
  setProgress(5, `Opening ${dirHandle.name}…`);

  // Auto-fill Series Title from the parent folder name
  if (seriesNameInput && (!seriesNameInput.value.trim() || seriesNameInput.value.trim().toLowerCase() === 'comics')) {
    seriesNameInput.value = dirHandle.name.replace(/[-_]/g, ' ').trim();
  }

  const items = [];

  async function traverseDirHandle(dHandle, currentPath = '') {
    // Skip macOS metadata folders entirely
    if (dHandle.name === '__MACOSX' || dHandle.name.startsWith('._') || dHandle.name.startsWith('.')) return;

    const entries = [];
    for await (const entry of dHandle.values()) {
      entries.push(entry);
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    for (const entry of entries) {
      // Skip hidden / resource-fork entries
      if (entry.name.startsWith('.') || entry.name.startsWith('._')) continue;

      const fullPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
      if (entry.kind === 'directory') {
        if (entry.name !== '__MACOSX') {
          await traverseDirHandle(entry, fullPath);
        }
      } else if (entry.kind === 'file') {
        if (/\.(zip|cbz)$/i.test(entry.name) || isImageFile(entry.name)) {
          const file = await entry.getFile();
          if (file.size >= 100) {  // skip resource-fork stubs
            items.push({ file, name: entry.name, path: `${dirHandle.name}/${fullPath}` });
          }
        }
      }
    }
  }

  try {
    await traverseDirHandle(dirHandle, '');
    if (items.length > 0) {
      await handleFiles(items);
    } else {
      setStatus(`No images or archives found in "${dirHandle.name}".`);
    }
  } catch (err) {
    console.error('Failed reading directory handle:', err);
    setStatus(`Failed reading folder: ${err.message}`);
  } finally {
    showProgress(false);
  }
}

// ── Global Drag & Drop Engine (Multi-Folder & Multi-File) ─────
function setupDragAndDrop() {
  window.addEventListener('dragover', (e) => {
    const viewStudio = document.getElementById('view-studio');
    if (viewStudio && viewStudio.style.display === 'none') return;

    if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      if (dropzoneEmpty) dropzoneEmpty.classList.add('drag-over');
    }
  });

  window.addEventListener('dragleave', (e) => {
    const viewStudio = document.getElementById('view-studio');
    if (viewStudio && viewStudio.style.display === 'none') return;

    if (e.clientX <= 0 || e.clientY <= 0) {
      if (dropzoneEmpty) dropzoneEmpty.classList.remove('drag-over');
    }
  });

  window.addEventListener('drop', async (e) => {
    const viewStudio = document.getElementById('view-studio');
    if (viewStudio && viewStudio.style.display === 'none') return;

    if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
      e.preventDefault();
      if (dropzoneEmpty) dropzoneEmpty.classList.remove('drag-over');
      await handleDropEvent(e);
    }
  });
}

async function handleDropEvent(e) {
  e.preventDefault();
  if (dropzoneEmpty) dropzoneEmpty.classList.remove('drag-over');

  // Synchronously capture DataTransfer entries before microtasks
  const items = Array.from(e.dataTransfer?.items || []);
  const entries = [];
  for (const item of items) {
    if (typeof item.webkitGetAsEntry === 'function') {
      try {
        const ent = item.webkitGetAsEntry();
        if (ent) entries.push(ent);
      } catch (err) {
        console.warn('webkitGetAsEntry failed:', err);
      }
    }
  }

  let extractedItems = [];
  if (entries.length > 0) {
    showProgress(true);
    setStatus(`Reading ${entries.length} dropped folder(s)/archive(s)…`);
    try {
      extractedItems = await traverseFileSystemEntries(entries);
    } catch (err) {
      console.error('Directory traversal failed:', err);
    }
    showProgress(false);
  }

  // Fallback to dataTransfer.files if entries returned nothing
  if (extractedItems.length === 0 && e.dataTransfer?.files?.length > 0) {
    extractedItems = Array.from(e.dataTransfer.files).map(f => ({
      file: f,
      name: f.name,
      path: f.webkitRelativePath || f.name
    }));
  }

  if (extractedItems.length > 0) {
    await handleFiles(extractedItems);
  } else {
    setStatus('No files or folders found in drop.', 'warn');
  }
}

/**
 * Recursively traverses Directory & File entries, preserving relative directory paths.
 */
async function traverseFileSystemEntries(entries) {
  const result = [];

  async function traverse(entry, currentPath = '') {
    if (!entry) return;

    // Skip macOS metadata folders and hidden entries entirely
    if (entry.name === '__MACOSX' || entry.name.startsWith('._') || entry.name.startsWith('.')) return;

    if (entry.isFile) {
      await new Promise((resolve) => {
        entry.file((f) => {
          const fullPath = currentPath ? `${currentPath}/${f.name}` : f.name;
          if (!isJunkOrMetadata(fullPath)) {
            result.push({ file: f, name: f.name, path: fullPath });
          }
          resolve();
        }, (err) => {
          console.warn('Could not read file entry:', entry.name, err);
          resolve();
        });
      });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const dirPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;

      const readBatch = () => new Promise((resolve) => {
        reader.readEntries((batch) => {
          resolve(batch || []);
        }, (err) => {
          console.warn('readEntries error in:', dirPath, err);
          resolve([]);
        });
      });

      let batch;
      do {
        batch = await readBatch();
        if (batch && batch.length > 0) {
          await Promise.all(batch.map(child => traverse(child, dirPath)));
        }
      } while (batch && batch.length > 0);
    }
  }

  for (const entry of entries) {
    await traverse(entry, '');
  }

  return result;
}

// ── Unified File Normalizer & Router ───────────────────────────
async function handleFiles(inputItems) {
  if (!inputItems || inputItems.length === 0) return;

  // Normalize: can be native File[] or { file, name, path }[]
  const normalized = inputItems.map(item => {
    if (item instanceof File) {
      return { file: item, name: item.name, path: item.webkitRelativePath || item.name };
    } else if (item && item.file) {
      return { file: item.file, name: item.name || item.file.name, path: item.path || item.file.name };
    }
    return null;
  }).filter(Boolean).filter(i => !isJunkOrMetadata(i.path));  // ← strip __MACOSX, ._, .DS_Store etc.

  const zips   = normalized.filter(i => /\.(zip|cbz)$/i.test(i.name));
  const images = normalized.filter(i => isImageFile(i.name));
  const others = normalized.filter(i => !zips.includes(i) && !images.includes(i));

  if (others.length) setStatus(`Skipped ${others.length} non-manga file(s).`);
  if (zips.length)   await handleZipItems(zips);
  if (images.length) await handleLooseImageItems(images);
}

// ── Multi-Folder Loose Images Processing ──────────────────────
async function handleLooseImageItems(imageItems) {
  const groups = {};
  let detectedSeriesName = '';

  for (const item of imageItems) {
    const cleanPath = item.path.replace(/\\/g, '/');
    const parts     = cleanPath.split('/').filter(Boolean);

    // Skip any path that passes through a junk/metadata folder
    const hasJunk = parts.some(p =>
      p === '__MACOSX' || p.startsWith('._') || p === '.DS_Store' || p === '.git'
    );
    if (hasJunk) continue;

    let folder = 'Loose Pages';
    if (parts.length >= 2) {
      folder = parts[parts.length - 2];
      if (parts.length >= 3 && (!seriesNameInput || !seriesNameInput.value.trim())) {
        detectedSeriesName = parts[0];
      }
    }

    if (!groups[folder]) groups[folder] = [];
    groups[folder].push(item);
  }

  if (detectedSeriesName && seriesNameInput && (!seriesNameInput.value.trim() || seriesNameInput.value.trim().toLowerCase() === 'comics')) {
    seriesNameInput.value = detectedSeriesName.replace(/[-_]/g, ' ').trim();
  }

  showProgress(true);
  setStatus(`Processing ${Object.keys(groups).length} chapter folder(s)…`);

  // Naturally sort chapter folders so Chapter 1, 2, ... 10, ... 118 are sequential
  const folderEntries = naturalSort(Object.entries(groups), e => e[0]);
  for (let i = 0; i < folderEntries.length; i++) {
    const [folder, flist] = folderEntries[i];
    setProgress((i / folderEntries.length) * 100, `Loading "${folder}" (${flist.length} pages)…`);

    const sorted = naturalSort(flist, f => f.name);
    const images = [];

    for (const fItem of sorted) {
      try {
        // Skip macOS resource-fork stubs and zero-byte files
        if (fItem.file.size < 100) continue;

        let fileBlob = fItem.file;
        if (!fileBlob.type || fileBlob.type === 'application/octet-stream') {
          const mime = guessMime(fItem.name);
          fileBlob = new Blob([fileBlob], { type: mime });
        }
        const hash = await hashBlob(fileBlob);
        const url  = URL.createObjectURL(fileBlob);
        images.push({
          name: fItem.name,
          blob: fileBlob,
          url,
          hash
        });
      } catch (err) {
        console.warn('Error reading image item:', fItem.name, err);
      }
    }

    if (images.length > 0) {
      mergeChapter(folder, images);
    }
  }

  // Ensure overall chapters array maintains numerical order
  allChapters = naturalSort(allChapters, c => c.name);

  showProgress(false);
  setSelectAll(true);
  const totalPages = allChapters.reduce((s, c) => s + c.images.length, 0);
  setStatus(`Loaded ${allChapters.length} chapter(s) (${totalPages} pages). Previews ready.`);
}

// ══════════════════════════════════════════════════════════════
// NATIVE ZIP READER (Zero Dependencies)
// ══════════════════════════════════════════════════════════════

async function decompressDeflate(compressedBytes) {
  const ds     = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  writer.write(compressedBytes);
  writer.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

async function readZipEntries(file) {
  const buf  = await file.arrayBuffer();
  const view = new DataView(buf);
  const u8   = new Uint8Array(buf);

  let eocdOffset = -1;
  for (let i = buf.byteLength - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocdOffset = i; break; }
  }
  if (eocdOffset === -1) throw new Error('Not a valid ZIP file (EOCD signature missing)');

  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const cdSize   = view.getUint32(eocdOffset + 12, true);

  const entries = [];
  let pos = cdOffset;
  const cdEnd = cdOffset + cdSize;

  while (pos < cdEnd) {
    if (view.getUint32(pos, true) !== 0x02014b50) break;
    const comprMethod = view.getUint16(pos + 10, true);
    const compSize    = view.getUint32(pos + 20, true);
    const uncompSize  = view.getUint32(pos + 24, true);
    const fnLen       = view.getUint16(pos + 28, true);
    const extraLen    = view.getUint16(pos + 30, true);
    const commentLen  = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);
    const name        = new TextDecoder().decode(u8.slice(pos + 46, pos + 46 + fnLen));
    entries.push({ name, comprMethod, compSize, uncompSize, localOffset });
    pos += 46 + fnLen + extraLen + commentLen;
  }

  const result = [];
  for (const entry of entries) {
    if (entry.name.endsWith('/') || entry.name.endsWith('\\')) continue;
    if (isJunkOrMetadata(entry.name)) continue;
    if (!isImageFile(entry.name)) continue;

    const lhBase    = entry.localOffset;
    if (view.getUint32(lhBase, true) !== 0x04034b50) continue;
    const lhFnLen   = view.getUint16(lhBase + 26, true);
    const lhExtraLen= view.getUint16(lhBase + 28, true);
    const dataStart = lhBase + 30 + lhFnLen + lhExtraLen;
    const compressed= u8.slice(dataStart, dataStart + entry.compSize);

    let data;
    if (entry.comprMethod === 0) {
      data = compressed;
    } else if (entry.comprMethod === 8) {
      data = await decompressDeflate(compressed);
    } else {
      console.warn(`Skipping "${entry.name}": unsupported compression (${entry.comprMethod})`);
      continue;
    }
    result.push({ path: entry.name, data });
  }
  return result;
}

// ── Handle ZIP / CBZ Uploads ───────────────────────────────────
async function handleZipItems(zipItems) {
  showProgress(true);
  setStatus(`Unpacking ${zipItems.length} archive(s)…`);

  for (let fi = 0; fi < zipItems.length; fi++) {
    const item = zipItems[fi];
    const file = item.file;
    setStatus(`Unpacking ${file.name}…`);
    setProgress((fi / zipItems.length) * 50, `Reading ${file.name}…`);

    if (seriesNameInput && !seriesNameInput.value.trim()) {
      const cleanZipName = file.name.replace(/\.(zip|cbz)$/i, '').replace(/[-_]/g, ' ').trim();
      seriesNameInput.value = cleanZipName;
    }

    let entries;
    try {
      entries = await readZipEntries(file);
    } catch (err) {
      setStatus(`Failed to unpack ${file.name}: ${err.message}`);
      console.error(err);
      continue;
    }

    const groups = {};
    for (const entry of entries) {
      if (isJunkOrMetadata(entry.path)) continue;
      const parts = entry.path.replace(/\\/g, '/').split('/').filter(Boolean);
      if (parts.some(p => p === '__MACOSX' || p.startsWith('._') || p.startsWith('.'))) continue;
      const folder = parts.length > 1 ? parts.slice(0, -1).join(' - ') : (file.name.replace(/\.(zip|cbz)$/i, ''));
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(entry);
    }

    let gIdx = 0;
    const gTotal = Object.keys(groups).length;
    for (const [folder, elist] of Object.entries(groups)) {
      const sorted = naturalSort(elist, e => e.path.split('/').pop());
      const images = [];

      for (const entry of sorted) {
        try {
          const mime = guessMime(entry.path);
          const blob = new Blob([entry.data], { type: mime });
          const hash = await hashBlob(blob);
          const url  = URL.createObjectURL(blob);
          images.push({
            name: entry.path.split('/').pop(),
            blob,
            url,
            hash
          });
        } catch (err) {
          console.warn('Error processing zip entry:', entry.path, err);
        }
      }

      if (images.length > 0) {
        mergeChapter(folder, images);
      }

      setProgress(50 + (fi / zipItems.length * 50) + (gIdx / gTotal * 50 / zipItems.length),
                  `Loaded "${folder}" (${images.length} pages)`);
      gIdx++;
    }
  }

  showProgress(false);
  setSelectAll(true);
  setStatus(`Loaded ${allChapters.length} chapter(s). Previews ready.`);
}

// ── Helpers ────────────────────────────────────────────────────
function guessMime(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const map = {
    jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png',
    gif:'image/gif',  webp:'image/webp', bmp:'image/bmp',
    tiff:'image/tiff',tif:'image/tiff',  avif:'image/avif',
    svg:'image/svg+xml'
  };
  return map[ext] || 'application/octet-stream';
}

function naturalSort(arr, keyFn) {
  return [...arr].sort((a, b) =>
    keyFn(a).localeCompare(keyFn(b), undefined, { numeric: true, sensitivity: 'base' })
  );
}

/**
 * Fast, low-memory chunk hash (size + first 8KB + last 8KB digest).
 * Prevents tab memory exhaustion when importing hundreds of pages.
 */
async function hashBlob(blob) {
  const size = blob.size;
  const sliceSize = Math.min(8192, size);
  const head = await blob.slice(0, sliceSize).arrayBuffer();
  const tail = size > sliceSize ? await blob.slice(size - sliceSize, size).arrayBuffer() : new ArrayBuffer(0);
  const combined = new Uint8Array(head.byteLength + tail.byteLength);
  combined.set(new Uint8Array(head), 0);
  combined.set(new Uint8Array(tail), head.byteLength);
  const digest = await crypto.subtle.digest('SHA-1', combined);
  return size + '_' + Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2,'0')).join('');
}

/** Merge new images into a chapter, deduplicating repeated files inside the same chapter */
function mergeChapter(name, images) {
  let ch = allChapters.find(c => c.name === name);
  if (!ch) {
    ch = {
      name,
      customTitle: name,
      images: [],
      excluded: new Set(),
      historyMatch: null,
      isExpanded: allChapters.length < 2
    };
    allChapters.push(ch);
  }
  const existing = new Set(ch.images.map(i => i.hash));
  let dupes = 0;
  for (const img of images) {
    if (existing.has(img.hash)) { dupes++; continue; }
    ch.images.push(img);
    existing.add(img.hash);
  }
  if (dupes) console.log(`[PDF Studio] Skipped ${dupes} duplicate image(s) in "${name}"`);
  checkChapterAgainstHistory(ch);
  updateDupStats();
}

// ── Duplicate & Scanlation Credit Detection ────────────────────
function updateDupStats() {
  const seenHashes = new Map();
  scanlationBannerHashes.clear();
  let dupeCount = 0;
  let unexcludedDupeCount = 0;
  let unexcludedBanners = 0;

  for (const ch of allChapters) {
    for (let i = 0; i < ch.images.length; i++) {
      const img = ch.images[i];
      if (seenHashes.has(img.hash)) {
        dupeCount++;
        scanlationBannerHashes.add(img.hash);
        if (!ch.excluded.has(img.hash)) {
          unexcludedDupeCount++;
        }
      } else {
        seenHashes.set(img.hash, ch.name);
      }
    }
  }

  for (const ch of allChapters) {
    for (const img of ch.images) {
      if (scanlationBannerHashes.has(img.hash) && !ch.excluded.has(img.hash)) {
        unexcludedBanners++;
      }
    }
  }

  if (statDupPill)   statDupPill.style.display = dupeCount > 0 ? '' : 'none';
  if (statDups)      statDups.textContent = unexcludedDupeCount > 0 ? `${unexcludedDupeCount} active` : `${dupeCount} excluded`;
  if (dupSection)    dupSection.style.display = dupeCount > 0 ? '' : 'none';

  if (dupBadgeCount) {
    if (unexcludedDupeCount === 0 && dupeCount > 0) {
      dupBadgeCount.textContent = `✓ All ${dupeCount} Dups Excluded`;
      dupBadgeCount.style.background = 'rgba(16, 185, 129, 0.2)';
      dupBadgeCount.style.color = '#34d399';
    } else {
      dupBadgeCount.textContent = `${unexcludedDupeCount} Active Duplicate${unexcludedDupeCount !== 1 ? 's' : ''}`;
      dupBadgeCount.style.background = '';
      dupBadgeCount.style.color = '';
    }
  }

  if (autoExcludeDups) {
    if (unexcludedDupeCount === 0 && dupeCount > 0) {
      autoExcludeDups.textContent = 'Restore All Dups';
      autoExcludeDups.classList.remove('danger');
      autoExcludeDups.classList.add('secondary');
    } else {
      autoExcludeDups.textContent = 'Skip All Dups';
      autoExcludeDups.classList.add('danger');
      autoExcludeDups.classList.remove('secondary');
    }
  }

  if (creditBannerWrap) {
    creditBannerWrap.style.display = scanlationBannerHashes.size > 0 ? 'block' : 'none';
    if (btnAutoExcludeCredits) {
      if (unexcludedBanners === 0 && scanlationBannerHashes.size > 0) {
        btnAutoExcludeCredits.innerHTML = `<span>All ${scanlationBannerHashes.size} Credit Banners Excluded</span>`;
        btnAutoExcludeCredits.style.opacity = '0.7';
      } else {
        btnAutoExcludeCredits.innerHTML = `<span>Exclude ${unexcludedBanners} Credit Banner(s) in All Chapters</span>`;
        btnAutoExcludeCredits.style.opacity = '1';
      }
    }
  }

  updateHistoryDupStats();
}

function excludeAllDuplicates() {
  const seen = new Map();
  let hasAnyToExclude = false;
  for (const ch of allChapters) {
    for (const img of ch.images) {
      if (seen.has(img.hash) && !ch.excluded.has(img.hash)) {
        hasAnyToExclude = true;
      }
      seen.set(img.hash, true);
    }
  }

  seen.clear();
  if (hasAnyToExclude) {
    for (const ch of allChapters) {
      for (const img of ch.images) {
        if (seen.has(img.hash)) ch.excluded.add(img.hash);
        else seen.set(img.hash, true);
      }
      const activePages = ch.images.filter(i => !ch.excluded.has(i.hash)).length;
      if (activePages === 0) {
        selectedIds.delete(ch.name);
      }
    }
    setStatus('All duplicate pages excluded from compilation.');
  } else {
    // Restore all excluded duplicates
    for (const ch of allChapters) {
      for (const img of ch.images) {
        ch.excluded.delete(img.hash);
      }
      selectedIds.add(ch.name);
    }
    setStatus('All duplicate pages restored.');
  }

  updateDupStats();
  renderAll();
}

function excludeAllCreditBanners() {
  let count = 0;
  let hasUnexcluded = false;
  for (const ch of allChapters) {
    for (const img of ch.images) {
      if (scanlationBannerHashes.has(img.hash) && !ch.excluded.has(img.hash)) {
        hasUnexcluded = true;
      }
    }
  }

  for (const ch of allChapters) {
    for (const img of ch.images) {
      if (scanlationBannerHashes.has(img.hash)) {
        if (hasUnexcluded) {
          ch.excluded.add(img.hash);
          count++;
        } else {
          ch.excluded.delete(img.hash);
          count++;
        }
      }
    }
  }
  updateDupStats();
  renderAll();
  setStatus(hasUnexcluded
    ? `Auto-excluded ${count} repeated credit banner page(s) from all chapters.`
    : `Restored ${count} credit banner page(s).`);
}

// ── PDF Studio History & Duplicate Tracking ────────────────────
async function loadPdfHistory() {
  return new Promise(resolve => {
    chrome.storage.local.get('pdfStudioHistory', res => {
      pdfHistoryList = res.pdfStudioHistory || [];
      renderHistoryItems();
      resolve(pdfHistoryList);
    });
  });
}

async function recordPdfHistory(record) {
  pdfHistoryList.unshift(record);
  if (pdfHistoryList.length > 80) pdfHistoryList.length = 80;
  await new Promise(resolve => {
    chrome.storage.local.set({ pdfStudioHistory: pdfHistoryList }, resolve);
  });
  renderHistoryItems();
}

function checkChapterAgainstHistory(ch) {
  if (!pdfHistoryList || !pdfHistoryList.length) return;
  const chLower = ch.name.toLowerCase().trim();
  const firstHash = ch.images[0]?.hash;

  for (const hist of pdfHistoryList) {
    const nameMatch = hist.chapterNames && hist.chapterNames.some(cn => cn.toLowerCase().trim() === chLower);
    const hashMatch = firstHash && hist.fingerprints && hist.fingerprints.includes(firstHash);

    if (nameMatch || hashMatch) {
      ch.historyMatch = {
        title: hist.filename || hist.seriesTitle,
        date: new Date(hist.timestamp).toLocaleDateString(),
        matchType: nameMatch ? 'Name' : 'Content'
      };
      break;
    }
  }
}

function updateHistoryDupStats() {
  const historyDups = allChapters.filter(c => c.historyMatch);
  const count = historyDups.length;

  if (statHistPill) statHistPill.style.display = count > 0 ? '' : 'none';
  if (statHist)     statHist.textContent = count;

  if (historyDupCard) {
    historyDupCard.style.display = count > 0 ? 'block' : 'none';
    if (historyDupCount) historyDupCount.textContent = `${count} in History`;
  }
}

function skipHistoryCompiledChapters() {
  let skipped = 0;
  allChapters.forEach((ch) => {
    if (ch.historyMatch && selectedIds.has(ch.name)) {
      selectedIds.delete(ch.name);
      skipped++;
    }
  });
  renderAll();
  setStatus(`Unchecked ${skipped} chapter(s) that were already compiled in history.`);
}

function clearPdfHistory() {
  if (!confirm('Clear all PDF Studio compile history?')) return;
  chrome.storage.local.remove('pdfStudioHistory', () => {
    pdfHistoryList = [];
    allChapters.forEach(c => c.historyMatch = null);
    renderHistoryItems();
    updateHistoryDupStats();
    renderAll();
    setStatus('PDF Studio history cleared.');
  });
}

function renderHistoryItems() {
  if (!historyItemsList) return;
  if (!pdfHistoryList || pdfHistoryList.length === 0) {
    historyItemsList.innerHTML = '<p class="dup-desc" style="padding: 4px;">No previous PDF exports recorded.</p>';
    return;
  }
  historyItemsList.innerHTML = '';
  pdfHistoryList.slice(0, 15).forEach(item => {
    const el = document.createElement('div');
    el.className = 'history-item-mini';
    el.innerHTML = `
      <span class="history-item-title" title="${escHtml(item.filename)}">📄 ${escHtml(item.filename)}</span>
      <div class="history-item-meta">
        <span>${item.chapterCount || 1} ch · ${item.totalPages || 0} pgs</span>
        <span>${new Date(item.timestamp).toLocaleDateString()}</span>
      </div>
    `;
    historyItemsList.appendChild(el);
  });
}

// ── Smart Naming Template Helper ──────────────────────────────
function getChapterPdfName(ch, chIdx, volIdx = 1) {
  const series = seriesNameInput?.value.trim() || 'Manga';
  const template = namingTemplateSelect?.value || 'folder';
  const folder = ch.customTitle?.trim() || ch.name;
  const volStr = String(volIdx).padStart(2, '0');

  let res = '';
  if (template === 'series_folder') {
    res = `${series} - ${folder}`;
  } else if (template === 'series_vol_folder') {
    res = `${series} - Vol.${volStr} ${folder}`;
  } else {
    // Default: exactly the folder name
    res = `${folder}`;
  }
  return sanitizeFilename(res) + '.pdf';
}

// ── Render Chapter Cards & Page Thumbnail Previews ───────────
function renderAll() {
  const scrollTop = chaptersContainer ? chaptersContainer.scrollTop : 0;
  const hasChapters = allChapters.length > 0;
  if (dropzoneEmpty)       dropzoneEmpty.style.display       = hasChapters ? 'none' : '';
  if (chaptersContainer)   chaptersContainer.style.display   = hasChapters ? ''     : 'none';
  if (compileBtn)          compileBtn.disabled               = !hasChapters;

  if (statChapters) statChapters.textContent = allChapters.length;
  if (statPages)    statPages.textContent = allChapters.reduce((s, c) => s + c.images.length, 0);
  if (statSelected) statSelected.textContent = allChapters.filter(c => selectedIds.has(c.name)).length;
  updateDupStats();

  if (!chaptersContainer) return;
  chaptersContainer.innerHTML = '';

  allChapters.forEach((ch, idx) => {
    const isSelected = selectedIds.has(ch.name);
    const card = document.createElement('div');
    card.className = 'chapter-card' + (isSelected ? ' selected' : '');
    card.dataset.idx = idx;
    card.draggable = true;

    // Card Drag and Drop handlers (supports internal reordering and external drop)
    card.addEventListener('dragstart', (e) => {
      draggedIdx = idx;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (draggedIdx !== null) {
        e.dataTransfer.dropEffect = 'move';
        const rect = card.getBoundingClientRect();
        const relY = e.clientY - rect.top;
        if (relY < rect.height / 2) {
          card.classList.add('drag-over-top');
          card.classList.remove('drag-over-bottom');
        } else {
          card.classList.add('drag-over-bottom');
          card.classList.remove('drag-over-top');
        }
      } else if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
        e.dataTransfer.dropEffect = 'copy';
      }
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('drag-over-top', 'drag-over-bottom');
    });

    card.addEventListener('drop', async (e) => {
      card.classList.remove('drag-over-top', 'drag-over-bottom');
      if (draggedIdx !== null) {
        e.preventDefault();
        e.stopPropagation();
        if (draggedIdx === idx) {
          draggedIdx = null;
          return;
        }
        const rect = card.getBoundingClientRect();
        const relY = e.clientY - rect.top;
        let targetIdx = idx;
        if (relY >= rect.height / 2) {
          targetIdx = idx + (draggedIdx < idx ? 0 : 1);
        } else {
          targetIdx = idx - (draggedIdx > idx ? 0 : 1);
        }
        const movedItem = allChapters.splice(draggedIdx, 1)[0];
        allChapters.splice(targetIdx, 0, movedItem);
        draggedIdx = null;
        renderAll();
        return;
      }

      // External files dropped directly onto card
      if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
        e.preventDefault();
        e.stopPropagation();
        await handleDropEvent(e);
      }
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging', 'drag-over-top', 'drag-over-bottom');
      draggedIdx = null;
    });

    // ── Chapter Header Row ──
    const headerRow = document.createElement('div');
    headerRow.className = 'chapter-header';

    const leftGroup = document.createElement('div');
    leftGroup.className = 'chapter-title-group';

    // Drag Handle
    const dragHandle = document.createElement('span');
    dragHandle.className = 'drag-handle';
    dragHandle.textContent = '⠿';
    dragHandle.title = 'Drag to reorder chapter';

    // Checkbox selector — keyed by chapter NAME (survives re-sorts)
    const checkLabel = document.createElement('label');
    checkLabel.className = 'checkbox-container';
    checkLabel.style.margin = '0';
    const checkInput = document.createElement('input');
    checkInput.type = 'checkbox';
    checkInput.checked = isSelected;
    checkInput.addEventListener('click', (e) => e.stopPropagation());
    checkInput.addEventListener('change', () => {
      if (checkInput.checked) selectedIds.add(ch.name);
      else                    selectedIds.delete(ch.name);
      card.classList.toggle('selected', checkInput.checked);
      if (statSelected) statSelected.textContent = allChapters.filter(c => selectedIds.has(c.name)).length;
    });
    checkLabel.appendChild(checkInput);

    // Cover page mini thumbnail
    const firstImg = ch.images[0];
    const coverThumb = document.createElement('img');
    coverThumb.className = 'chapter-thumb-mini';
    if (firstImg && firstImg.url) {
      coverThumb.src = firstImg.url;
      coverThumb.alt = 'Cover';
      coverThumb.loading = 'lazy';
      coverThumb.title = 'Click to open full-screen preview';
      coverThumb.onerror = () => {
        coverThumb.style.display = 'none';
      };
      coverThumb.addEventListener('click', (e) => {
        e.stopPropagation();
        openLightbox(ch, 0);
      });
    } else {
      coverThumb.style.display = 'none';
    }

    // Editable Title Input
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'chapter-title-input';
    titleInput.value = ch.customTitle || ch.name;
    titleInput.title = 'Click to edit output chapter title';
    titleInput.addEventListener('click', (e) => e.stopPropagation());
    titleInput.addEventListener('change', () => {
      ch.customTitle = titleInput.value.trim() || ch.name;
    });

    leftGroup.appendChild(dragHandle);
    leftGroup.appendChild(checkLabel);
    leftGroup.appendChild(coverThumb);
    leftGroup.appendChild(titleInput);

    // ── Right Actions & Badges ──
    const rightActions = document.createElement('div');
    rightActions.className = 'chapter-actions';

    const visibleCount  = ch.images.filter(i => !ch.excluded.has(i.hash)).length;
    const excludedCount = ch.images.length - visibleCount;

    const countBadge = document.createElement('span');
    countBadge.className = 'chapter-page-count';
    countBadge.textContent = `${visibleCount} pgs`;
    if (excludedCount > 0) {
      countBadge.textContent += ` (${excludedCount} excluded)`;
    }
    rightActions.appendChild(countBadge);

    // History Match Badge
    if (ch.historyMatch) {
      const histBadge = document.createElement('span');
      histBadge.className = 'chapter-hist-badge';
      histBadge.textContent = '⚠️ In History';
      histBadge.title = `Compiled on ${ch.historyMatch.date} as "${ch.historyMatch.title}"`;
      rightActions.appendChild(histBadge);
    }

    // Expand/Collapse preview toggle button
    const toggleExpandBtn = document.createElement('button');
    toggleExpandBtn.className = 'chapter-toggle-expand';
    toggleExpandBtn.innerHTML = ch.isExpanded ? '<span>▲ Hide Pages</span>' : `<span>👁️ ${ch.images.length} Pages ▼</span>`;
    toggleExpandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      ch.isExpanded = !ch.isExpanded;
      renderAll();
    });
    rightActions.appendChild(toggleExpandBtn);

    // Move Up / Move Down Quick Buttons
    const moveUpBtn = document.createElement('button');
    moveUpBtn.className = 'icon-btn';
    moveUpBtn.textContent = '▲';
    moveUpBtn.title = 'Move Up';
    moveUpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (idx > 0) {
        const item = allChapters.splice(idx, 1)[0];
        allChapters.splice(idx - 1, 0, item);
        renderAll();
      }
    });

    const moveDownBtn = document.createElement('button');
    moveDownBtn.className = 'icon-btn';
    moveDownBtn.textContent = '▼';
    moveDownBtn.title = 'Move Down';
    moveDownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (idx < allChapters.length - 1) {
        const item = allChapters.splice(idx, 1)[0];
        allChapters.splice(idx + 1, 0, item);
        renderAll();
      }
    });

    rightActions.appendChild(moveUpBtn);
    rightActions.appendChild(moveDownBtn);

    headerRow.appendChild(leftGroup);
    headerRow.appendChild(rightActions);

    headerRow.addEventListener('click', (e) => {
      if (e.target.closest('input') || e.target.closest('button') || e.target === coverThumb) return;
      ch.isExpanded = !ch.isExpanded;
      renderAll();
    });

    card.appendChild(headerRow);

    // ── Full Page Thumbnail Grid Preview ──
    if (ch.isExpanded) {
      const pagesGrid = document.createElement('div');
      pagesGrid.className = 'pages-grid';

      ch.images.forEach((img, imgIdx) => {
        const isExcluded = ch.excluded.has(img.hash);
        const isDup      = scanlationBannerHashes.has(img.hash);

        const pageCard = document.createElement('div');
        pageCard.className = 'page-thumb-card' +
          (!isExcluded ? ' selected' : ' excluded') +
          (isDup ? ' is-dup' : '');

        // Page Header with index and include checkbox
        const pageMeta = document.createElement('div');
        pageMeta.className = 'page-meta';

        const pageNum = document.createElement('span');
        pageNum.className = 'page-num';
        pageNum.textContent = `#${imgIdx + 1}`;

        const pageCheckLabel = document.createElement('label');
        pageCheckLabel.className = 'checkbox-container';
        pageCheckLabel.style.margin = '0';

        const pageCheck = document.createElement('input');
        pageCheck.type = 'checkbox';
        pageCheck.checked = !isExcluded;
        pageCheck.addEventListener('click', (e) => e.stopPropagation());
        pageCheck.addEventListener('change', () => {
          if (pageCheck.checked) {
            ch.excluded.delete(img.hash);
            pageCard.classList.remove('excluded');
            pageCard.classList.add('selected');
          } else {
            ch.excluded.add(img.hash);
            pageCard.classList.add('excluded');
            pageCard.classList.remove('selected');
          }
          const currentVis = ch.images.filter(i => !ch.excluded.has(i.hash)).length;
          countBadge.textContent = `${currentVis} pgs`;
          if (ch.images.length - currentVis > 0) {
            countBadge.textContent += ` (${ch.images.length - currentVis} excluded)`;
          }
          updateDupStats();
        });

        pageCheckLabel.appendChild(pageCheck);
        pageMeta.appendChild(pageNum);
        pageMeta.appendChild(pageCheckLabel);

        // Thumbnail Image
        const thumbImg = document.createElement('img');
        thumbImg.className = 'page-thumb-img';
        thumbImg.src = img.url;
        thumbImg.loading = 'lazy';
        thumbImg.alt = `Page ${imgIdx + 1}`;
        thumbImg.title = 'Click to open full-size preview';
        thumbImg.onerror = () => {
          // Replace broken image with a placeholder tile
          thumbImg.style.display = 'none';
          const placeholder = document.createElement('div');
          placeholder.style.cssText = 'width:100%;height:160px;background:#141720;border:1px solid rgba(255,255,255,0.08);border-radius:4px;display:flex;align-items:center;justify-content:center;color:#5E6573;font-size:11px;';
          placeholder.textContent = 'Preview unavailable';
          pageCard.insertBefore(placeholder, thumbImg.nextSibling);
        };

        thumbImg.addEventListener('click', (e) => {
          e.stopPropagation();
          openLightbox(ch, imgIdx);
        });

        pageCard.appendChild(pageMeta);
        pageCard.appendChild(thumbImg);
        pagesGrid.appendChild(pageCard);
      });

      card.appendChild(pagesGrid);
    }

    chaptersContainer.appendChild(card);
  });

  if (chaptersContainer) {
    chaptersContainer.scrollTop = scrollTop;
  }
}

function setSelectAll(val) {
  if (val) allChapters.forEach(c => selectedIds.add(c.name));
  else     selectedIds.clear();
  renderAll();
  setStatus(val ? `Selected all ${allChapters.length} chapter(s).` : 'Deselected all chapters.');
}

function setAllExpanded(val) {
  allChapters.forEach(c => c.isExpanded = val);
  renderAll();
  setStatus(val ? `Expanded previews for all ${allChapters.length} chapter(s).` : 'Collapsed all chapter previews.');
}

function reverseChapters() {
  allChapters.reverse();
  renderAll();
  setStatus('Flipped chapter reading order.');
}

function clearAll() {
  allChapters.forEach(ch => {
    ch.images.forEach(img => {
      if (img.url) URL.revokeObjectURL(img.url);
    });
  });
  allChapters = [];
  selectedIds.clear();
  renderAll();
  setStatus('All chapters cleared.');
}

// ── Lightbox Full-Screen Page Preview Modal ───────────────────
function openLightbox(chapter, pageIdx) {
  if (!chapter || !chapter.images || !chapter.images.length) return;
  activeLightboxChapter = chapter;
  activeLightboxPageIdx = Math.max(0, Math.min(pageIdx, chapter.images.length - 1));
  updateLightboxView();
  if (lightboxModal) lightboxModal.classList.remove('hidden');
}

function closeLightbox() {
  if (lightboxModal) lightboxModal.classList.add('hidden');
  activeLightboxChapter = null;
}

function stepLightbox(direction) {
  if (!activeLightboxChapter || !activeLightboxChapter.images.length) return;
  const newIdx = activeLightboxPageIdx + direction;
  if (newIdx >= 0 && newIdx < activeLightboxChapter.images.length) {
    activeLightboxPageIdx = newIdx;
    updateLightboxView();
  }
}

function updateLightboxView() {
  if (!activeLightboxChapter) return;
  const img = activeLightboxChapter.images[activeLightboxPageIdx];
  if (!img) return;

  if (lightboxImg)     lightboxImg.src = img.url;
  if (lightboxTitle)   lightboxTitle.textContent = `${activeLightboxChapter.customTitle || activeLightboxChapter.name}`;
  if (lightboxCounter) lightboxCounter.textContent = `Page ${activeLightboxPageIdx + 1} of ${activeLightboxChapter.images.length} · ${img.name}`;
  if (lightboxPrev)    lightboxPrev.style.display = activeLightboxPageIdx > 0 ? 'flex' : 'none';
  if (lightboxNext)    lightboxNext.style.display = activeLightboxPageIdx < activeLightboxChapter.images.length - 1 ? 'flex' : 'none';
}

// ── Compilation Workflow (Omnibus, Volumes, or Individual) ────
async function startCompilation() {
  if (isCompiling) return;
  const toCompile = allChapters.filter(c => selectedIds.has(c.name));
  if (!toCompile.length) {
    setStatus('Select at least one chapter first.');
    return;
  }

  isCompiling = true;
  if (compileBtn) compileBtn.disabled = true;
  showProgress(true);

  const outputMode = outputModeEl ? outputModeEl.value : 'individual';
  const quality    = qualityEl    ? parseFloat(qualityEl.value) : 0.88;

  try {
    if (outputMode === 'volume') {
      await compileVolumePdfs(toCompile, quality);
    } else if (outputMode === 'combined') {
      await compileSinglePdf(toCompile, quality);
    } else {
      // Default: 1 PDF per folder -> bundled into ZIP
      await compileIndividualPdfs(toCompile, quality);
    }
  } catch (err) {
    setStatus(`Compilation error: ${err.message}`);
    console.error(err);
  }

  showProgress(false);
  isCompiling = false;
  if (compileBtn) compileBtn.disabled = false;
}

// ── Single Combined Omnibus PDF ───────────────────────────────
async function compileSinglePdf(chapters, quality) {
  const seriesName = seriesNameInput?.value.trim() || 'Manga_Omnibus';
  setStatus('Building Combined Omnibus PDF with Chapter Bookmarks…');

  const pdfBytes = await buildPdf(chapters, quality);
  const filename = `${sanitizeFilename(seriesName)}.pdf`;
  downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), filename);

  const totalPages = chapters.reduce((s, c) => s + c.images.filter(i => !c.excluded.has(i.hash)).length, 0);

  await recordPdfHistory({
    id: Date.now().toString(),
    seriesTitle: seriesName,
    filename,
    chapterNames: chapters.map(c => c.name),
    chapterCount: chapters.length,
    totalPages,
    fingerprints: chapters.map(c => c.images[0]?.hash).filter(Boolean),
    timestamp: Date.now()
  });

  setStatus(`Done! ${totalPages} pages compiled into "${filename}"`);
}

// ── Volume Bundler (Split Every X Chapters) ───────────────────
async function compileVolumePdfs(chapters, quality) {
  const splitCount = parseInt(volumeSplitCountEl?.value, 10) || 10;
  const seriesName = seriesNameInput?.value.trim() || 'Manga';
  const zip = new JSZip();

  const volumeGroups = [];
  for (let i = 0; i < chapters.length; i += splitCount) {
    volumeGroups.push(chapters.slice(i, i + splitCount));
  }

  setStatus(`Compiling ${volumeGroups.length} volume(s)…`);

  for (let vi = 0; vi < volumeGroups.length; vi++) {
    const volChapters = volumeGroups[vi];
    const volNumStr = String(vi + 1).padStart(2, '0');
    const volFilename = sanitizeFilename(`${seriesName} - Vol.${volNumStr}`) + '.pdf';

    setStatus(`Building Volume ${vi + 1} of ${volumeGroups.length}…`);
    setProgress((vi / volumeGroups.length) * 90, `Generating "${volFilename}"…`);

    const pdfBytes = await buildPdf(volChapters, quality);

    if (volumeGroups.length === 1) {
      downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), volFilename);
    } else {
      zip.file(volFilename, pdfBytes);
    }

    await recordPdfHistory({
      id: `${Date.now()}_${vi}`,
      seriesTitle: seriesName,
      filename: volFilename,
      chapterNames: volChapters.map(c => c.name),
      chapterCount: volChapters.length,
      totalPages: volChapters.reduce((s, c) => s + c.images.filter(i => !c.excluded.has(i.hash)).length, 0),
      fingerprints: volChapters.map(c => c.images[0]?.hash).filter(Boolean),
      timestamp: Date.now()
    });
  }

  if (volumeGroups.length > 1) {
    setStatus('Bundling volumes into ZIP…');
    setProgress(95, 'Archiving Volumes…');
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(zipBlob, `${sanitizeFilename(seriesName)}_Volumes.zip`);
    setStatus(`Done! ${volumeGroups.length} Volumes bundled into ZIP.`);
  } else {
    setStatus(`Done! Volume compiled.`);
  }
}

// ── 1 PDF Per Chapter (Individual ZIP Bundle) ─────────────────
async function compileIndividualPdfs(chapters, quality) {
  const seriesName = seriesNameInput?.value.trim() || 'Manga';
  const validChapters = chapters.filter(c => c.images.some(img => !c.excluded.has(img.hash)));
  if (validChapters.length === 0) {
    setStatus('No active pages to compile (all selected pages are excluded).');
    return;
  }

  const zip = new JSZip();

  for (let i = 0; i < validChapters.length; i++) {
    const ch = validChapters[i];
    const pdfFilename = getChapterPdfName(ch, i);

    setStatus(`Compiling "${pdfFilename}" (${i + 1}/${validChapters.length})…`);
    setProgress((i / validChapters.length) * 90, `Chapter ${i + 1} of ${validChapters.length}`);

    const pdfBytes = await buildPdf([ch], quality);
    zip.file(pdfFilename, pdfBytes);

    await recordPdfHistory({
      id: `${Date.now()}_${i}`,
      seriesTitle: seriesName,
      filename: pdfFilename,
      chapterNames: [ch.name],
      chapterCount: 1,
      totalPages: ch.images.filter(img => !ch.excluded.has(img.hash)).length,
      fingerprints: [ch.images[0]?.hash].filter(Boolean),
      timestamp: Date.now()
    });
  }

  setStatus('Bundling PDFs into ZIP archive…');
  setProgress(95, 'Generating ZIP bundle…');
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const zipFilename = `${sanitizeFilename(seriesName)}.zip`;
  downloadBlob(zipBlob, zipFilename);
  setStatus(`Done! ${validChapters.length} PDF(s) compiled and bundled into "${zipFilename}".`);
}

// ══════════════════════════════════════════════════════════════
// ADVANCED PDF BUILDER (With Interactive Outline Bookmarks)
// ══════════════════════════════════════════════════════════════

async function buildPdf(chapters, quality = 0.88) {
  const pages = [];
  const chapterBookmarks = [];

  for (const ch of chapters) {
    const startPageIndex = pages.length;
    let includedCount = 0;

    for (const img of ch.images) {
      if (ch.excluded.has(img.hash)) continue;
      pages.push({ blob: img.blob });
      includedCount++;
    }

    if (includedCount > 0) {
      chapterBookmarks.push({
        title: ch.customTitle || ch.name,
        targetPageIndex: startPageIndex
      });
    }
  }

  const total = pages.length;
  if (total === 0) throw new Error('No pages selected for PDF creation.');

  const jpegPages = [];
  for (let i = 0; i < total; i++) {
    setProgress(10 + (i / total * 70), `Processing image ${i + 1} of ${total}…`);
    jpegPages.push(await blobToJpeg(pages[i].blob, quality));
  }

  const enc = new TextEncoder();
  const objects = [];
  let nextId = 1;

  const addObj = (str) => {
    const id = nextId++;
    objects.push({ id, type: 'dict', str });
    return id;
  };

  const addStream = (dict, data) => {
    const id = nextId++;
    objects.push({ id, type: 'stream', dict, data });
    return id;
  };

  const pageIds = [];
  for (let i = 0; i < jpegPages.length; i++) {
    const { data: jpeg, w, h } = jpegPages[i];

    const imgId = addStream(
      `/Type /XObject\n/Subtype /Image\n/Width ${w}\n/Height ${h}\n/ColorSpace /DeviceRGB\n/BitsPerComponent 8\n/Filter /DCTDecode`,
      jpeg
    );

    const contentData = enc.encode(`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`);
    const contentId   = addStream('', contentData);

    const pageId = addObj(
      `/Type /Page\n/MediaBox [0 0 ${w} ${h}]\n/Resources << /XObject << /Im0 ${imgId} 0 R >> >>\n/Contents ${contentId} 0 R\n/Parent PAGES_REF`
    );
    pageIds.push(pageId);
  }

  const pagesId = addObj(`/Type /Pages\n/Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}]\n/Count ${pageIds.length}`);

  // Interactive PDF Outline Bookmarks
  let catalogOutlinesStr = '';
  if (chapterBookmarks.length > 0) {
    const outlinesId = addObj('OUTLINES_PLACEHOLDER');
    const outlineItemIds = [];

    for (let bi = 0; bi < chapterBookmarks.length; bi++) {
      const bm = chapterBookmarks[bi];
      const targetPageId = pageIds[bm.targetPageIndex] || pageIds[0];
      const safeTitle = escapePdfString(bm.title);

      const itemId = addObj(
        `/Title (${safeTitle})\n/Parent ${outlinesId} 0 R\n/Dest [${targetPageId} 0 R /Fit]`
      );
      outlineItemIds.push(itemId);
    }

    for (let bi = 0; bi < outlineItemIds.length; bi++) {
      const itemId = outlineItemIds[bi];
      const prevId = bi > 0 ? outlineItemIds[bi - 1] : null;
      const nextId = bi < outlineItemIds.length - 1 ? outlineItemIds[bi + 1] : null;

      const obj = objects.find(o => o.id === itemId);
      if (obj) {
        if (prevId) obj.str += `\n/Prev ${prevId} 0 R`;
        if (nextId) obj.str += `\n/Next ${nextId} 0 R`;
      }
    }

    const rootOutlinesObj = objects.find(o => o.id === outlinesId);
    if (rootOutlinesObj) {
      rootOutlinesObj.str =
        `/Type /Outlines\n/First ${outlineItemIds[0]} 0 R\n/Last ${outlineItemIds[outlineItemIds.length - 1]} 0 R\n/Count ${outlineItemIds.length}`;
    }

    catalogOutlinesStr = `\n/Outlines ${outlinesId} 0 R\n/PageMode /UseOutlines`;
  }

  const catalogId = addObj(`/Type /Catalog\n/Pages ${pagesId} 0 R${catalogOutlinesStr}`);

  for (const obj of objects) {
    if (obj.type === 'dict') obj.str = obj.str.replace('PAGES_REF', `${pagesId} 0 R`);
  }

  const chunks = [enc.encode('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n')];
  let bytePos = chunks[0].byteLength;
  const offsets = new Array(nextId).fill(0);

  for (const obj of objects) {
    offsets[obj.id] = bytePos;
    let chunk;
    if (obj.type === 'stream') {
      const hdr = enc.encode(`${obj.id} 0 obj\n<<${obj.dict ? '\n' + obj.dict + '\n' : ''}/Length ${obj.data.byteLength}\n>>\nstream\n`);
      const ftr = enc.encode('\nendstream\nendobj\n');
      chunk = concatU8([hdr, obj.data, ftr]);
    } else {
      chunk = enc.encode(`${obj.id} 0 obj\n<<\n${obj.str}\n>>\nendobj\n`);
    }
    chunks.push(chunk);
    bytePos += chunk.byteLength;
  }

  const xrefOffset = bytePos;
  let xref = `xref\n0 ${nextId}\n0000000000 65535 f \n`;
  for (let i = 1; i < nextId; i++) xref += offsets[i].toString().padStart(10,'0') + ' 00000 n \n';
  xref += `trailer\n<< /Size ${nextId}\n/Root ${catalogId} 0 R\n>>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(enc.encode(xref));

  return concatU8(chunks);
}

// ── Image Processing Helpers ──────────────────────────────────
async function blobToJpeg(blob, quality = 0.88) {
  const isEink = einkEl && einkEl.checked;
  let isJpeg = false;
  try {
    const header = new Uint8Array(await blob.slice(0, 3).arrayBuffer());
    isJpeg = (header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF);
  } catch (e) {}

  if (isJpeg && !isEink) {
    try {
      const img = await createImageBitmap(blob);
      if (img.width > 0 && img.height > 0) {
        return { data: new Uint8Array(await blob.arrayBuffer()), w: img.width, h: img.height };
      }
    } catch (e) {
      console.warn('[PDF Studio] Direct JPEG pass-through failed, falling back to canvas re-encoding:', e);
    }
  }

  try {
    const img    = await createImageBitmap(blob);
    const width  = Math.max(1, img.width || 800);
    const height = Math.max(1, img.height || 1200);
    const canvas = new OffscreenCanvas(width, height);
    const ctx    = canvas.getContext('2d');

    // Fill pure white background (prevents transparent WebP/PNG from turning black in JPEG)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0);

    if (isEink) {
      const imgData = ctx.getImageData(0, 0, width, height);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
      }
      ctx.putImageData(imgData, 0, 0);
    }

    const jpegBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    return { data: new Uint8Array(await jpegBlob.arrayBuffer()), w: width, h: height };
  } catch (err) {
    console.error('[PDF Studio] Failed to decode image for PDF, creating placeholder:', err);
    const w = 800, h = 1200;
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#888888';
    ctx.font = '24px sans-serif';
    ctx.fillText('Corrupted or Unreadable Image', 100, 600);
    const fallbackBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
    return { data: new Uint8Array(await fallbackBlob.arrayBuffer()), w, h };
  }
}

async function getImgSize(blob) {
  const img = await createImageBitmap(blob);
  return { w: img.width, h: img.height };
}

function concatU8(arrays) {
  const total = arrays.reduce((s, a) => s + a.byteLength, 0);
  const out   = new Uint8Array(total);
  let   off   = 0;
  for (const a of arrays) { out.set(a, off); off += a.byteLength; }
  return out;
}

function escapePdfString(str) {
  return str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

// ── UI Controls & Downloads ───────────────────────────────────
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
}

function showProgress(visible) {
  if (progressWrap) progressWrap.style.display = visible ? '' : 'none';
  if (!visible) { setProgress(0, ''); }
}

function setProgress(pct, sub = '') {
  if (progressFill) progressFill.style.width = `${Math.min(100, Math.round(pct))}%`;
  if (progressPct)  progressPct.textContent  = `${Math.min(100, Math.round(pct))}%`;
  if (progressSub)  progressSub.textContent  = sub;
}

function setStatus(msg) {
  if (progressStatus) progressStatus.textContent = msg;
  console.log('[PDF Studio]', msg);
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function sanitizeFilename(name) {
  if (!name) return 'output';
  let cleaned = name
    .replace(/[\\/:*?"<>|\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[\s._]+|[\s._]+$/g, '')
    .trim();

  // Guard against Windows reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(cleaned)) {
    cleaned = cleaned + '_manga';
  }

  // Filesystem path length safety (keep under 180 chars)
  if (cleaned.length > 180) {
    cleaned = cleaned.substring(0, 180).replace(/_+$/, '');
  }

  return cleaned || 'output';
}
