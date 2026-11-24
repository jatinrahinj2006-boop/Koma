// ============================================================
// PDF Duplicate Checker & Content Comparator (pdf-dup-checker.js)
// Deep Content & Name Duplicate Detection for Manga & Manhwa PDFs
// ============================================================

(function() {
  'use strict';

  // ── State ────────────────────────────────────────────────────
  let uploadedPdfs = []; // Array of PdfItem
  let duplicateGroups = []; // Array of DuplicateGroup
  let uniquePdfs = []; // Array of PdfItem
  let isScanning = false;
  let activeFilter = 'all'; // 'all', 'dups', 'exact', 'near', 'unique'
  let searchQuery = '';
  let activeDiffPair = null; // { fileA, fileB }

  // Byte sequence constants for PDF stream scanning
  const STREAM_BYTES    = new Uint8Array([115, 116, 114, 101, 97, 109]);       // 'stream'
  const ENDSTREAM_BYTES = new Uint8Array([101, 110, 100, 115, 116, 114, 101, 97, 109]); // 'endstream'

  // ── DOM References ───────────────────────────────────────────
  let tabBtnStudio;
  let tabBtnDupChecker;
  let viewStudio;
  let viewDupChecker;
  let navDupBadge;

  // Dup Checker Sidebar refs
  let dupFileInput;
  let dupFolderInput;
  let btnBrowsePdfs;
  let btnBrowsePdfFolder;
  let selectMatchingMode;
  let checkIgnoreCredits;
  let btnAutoSelectDups;
  let btnDownloadCleanZip;
  let btnExportReport;
  let btnClearAllPdfs;
  let dupSearchInput;
  let filterPills;

  // Dup Checker Main refs
  let statTotalPdfs;
  let statTotalPages;
  let statDupSets;
  let statSavedSpace;
  let dupProgressWrap;
  let dupProgressFill;
  let dupProgressStatus;
  let dupProgressPct;
  let dupProgressSub;
  let dupDropzoneEmpty;
  let dupDropzoneBtnFiles;
  let dupDropzoneBtnFolder;
  let dupResultsContainer;
  let dupGroupsSection;
  let dupUniqueSection;
  let btnExpandAllGroups;
  let btnCollapseAllGroups;

  // Diff Modal refs
  let diffModal;
  let diffCloseBtn;
  let diffBackdrop;
  let diffTitle;
  let diffSubtitle;
  let diffGrid;

  // ── Safe Initialization ───────────────────────────────────────
  function onReady() {
    initDomRefs();
    initTabNavigation();
    initEventListeners();
    initDragAndDrop();

    // Check URL query parameters for direct tab navigation (e.g. ?tab=dup-checker)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('tab') === 'dup-checker' || urlParams.get('tab') === 'dupchecker') {
      switchTab('dupchecker');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }

  function initDomRefs() {
    tabBtnStudio         = document.getElementById('tab-btn-studio');
    tabBtnDupChecker    = document.getElementById('tab-btn-dupchecker');
    viewStudio           = document.getElementById('view-studio');
    viewDupChecker       = document.getElementById('view-dupchecker');
    navDupBadge          = document.getElementById('header-dup-badge');

    dupFileInput         = document.getElementById('dup-file-input');
    dupFolderInput       = document.getElementById('dup-folder-input');
    btnBrowsePdfs        = document.getElementById('btn-dup-browse-files');
    btnBrowsePdfFolder   = document.getElementById('btn-dup-browse-folder');
    selectMatchingMode   = document.getElementById('dup-matching-mode');
    checkIgnoreCredits   = document.getElementById('dup-ignore-credits');
    btnAutoSelectDups    = document.getElementById('btn-dup-autoselect');
    btnDownloadCleanZip  = document.getElementById('btn-dup-download-clean');
    btnExportReport      = document.getElementById('btn-dup-export-report');
    btnClearAllPdfs      = document.getElementById('btn-dup-clear-all');
    dupSearchInput       = document.getElementById('dup-search-input');
    filterPills          = document.querySelectorAll('.dup-filter-pill');

    statTotalPdfs        = document.getElementById('dup-stat-total-pdfs');
    statTotalPages       = document.getElementById('dup-stat-total-pages');
    statDupSets          = document.getElementById('dup-stat-dup-sets');
    statSavedSpace       = document.getElementById('dup-stat-saved-space');

    dupProgressWrap      = document.getElementById('dup-progress-wrap');
    dupProgressFill      = document.getElementById('dup-progress-fill');
    dupProgressStatus    = document.getElementById('dup-progress-status');
    dupProgressPct       = document.getElementById('dup-progress-percent');
    dupProgressSub       = document.getElementById('dup-progress-sub');

    dupDropzoneEmpty     = document.getElementById('dup-dropzone-empty');
    dupDropzoneBtnFiles  = document.getElementById('dup-drop-btn-files');
    dupDropzoneBtnFolder = document.getElementById('dup-drop-btn-folder');
    dupResultsContainer  = document.getElementById('dup-results-container');
    dupGroupsSection     = document.getElementById('dup-groups-list');
    dupUniqueSection     = document.getElementById('dup-unique-list');
    btnExpandAllGroups   = document.getElementById('btn-dup-expand-all');
    btnCollapseAllGroups = document.getElementById('btn-dup-collapse-all');

    diffModal            = document.getElementById('dup-diff-modal');
    diffCloseBtn         = document.getElementById('dup-diff-close');
    diffBackdrop         = document.getElementById('dup-diff-backdrop');
    diffTitle            = document.getElementById('dup-diff-title');
    diffSubtitle         = document.getElementById('dup-diff-subtitle');
    diffGrid             = document.getElementById('dup-diff-grid');
  }

  function initTabNavigation() {
    if (tabBtnStudio) {
      tabBtnStudio.addEventListener('click', (e) => {
        e.preventDefault();
        switchTab('studio');
      });
    }
    if (tabBtnDupChecker) {
      tabBtnDupChecker.addEventListener('click', (e) => {
        e.preventDefault();
        switchTab('dupchecker');
      });
    }
  }

  function switchTab(tabName) {
    if (tabName === 'dupchecker') {
      if (tabBtnStudio) tabBtnStudio.classList.remove('active');
      if (tabBtnDupChecker) tabBtnDupChecker.classList.add('active');
      if (viewStudio) {
        viewStudio.classList.remove('active');
        viewStudio.style.display = 'none';
      }
      if (viewDupChecker) {
        viewDupChecker.classList.add('active');
        viewDupChecker.style.display = 'flex';
      }
    } else {
      if (tabBtnDupChecker) tabBtnDupChecker.classList.remove('active');
      if (tabBtnStudio) tabBtnStudio.classList.add('active');
      if (viewDupChecker) {
        viewDupChecker.classList.remove('active');
        viewDupChecker.style.display = 'none';
      }
      if (viewStudio) {
        viewStudio.classList.add('active');
        viewStudio.style.display = 'flex';
      }
    }
  }

  function initEventListeners() {
    if (btnBrowsePdfs && dupFileInput) {
      btnBrowsePdfs.addEventListener('click', () => dupFileInput.click());
    }
    if (dupDropzoneBtnFiles && dupFileInput) {
      dupDropzoneBtnFiles.addEventListener('click', () => dupFileInput.click());
    }

    if (btnBrowsePdfFolder) {
      btnBrowsePdfFolder.addEventListener('click', () => openPdfFolderPicker());
    }
    if (dupDropzoneBtnFolder) {
      dupDropzoneBtnFolder.addEventListener('click', () => openPdfFolderPicker());
    }

    if (dupFileInput) {
      dupFileInput.addEventListener('change', async () => {
        if (dupFileInput.files && dupFileInput.files.length > 0) {
          const files = Array.from(dupFileInput.files);
          dupFileInput.value = '';
          await processUploadedFiles(files);
        }
      });
    }

    if (dupFolderInput) {
      dupFolderInput.addEventListener('change', async () => {
        if (dupFolderInput.files && dupFolderInput.files.length > 0) {
          const files = Array.from(dupFolderInput.files);
          dupFolderInput.value = '';
          await processUploadedFiles(files);
        }
      });
    }

    if (selectMatchingMode) {
      selectMatchingMode.addEventListener('change', () => runDuplicateAnalysis());
    }

    if (checkIgnoreCredits) {
      checkIgnoreCredits.addEventListener('change', () => runDuplicateAnalysis());
    }

    if (btnAutoSelectDups) {
      btnAutoSelectDups.addEventListener('click', autoSelectRedundantDuplicates);
    }

    if (btnDownloadCleanZip) {
      btnDownloadCleanZip.addEventListener('click', downloadCleanedZip);
    }

    if (btnExportReport) {
      btnExportReport.addEventListener('click', exportDuplicatesReport);
    }

    if (btnClearAllPdfs) {
      btnClearAllPdfs.addEventListener('click', clearAllPdfs);
    }

    if (dupSearchInput) {
      dupSearchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim().toLowerCase();
        renderResults();
      });
    }

    filterPills.forEach(pill => {
      pill.addEventListener('click', () => {
        filterPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        activeFilter = pill.dataset.filter || 'all';
        renderResults();
      });
    });

    if (btnExpandAllGroups) {
      btnExpandAllGroups.addEventListener('click', () => toggleAllGroups(true));
    }
    if (btnCollapseAllGroups) {
      btnCollapseAllGroups.addEventListener('click', () => toggleAllGroups(false));
    }

    if (diffCloseBtn) diffCloseBtn.addEventListener('click', closeDiffModal);
    if (diffBackdrop) diffBackdrop.addEventListener('click', closeDiffModal);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && diffModal && !diffModal.classList.contains('hidden')) {
        closeDiffModal();
      }
    });
  }

  // ── Drag & Drop for Duplicate Checker ─────────────────────────
  function initDragAndDrop() {
    window.addEventListener('dragover', (e) => {
      if (viewDupChecker && viewDupChecker.style.display !== 'none') {
        if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          if (dupDropzoneEmpty) dupDropzoneEmpty.classList.add('drag-over');
        }
      }
    });

    window.addEventListener('dragleave', (e) => {
      if (e.clientX <= 0 || e.clientY <= 0) {
        if (dupDropzoneEmpty) dupDropzoneEmpty.classList.remove('drag-over');
      }
    });

    window.addEventListener('drop', async (e) => {
      if (viewDupChecker && viewDupChecker.style.display !== 'none') {
        if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
          e.preventDefault();
          if (dupDropzoneEmpty) dupDropzoneEmpty.classList.remove('drag-over');
          await handlePdfDrop(e);
        }
      }
    });
  }

  async function handlePdfDrop(e) {
    const items = Array.from(e.dataTransfer?.items || []);
    const entries = [];
    for (const item of items) {
      if (typeof item.webkitGetAsEntry === 'function') {
        try {
          const ent = item.webkitGetAsEntry();
          if (ent) entries.push(ent);
        } catch (err) {
          console.warn('webkitGetAsEntry failed in dup checker:', err);
        }
      }
    }

    let collectedFiles = [];
    if (entries.length > 0) {
      setDupProgress(true, 5, 'Scanning dropped items for PDFs…');
      collectedFiles = await traverseEntriesForPdfs(entries);
      setDupProgress(false);
    }

    if (collectedFiles.length === 0 && e.dataTransfer?.files?.length > 0) {
      collectedFiles = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
    }

    if (collectedFiles.length > 0) {
      await processUploadedFiles(collectedFiles);
    } else {
      alert('No PDF files found in dropped items. Please upload .pdf documents.');
    }
  }

  async function traverseEntriesForPdfs(entries) {
    const results = [];
    async function traverse(entry, path = '') {
      if (!entry) return;
      if (entry.name === '__MACOSX' || entry.name.startsWith('._') || entry.name.startsWith('.')) return;

      if (entry.isFile) {
        if (entry.name.toLowerCase().endsWith('.pdf')) {
          await new Promise((resolve) => {
            entry.file((file) => {
              file._relativePath = path ? `${path}/${file.name}` : file.name;
              results.push(file);
              resolve();
            }, () => resolve());
          });
        }
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const dirPath = path ? `${path}/${entry.name}` : entry.name;
        const readBatch = () => new Promise(res => reader.readEntries(b => res(b || []), () => res([])));
        let batch;
        do {
          batch = await readBatch();
          if (batch && batch.length > 0) {
            await Promise.all(batch.map(child => traverse(child, dirPath)));
          }
        } while (batch && batch.length > 0);
      }
    }

    for (const ent of entries) {
      await traverse(ent, '');
    }
    return results;
  }

  function openPdfFolderPicker() {
    if (dupFolderInput) dupFolderInput.click();
  }

  async function handlePdfDirectoryHandle(dirHandle) {
    setDupProgress(true, 5, `Scanning folder "${dirHandle.name}" for PDFs…`);
    const files = [];

    async function traverse(handle, path = '') {
      if (handle.name === '__MACOSX' || handle.name.startsWith('.')) return;
      const entries = [];
      for await (const entry of handle.values()) {
        entries.push(entry);
      }
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const currentPath = path ? `${path}/${entry.name}` : entry.name;
        if (entry.kind === 'directory') {
          if (entry.name !== '__MACOSX') {
            await traverse(entry, currentPath);
          }
        } else if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.pdf')) {
          const file = await entry.getFile();
          file._relativePath = `${dirHandle.name}/${currentPath}`;
          files.push(file);
        }
      }
    }

    try {
      await traverse(dirHandle, '');
      if (files.length > 0) {
        await processUploadedFiles(files);
      } else {
        alert(`No .pdf files found in "${dirHandle.name}".`);
      }
    } catch (err) {
      console.error('Failed reading directory for PDFs:', err);
    } finally {
      setDupProgress(false);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // PDF PARSING & DEEP CONTENT FINGERPRINTING ENGINE
  // ══════════════════════════════════════════════════════════════

  async function processUploadedFiles(files) {
    const pdfFiles = files.filter(f => f.name.toLowerCase().endsWith('.pdf'));
    if (pdfFiles.length === 0) {
      alert('Please select .pdf files.');
      return;
    }

    isScanning = true;
    setDupProgress(true, 0, `Reading ${pdfFiles.length} PDF(s)…`);

    const newPdfItems = [];
    for (let i = 0; i < pdfFiles.length; i++) {
      const file = pdfFiles[i];
      const pct = Math.round((i / pdfFiles.length) * 100);
      setDupProgress(true, pct, `Inspecting PDF ${i + 1}/${pdfFiles.length}: "${file.name}"`, `${formatBytes(file.size)}`);

      try {
        const item = await parsePdfDocument(file);
        newPdfItems.push(item);
      } catch (err) {
        console.warn(`Could not parse "${file.name}":`, err);
        newPdfItems.push({
          id: `pdf_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          file,
          name: file.name,
          path: file._relativePath || file.name,
          size: file.size,
          lastModified: file.lastModified,
          pageCount: 1,
          fileHash: `err_${Date.now()}`,
          overallContentHash: `err_${Date.now()}`,
          pages: [],
          hashSet: new Set(),
          status: 'error',
          errorMsg: err.message,
          keep: true,
          isExpanded: false
        });
      }
    }

    // Merge into state (avoid adding exact duplicate file references)
    for (const newItem of newPdfItems) {
      const exists = uploadedPdfs.some(p => p.file === newItem.file || (p.name === newItem.name && p.size === newItem.size && p.fileHash === newItem.fileHash));
      if (!exists) {
        uploadedPdfs.push(newItem);
      }
    }

    setDupProgress(true, 90, 'Running Cross-PDF Content Matching…');
    await runDuplicateAnalysis();

    setDupProgress(false);
    isScanning = false;
  }

  /**
   * Fast byte sequence scanner for typed arrays.
   * Avoids converting huge 100MB+ binary buffers into memory-hogging strings.
   */
  function findByteSequence(u8, seq, startPos = 0) {
    const len = seq.length;
    const max = u8.length - len;
    const first = seq[0];
    for (let i = startPos; i <= max; i++) {
      if (u8[i] === first) {
        let match = true;
        for (let k = 1; k < len; k++) {
          if (u8[i + k] !== seq[k]) {
            match = false;
            break;
          }
        }
        if (match) return i;
      }
    }
    return -1;
  }

  /**
   * Fast, zero-dependency PDF stream scanner & content fingerprinter.
   * Scans PDF byte streams directly to extract embedded images, dimensions, and SHA-256 hashes.
   */
  async function parsePdfDocument(file) {
    if (!file || file.size === 0) {
      throw new Error('File is empty (0 bytes)');
    }

    const buffer = await file.arrayBuffer();
    const u8 = new Uint8Array(buffer);
    const size = buffer.byteLength;

    if (size < 32) {
      throw new Error('File is too small to be a valid PDF');
    }

    // 1. Binary File SHA-256
    const fileDigest = await crypto.subtle.digest('SHA-256', buffer);
    const fileHash = bufferToHex(fileDigest);

    // 2. Validate PDF signature
    const headerStr = new TextDecoder('latin1').decode(u8.subarray(0, 32));
    if (!headerStr.includes('%PDF-')) {
      throw new Error('Not a valid PDF header (%PDF- missing)');
    }

    // 3. Scan for Page Count from trailer / Pages catalog
    let pageCount = 0;
    const latinDecoder = new TextDecoder('latin1');

    // Sample the first 16KB and last 32KB for catalog dictionary
    const headChunk = latinDecoder.decode(u8.subarray(0, Math.min(16384, size)));
    const tailChunk = latinDecoder.decode(u8.subarray(Math.max(0, size - 32768), size));
    const sampleText = headChunk + '\n' + tailChunk;

    // Guard against encrypted or password-protected PDFs
    if (sampleText.includes('/Encrypt') || sampleText.includes('/Filter /Standard')) {
      throw new Error('PDF is password-protected or encrypted (cannot scan contents)');
    }

    const countMatches = sampleText.match(/\/Count\s+(\d+)/g);
    if (countMatches && countMatches.length > 0) {
      for (const cm of countMatches) {
        const n = parseInt(cm.replace('/Count', '').trim(), 10);
        if (n > pageCount) pageCount = n;
      }
    }

    // 4. Extract Embedded Image Streams using direct byte scanning
    const pages = [];
    let searchPos = 0;
    const maxStreamsToScan = 300; // Safeguard against endless loops

    while (pages.length < maxStreamsToScan) {
      const streamIdx = findByteSequence(u8, STREAM_BYTES, searchPos);
      if (streamIdx === -1) break;

      // Inspect the preceding dictionary bytes (up to 600 bytes before 'stream')
      const dictStart = Math.max(0, streamIdx - 600);
      const dictBytes = u8.subarray(dictStart, streamIdx);
      const dictStr = latinDecoder.decode(dictBytes);

      // Check if this stream is an image or page content
      const isImageObj = (dictStr.includes('/Subtype/Image') || dictStr.includes('/Subtype /Image') || dictStr.includes('/Image'));
      const isPageObj = (dictStr.includes('/Type/Page') || dictStr.includes('/Type /Page') || dictStr.includes('/Contents'));

      // Determine stream binary start position (skip 'stream' + CRLF / LF)
      let streamStart = streamIdx + 6;
      if (streamStart < size && u8[streamStart] === 0x0D && u8[streamStart + 1] === 0x0A) {
        streamStart += 2;
      } else if (streamStart < size && (u8[streamStart] === 0x0A || u8[streamStart] === 0x0D)) {
        streamStart += 1;
      }

      // Locate next 'endstream'
      const endstreamIdx = findByteSequence(u8, ENDSTREAM_BYTES, streamStart);
      if (endstreamIdx === -1) break;

      // Trim trailing CRLF before 'endstream'
      let streamEnd = endstreamIdx;
      while (streamEnd > streamStart && (u8[streamEnd - 1] === 0x0A || u8[streamEnd - 1] === 0x0D)) {
        streamEnd--;
      }

      const streamBytes = u8.subarray(streamStart, streamEnd);

      if (streamBytes.length > 100 && (isImageObj || isPageObj || pages.length === 0)) {
        // Extract width & height if available
        const wMatch = dictStr.match(/\/Width\s+(\d+)/);
        const hMatch = dictStr.match(/\/Height\s+(\d+)/);
        const width = wMatch ? parseInt(wMatch[1], 10) : 0;
        const height = hMatch ? parseInt(hMatch[1], 10) : 0;

        // Compute stream SHA-256 hash
        const streamDigest = await crypto.subtle.digest('SHA-256', streamBytes);
        const streamHash = bufferToHex(streamDigest);

        // Check if raw JPEG (starts with 0xFF 0xD8)
        let previewUrl = null;
        const isJpeg = (streamBytes.length > 4 && streamBytes[0] === 0xFF && streamBytes[1] === 0xD8);
        if (isJpeg) {
          try {
            const blob = new Blob([streamBytes], { type: 'image/jpeg' });
            previewUrl = URL.createObjectURL(blob);
          } catch (e) {
            console.warn('Could not create JPEG blob URL:', e);
          }
        }

        pages.push({
          index: pages.length + 1,
          hash: streamHash,
          width,
          height,
          size: streamBytes.length,
          previewUrl,
          isJpeg
        });
      }

      searchPos = endstreamIdx + 9;
    }

    if (pageCount === 0) {
      pageCount = Math.max(1, pages.length);
    }

    // 5. Compute Overall Content Digest (order-preserving content fingerprint)
    const combinedPageHashes = pages.map(p => p.hash).join('|');
    const enc = new TextEncoder();
    const contentDigest = await crypto.subtle.digest('SHA-256', enc.encode(combinedPageHashes || fileHash));
    const overallContentHash = bufferToHex(contentDigest);

    const hashSet = new Set(pages.map(p => p.hash));

    return {
      id: `pdf_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      file,
      name: file.name,
      path: file._relativePath || file.name,
      size,
      lastModified: file.lastModified,
      pageCount,
      fileHash,
      overallContentHash,
      pages,
      hashSet,
      status: 'ready',
      keep: true,
      isExpanded: false
    };
  }

  function bufferToHex(buffer) {
    const u8 = new Uint8Array(buffer);
    let hex = '';
    for (let i = 0; i < u8.length; i++) {
      hex += u8[i].toString(16).padStart(2, '0');
    }
    return hex;
  }

  // ══════════════════════════════════════════════════════════════
  // DUPLICATE ANALYSIS & COMPARISON ENGINE
  // ══════════════════════════════════════════════════════════════

  async function runDuplicateAnalysis() {
    if (uploadedPdfs.length === 0) {
      duplicateGroups = [];
      uniquePdfs = [];
      renderResults();
      return;
    }

    const mode = selectMatchingMode ? selectMatchingMode.value : 'smart';
    const ignoreCredits = checkIgnoreCredits ? checkIgnoreCredits.checked : true;

    const visited = new Set();
    const groups = [];
    const pairedMatches = new Map(); // "idA__idB" => matchResult

    // 1. Identify Scanlation Banner / Watermark Hashes (hashes appearing in >= 3 files)
    const hashFreq = new Map();
    for (const pdf of uploadedPdfs) {
      for (const h of pdf.hashSet) {
        hashFreq.set(h, (hashFreq.get(h) || 0) + 1);
      }
    }
    const globalBannerHashes = new Set();
    if (ignoreCredits) {
      for (const [h, freq] of hashFreq.entries()) {
        if (freq >= 3) globalBannerHashes.add(h);
      }
    }

    // 2. Pairwise Comparison Matrix
    for (let i = 0; i < uploadedPdfs.length; i++) {
      const pdfA = uploadedPdfs[i];
      for (let j = i + 1; j < uploadedPdfs.length; j++) {
        const pdfB = uploadedPdfs[j];
        const matchRes = comparePdfPair(pdfA, pdfB, mode, globalBannerHashes);
        if (matchRes.isDuplicate) {
          pairedMatches.set(`${pdfA.id}__${pdfB.id}`, matchRes);
          pairedMatches.set(`${pdfB.id}__${pdfA.id}`, matchRes);
        }
      }
    }

    // 3. Cluster Connected Duplicate Pairs into Groups (Disjoint Set / Union Find)
    for (const pdf of uploadedPdfs) {
      if (visited.has(pdf.id)) continue;

      const cluster = [pdf];
      visited.add(pdf.id);
      const queue = [pdf];

      while (queue.length > 0) {
        const curr = queue.shift();
        for (const other of uploadedPdfs) {
          if (!visited.has(other.id)) {
            const pairKey = `${curr.id}__${other.id}`;
            if (pairedMatches.has(pairKey)) {
              visited.add(other.id);
              cluster.push(other);
              queue.push(other);
            }
          }
        }
      }

      if (cluster.length > 1) {
        // Determine primary match reason for this group
        const groupMatch = pairedMatches.get(`${cluster[0].id}__${cluster[1].id}`) || {
          matchType: 'exact',
          score: 1.0,
          label: 'Exact Duplicate',
          details: 'Identical content detected.'
        };

        groups.push({
          id: `grp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          items: cluster,
          matchType: groupMatch.matchType,
          similarityScore: groupMatch.score,
          label: groupMatch.label,
          details: groupMatch.details,
          isExpanded: true
        });
      }
    }

    // 4. Identify Verified Unique PDFs
    const groupedIds = new Set(groups.flatMap(g => g.items.map(i => i.id)));
    uniquePdfs = uploadedPdfs.filter(p => !groupedIds.has(p.id));
    duplicateGroups = groups;

    // Update Header Badges & Stats
    updateStatsSummary();
    renderResults();
  }

  function comparePdfPair(pdfA, pdfB, mode, bannerHashes) {
    // 1. Binary Identical (100% Exact File Hash)
    if (pdfA.fileHash === pdfB.fileHash) {
      return {
        isDuplicate: true,
        matchType: 'exact_binary',
        score: 1.0,
        label: '100% Binary Exact Match',
        details: 'Identical file bytes and cryptographic signature.'
      };
    }

    // 2. Exact Content Hash (All extracted page hashes match identically)
    if (pdfA.overallContentHash && pdfA.overallContentHash === pdfB.overallContentHash) {
      return {
        isDuplicate: true,
        matchType: 'exact_content',
        score: 1.0,
        label: '100% Content Match',
        details: `All ${pdfA.pageCount} page(s) contain identical visual content.`
      };
    }

    // 3. Name Normalization
    const nameA = normalizeMangaFilename(pdfA.name);
    const nameB = normalizeMangaFilename(pdfB.name);
    const isNameMatch = (nameA.length > 3 && nameA === nameB);

    if (mode === 'name_only') {
      return {
        isDuplicate: isNameMatch,
        matchType: 'name_collision',
        score: isNameMatch ? 1.0 : 0,
        label: 'Filename Duplicate',
        details: 'Filenames match after title normalization.'
      };
    }

    // 4. Page-Level Content Overlap Analysis
    const effectivePagesA = pdfA.pages.filter(p => !bannerHashes.has(p.hash));
    const effectivePagesB = pdfB.pages.filter(p => !bannerHashes.has(p.hash));

    const setB = new Set(effectivePagesB.map(p => p.hash));
    const sharedPages = effectivePagesA.filter(p => setB.has(p.hash)).length;
    const maxPages = Math.max(effectivePagesA.length, effectivePagesB.length);

    const overlapRatio = maxPages > 0 ? (sharedPages / maxPages) : 0;

    // Strict Mode: requires 100% identical page hashes
    if (mode === 'strict') {
      const isStrict = (overlapRatio === 1.0 && pdfA.pageCount === pdfB.pageCount);
      return {
        isDuplicate: isStrict,
        matchType: 'exact_content',
        score: overlapRatio,
        label: '100% Exact Pages',
        details: `${sharedPages} of ${maxPages} pages identical.`
      };
    }

    // Smart & High Similarity Modes
    const similarityThreshold = (mode === 'near') ? 0.75 : 0.80;

    if (overlapRatio >= similarityThreshold) {
      const pct = Math.round(overlapRatio * 100);
      return {
        isDuplicate: true,
        matchType: 'near_duplicate',
        score: overlapRatio,
        label: `${pct}% Content Match`,
        details: `${sharedPages} shared pages (${pdfA.pageCount} vs ${pdfB.pageCount} pages).`
      };
    }

    // Subset / Superset Check (Chapter inside Volume)
    const minPages = Math.min(effectivePagesA.length, effectivePagesB.length);
    if (minPages >= 5 && sharedPages === minPages) {
      const smaller = effectivePagesA.length < effectivePagesB.length ? pdfA.name : pdfB.name;
      return {
        isDuplicate: true,
        matchType: 'subset',
        score: 0.90,
        label: 'Subset / Volume Containment',
        details: `All pages of "${truncateStr(smaller, 25)}" exist in the other file.`
      };
    }

    // Name Collision with Different Content
    if (isNameMatch && (mode === 'smart' || mode === 'name_only')) {
      return {
        isDuplicate: true,
        matchType: 'name_collision',
        score: 0.50,
        label: 'Name Match (Different Content)',
        details: `Same normalized title, but page contents differ (${sharedPages}/${maxPages} shared).`
      };
    }

    return { isDuplicate: false, score: overlapRatio };
  }

  function normalizeMangaFilename(filename) {
    return filename
      .toLowerCase()
      .replace(/\.pdf$/i, '')
      .replace(/\[[^\]]*\]/g, '')  // remove [Scanlator]
      .replace(/\([^\)]*\)/g, '')  // remove (HQ)
      .replace(/[-_.]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/ch(apter)?\s*0*(\d+)/i, 'ch$2') // normalize chapter numbers
      .trim();
  }

  // ══════════════════════════════════════════════════════════════
  // UI RENDERING & USER ACTIONS
  // ══════════════════════════════════════════════════════════════

  function updateStatsSummary() {
    const totalPdfs = uploadedPdfs.length;
    const totalPages = uploadedPdfs.reduce((sum, p) => sum + p.pageCount, 0);
    const dupCount = duplicateGroups.length;

    // Calculate reclaimable redundant space (sum of sizes of items marked !keep)
    let reclaimableBytes = 0;
    for (const grp of duplicateGroups) {
      const excludedItems = grp.items.filter(item => !item.keep);
      reclaimableBytes += excludedItems.reduce((s, i) => s + i.size, 0);
    }

    if (statTotalPdfs)  statTotalPdfs.textContent = totalPdfs;
    if (statTotalPages) statTotalPages.textContent = totalPages;
    if (statDupSets)    statDupSets.textContent = dupCount;
    if (statSavedSpace) statSavedSpace.textContent = formatBytes(reclaimableBytes);

    if (navDupBadge) {
      if (dupCount > 0) {
        navDupBadge.textContent = `${dupCount} Dup Set${dupCount !== 1 ? 's' : ''}`;
        navDupBadge.style.display = 'inline-block';
      } else {
        navDupBadge.style.display = 'none';
      }
    }
  }

  function renderResults() {
    const hasFiles = uploadedPdfs.length > 0;
    if (dupDropzoneEmpty)    dupDropzoneEmpty.style.display    = hasFiles ? 'none' : 'flex';
    if (dupResultsContainer) dupResultsContainer.style.display = hasFiles ? 'block' : 'none';

    if (!hasFiles) return;

    // Filter Duplicate Groups
    let filteredGroups = duplicateGroups;
    if (activeFilter === 'exact') {
      filteredGroups = duplicateGroups.filter(g => g.matchType === 'exact_binary' || g.matchType === 'exact_content');
    } else if (activeFilter === 'near') {
      filteredGroups = duplicateGroups.filter(g => g.matchType === 'near_duplicate' || g.matchType === 'subset');
    } else if (activeFilter === 'unique') {
      filteredGroups = [];
    }

    if (searchQuery) {
      filteredGroups = filteredGroups.filter(g =>
        g.items.some(item => item.name.toLowerCase().includes(searchQuery))
      );
    }

    // Filter Unique Files
    let filteredUnique = uniquePdfs;
    if (activeFilter === 'dups' || activeFilter === 'exact' || activeFilter === 'near') {
      filteredUnique = [];
    }
    if (searchQuery) {
      filteredUnique = filteredUnique.filter(p => p.name.toLowerCase().includes(searchQuery));
    }

    renderDuplicateGroupsList(filteredGroups);
    renderUniqueList(filteredUnique);
  }

  function renderDuplicateGroupsList(groups) {
    if (!dupGroupsSection) return;
    dupGroupsSection.innerHTML = '';

    if (groups.length === 0) {
      if (activeFilter !== 'unique') {
        const emptyNotice = document.createElement('div');
        emptyNotice.className = 'dup-empty-notice';
        emptyNotice.innerHTML = `
          <div style="font-size: 24px; margin-bottom: 6px;">🎉</div>
          <strong>No Duplicate PDFs Found</strong>
          <p style="color: var(--text-muted); font-size: 12px; margin-top: 4px;">All uploaded PDF files are unique according to selected criteria.</p>
        `;
        dupGroupsSection.appendChild(emptyNotice);
      }
      return;
    }

    groups.forEach((group, gIdx) => {
      const card = document.createElement('div');
      card.className = `dup-group-card match-${group.matchType}`;
      card.dataset.groupId = group.id;

      // Group Header
      const header = document.createElement('div');
      header.className = 'dup-group-header';

      const leftInfo = document.createElement('div');
      leftInfo.className = 'dup-group-title-info';

      const badge = document.createElement('span');
      badge.className = `dup-badge-type ${group.matchType}`;
      badge.textContent = group.label;

      const groupTitle = document.createElement('h3');
      groupTitle.className = 'dup-group-title';
      groupTitle.textContent = `Duplicate Set #${gIdx + 1} (${group.items.length} Files)`;

      const groupSubtitle = document.createElement('span');
      groupSubtitle.className = 'dup-group-subtitle';
      groupSubtitle.textContent = group.details;

      leftInfo.appendChild(badge);
      leftInfo.appendChild(groupTitle);
      leftInfo.appendChild(groupSubtitle);

      // Group Header Quick Actions
      const rightActions = document.createElement('div');
      rightActions.className = 'dup-group-actions';

      const btnKeepFirst = document.createElement('button');
      btnKeepFirst.className = 'small-btn secondary';
      btnKeepFirst.textContent = 'Keep 1st (Exclude Others)';
      btnKeepFirst.title = 'Keep the first file and mark all other duplicates in this group for exclusion';
      btnKeepFirst.addEventListener('click', () => {
        group.items.forEach((item, idx) => item.keep = (idx === 0));
        updateStatsSummary();
        renderResults();
      });

      const btnCompareSideBySide = document.createElement('button');
      btnCompareSideBySide.className = 'small-btn warning';
      btnCompareSideBySide.textContent = '🔍 Visual Page Diff';
      btnCompareSideBySide.title = 'Open full-screen side-by-side visual page comparison';
      btnCompareSideBySide.addEventListener('click', () => {
        openDiffModal(group.items[0], group.items[1]);
      });

      const btnToggle = document.createElement('button');
      btnToggle.className = 'icon-btn';
      btnToggle.innerHTML = group.isExpanded ? '▲' : '▼';
      btnToggle.title = 'Collapse/Expand group';
      btnToggle.addEventListener('click', () => {
        group.isExpanded = !group.isExpanded;
        renderResults();
      });

      rightActions.appendChild(btnKeepFirst);
      if (group.items.length >= 2) rightActions.appendChild(btnCompareSideBySide);
      rightActions.appendChild(btnToggle);

      header.appendChild(leftInfo);
      header.appendChild(rightActions);
      card.appendChild(header);

      // Items Container
      if (group.isExpanded) {
        const itemsList = document.createElement('div');
        itemsList.className = 'dup-items-grid';

        group.items.forEach((item) => {
          const itemEl = document.createElement('div');
          itemEl.className = `dup-file-row ${item.keep ? 'keep' : 'exclude'}`;

          // Selection checkbox
          const checkLabel = document.createElement('label');
          checkLabel.className = 'checkbox-container';
          checkLabel.style.margin = '0';
          const checkInput = document.createElement('input');
          checkInput.type = 'checkbox';
          checkInput.checked = item.keep;
          checkInput.title = item.keep ? 'Keep this file' : 'Marked for exclusion/deletion';
          checkInput.addEventListener('change', () => {
            item.keep = checkInput.checked;
            itemEl.className = `dup-file-row ${item.keep ? 'keep' : 'exclude'}`;
            updateStatsSummary();
          });
          checkLabel.appendChild(checkInput);

          // Cover thumbnail preview
          const firstPage = item.pages[0];
          const thumbWrap = document.createElement('div');
          thumbWrap.className = 'dup-thumb-wrap';
          if (firstPage && firstPage.previewUrl) {
            const thumbImg = document.createElement('img');
            thumbImg.src = firstPage.previewUrl;
            thumbImg.className = 'dup-thumb-img';
            thumbImg.alt = 'Cover';
            thumbImg.loading = 'lazy';
            thumbWrap.appendChild(thumbImg);
          } else {
            thumbWrap.innerHTML = `<div class="dup-thumb-placeholder">📄 PDF</div>`;
          }

          // Metadata Info
          const metaBox = document.createElement('div');
          metaBox.className = 'dup-file-info';

          const titleRow = document.createElement('div');
          titleRow.className = 'dup-file-title';
          titleRow.textContent = item.name;
          titleRow.title = item.path || item.name;

          const detailRow = document.createElement('div');
          detailRow.className = 'dup-file-meta';
          detailRow.innerHTML = `
            <span><strong>${item.pageCount}</strong> pages</span>
            <span>•</span>
            <span>${formatBytes(item.size)}</span>
            <span>•</span>
            <span class="dup-hash-pill" title="Content Hash: ${item.overallContentHash}">#${item.overallContentHash.substring(0, 8)}</span>
            ${!item.keep ? '<span class="exclude-tag">WILL BE REMOVED</span>' : '<span class="keep-tag">KEEPER</span>'}
          `;

          metaBox.appendChild(titleRow);
          metaBox.appendChild(detailRow);

          // Page previews strip
          const pagesStrip = document.createElement('div');
          pagesStrip.className = 'dup-pages-mini-strip';
          const previewPages = item.pages.slice(0, 8);
          previewPages.forEach((p, pIdx) => {
            const miniThumb = document.createElement('div');
            miniThumb.className = 'dup-mini-page';
            miniThumb.title = `Page ${pIdx + 1} (#${p.hash.substring(0, 6)})`;
            if (p.previewUrl) {
              miniThumb.innerHTML = `<img src="${p.previewUrl}" alt="p${pIdx + 1}">`;
            } else {
              miniThumb.textContent = `#${pIdx + 1}`;
            }
            pagesStrip.appendChild(miniThumb);
          });
          if (item.pages.length > 8) {
            const moreTag = document.createElement('span');
            moreTag.className = 'dup-more-pages';
            moreTag.textContent = `+${item.pages.length - 8} more`;
            pagesStrip.appendChild(moreTag);
          }
          metaBox.appendChild(pagesStrip);

          // Row Actions
          const rowActions = document.createElement('div');
          rowActions.className = 'dup-row-actions';

          const btnViewPdf = document.createElement('button');
          btnViewPdf.className = 'small-btn secondary';
          btnViewPdf.textContent = '👁️ Open PDF';
          btnViewPdf.title = 'Open PDF in a new browser tab';
          btnViewPdf.addEventListener('click', () => {
            const blobUrl = URL.createObjectURL(item.file);
            window.open(blobUrl, '_blank');
          });

          const btnRemoveItem = document.createElement('button');
          btnRemoveItem.className = 'icon-btn danger';
          btnRemoveItem.innerHTML = '✕';
          btnRemoveItem.title = 'Remove from duplicate checker list';
          btnRemoveItem.addEventListener('click', () => {
            uploadedPdfs = uploadedPdfs.filter(p => p.id !== item.id);
            runDuplicateAnalysis();
          });

          rowActions.appendChild(btnViewPdf);
          rowActions.appendChild(btnRemoveItem);

          itemEl.appendChild(checkLabel);
          itemEl.appendChild(thumbWrap);
          itemEl.appendChild(metaBox);
          itemEl.appendChild(rowActions);

          itemsList.appendChild(itemEl);
        });

        card.appendChild(itemsList);
      }

      dupGroupsSection.appendChild(card);
    });
  }

  function renderUniqueList(uniques) {
    if (!dupUniqueSection) return;
    dupUniqueSection.innerHTML = '';

    if (uniques.length === 0) return;

    const wrap = document.createElement('div');
    wrap.className = 'dup-unique-wrap';

    const header = document.createElement('div');
    header.className = 'dup-unique-header';
    header.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="badge" style="background:rgba(16, 185, 129, 0.2); color:#34d399; border:1px solid rgba(16, 185, 129, 0.4);">
          ✓ ${uniques.length} Unique Verified PDF(s)
        </span>
        <span style="color:var(--text-muted); font-size:12px;">Zero duplicate content detected</span>
      </div>
    `;

    const grid = document.createElement('div');
    grid.className = 'dup-unique-grid';

    uniques.forEach(item => {
      const el = document.createElement('div');
      el.className = 'dup-unique-item';
      el.innerHTML = `
        <div style="font-weight:600; font-size:12px; color:#f8fafc; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escHtml(item.name)}">
          📄 ${escHtml(item.name)}
        </div>
        <div style="font-size:11px; color:var(--text-muted); margin-top:2px; display:flex; justify-content:space-between;">
          <span>${item.pageCount} pgs</span>
          <span>${formatBytes(item.size)}</span>
        </div>
      `;
      grid.appendChild(el);
    });

    wrap.appendChild(header);
    wrap.appendChild(grid);
    dupUniqueSection.appendChild(wrap);
  }

  function autoSelectRedundantDuplicates() {
    if (duplicateGroups.length === 0) {
      alert('No duplicate groups to select.');
      return;
    }

    let excludedCount = 0;
    duplicateGroups.forEach(grp => {
      grp.items.forEach((item, idx) => {
        if (idx === 0) {
          item.keep = true;
        } else {
          item.keep = false;
          excludedCount++;
        }
      });
    });

    updateStatsSummary();
    renderResults();
    alert(`Auto-selected ${excludedCount} redundant duplicate PDF(s) for removal. The original/first copy in each group is preserved.`);
  }

  async function downloadCleanedZip() {
    const keepers = uploadedPdfs.filter(p => p.keep);
    if (keepers.length === 0) {
      alert('No files are marked to keep.');
      return;
    }

    if (typeof JSZip === 'undefined') {
      alert('JSZip library not available.');
      return;
    }

    const zip = new JSZip();
    setDupProgress(true, 10, `Bundling ${keepers.length} unique PDF(s) into ZIP archive…`);

    for (let i = 0; i < keepers.length; i++) {
      const item = keepers[i];
      const pct = Math.round(10 + (i / keepers.length) * 80);
      setDupProgress(true, pct, `Adding "${item.name}" to ZIP (${i + 1}/${keepers.length})…`);
      const buffer = await item.file.arrayBuffer();
      zip.file(item.name, buffer);
    }

    setDupProgress(true, 95, 'Compressing ZIP bundle…');
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    downloadBlob(zipBlob, `Cleaned_Manga_PDFs_${timestamp}.zip`);

    setDupProgress(false);
    alert(`Success! ${keepers.length} unique/cleaned PDFs bundled and downloaded as ZIP.`);
  }

  function exportDuplicatesReport() {
    if (uploadedPdfs.length === 0) {
      alert('No PDFs to export report for.');
      return;
    }

    const report = {
      generatedAt: new Date().toISOString(),
      totalPdfsAnalyzed: uploadedPdfs.length,
      duplicateGroupsCount: duplicateGroups.length,
      uniquePdfsCount: uniquePdfs.length,
      duplicateSets: duplicateGroups.map(grp => ({
        matchType: grp.matchType,
        similarity: grp.similarityScore,
        details: grp.details,
        files: grp.items.map(i => ({
          name: i.name,
          path: i.path,
          size: i.size,
          pages: i.pageCount,
          fingerprint: i.overallContentHash,
          action: i.keep ? 'KEEP' : 'REMOVE'
        }))
      })),
      uniqueFiles: uniquePdfs.map(u => ({
        name: u.name,
        size: u.size,
        pages: u.pageCount
      }))
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `PDF_Duplicates_Report_${Date.now()}.json`);
  }

  function clearAllPdfs() {
    if (uploadedPdfs.length === 0) return;
    if (!confirm('Clear all uploaded PDFs and comparison results?')) return;

    uploadedPdfs.forEach(p => {
      p.pages.forEach(pg => {
        if (pg.previewUrl) URL.revokeObjectURL(pg.previewUrl);
      });
    });

    uploadedPdfs = [];
    duplicateGroups = [];
    uniquePdfs = [];
    updateStatsSummary();
    renderResults();
  }

  function toggleAllGroups(expand) {
    duplicateGroups.forEach(g => g.isExpanded = expand);
    renderResults();
  }

  // ══════════════════════════════════════════════════════════════
  // VISUAL PAGE-BY-PAGE DIFF MODAL
  // ══════════════════════════════════════════════════════════════

  function openDiffModal(fileA, fileB) {
    if (!fileA || !fileB || !diffModal) return;
    activeDiffPair = { fileA, fileB };

    if (diffTitle)    diffTitle.textContent = `Visual Content Diff: "${truncateStr(fileA.name, 30)}" vs "${truncateStr(fileB.name, 30)}"`;
    if (diffSubtitle) diffSubtitle.textContent = `File A (${fileA.pageCount} pgs, ${formatBytes(fileA.size)}) vs File B (${fileB.pageCount} pgs, ${formatBytes(fileB.size)})`;

    renderDiffGrid(fileA, fileB);
    diffModal.classList.remove('hidden');
  }

  function closeDiffModal() {
    if (diffModal) diffModal.classList.add('hidden');
    activeDiffPair = null;
  }

  function renderDiffGrid(fileA, fileB) {
    if (!diffGrid) return;
    diffGrid.innerHTML = '';

    const maxPgs = Math.max(fileA.pages.length, fileB.pages.length);
    for (let i = 0; i < maxPgs; i++) {
      const pageA = fileA.pages[i];
      const pageB = fileB.pages[i];

      const isMatch = (pageA && pageB && pageA.hash === pageB.hash);

      const row = document.createElement('div');
      row.className = `diff-pair-card ${isMatch ? 'match' : 'diff'}`;

      // Left: Page A
      const leftCol = document.createElement('div');
      leftCol.className = 'diff-col';
      if (pageA) {
        leftCol.innerHTML = `
          <div class="diff-page-num">File A · Page ${i + 1}</div>
          <div class="diff-img-box">
            ${pageA.previewUrl ? `<img src="${pageA.previewUrl}" alt="A-${i+1}">` : `<div class="diff-placeholder">📄 Page ${i+1}</div>`}
          </div>
          <div class="diff-hash">#${pageA.hash.substring(0, 8)}</div>
        `;
      } else {
        leftCol.innerHTML = `<div class="diff-empty-slot">No Page (End of File A)</div>`;
      }

      // Middle: Match Indicator Badge
      const midCol = document.createElement('div');
      midCol.className = 'diff-status-col';
      midCol.innerHTML = isMatch
        ? `<span class="diff-pill match">✓ MATCH</span>`
        : `<span class="diff-pill diff">≠ DIFF</span>`;

      // Right: Page B
      const rightCol = document.createElement('div');
      rightCol.className = 'diff-col';
      if (pageB) {
        rightCol.innerHTML = `
          <div class="diff-page-num">File B · Page ${i + 1}</div>
          <div class="diff-img-box">
            ${pageB.previewUrl ? `<img src="${pageB.previewUrl}" alt="B-${i+1}">` : `<div class="diff-placeholder">📄 Page ${i+1}</div>`}
          </div>
          <div class="diff-hash">#${pageB.hash.substring(0, 8)}</div>
        `;
      } else {
        rightCol.innerHTML = `<div class="diff-empty-slot">No Page (End of File B)</div>`;
      }

      row.appendChild(leftCol);
      row.appendChild(midCol);
      row.appendChild(rightCol);
      diffGrid.appendChild(row);
    }
  }

  // ── Helper Utilities ──────────────────────────────────────────
  function setDupProgress(visible, pct = 0, statusText = '', subText = '') {
    if (!dupProgressWrap) return;
    dupProgressWrap.style.display = visible ? 'block' : 'none';
    if (dupProgressFill)   dupProgressFill.style.width   = `${Math.min(100, Math.round(pct))}%`;
    if (dupProgressPct)    dupProgressPct.textContent    = `${Math.min(100, Math.round(pct))}%`;
    if (dupProgressStatus) dupProgressStatus.textContent = statusText;
    if (dupProgressSub)    dupProgressSub.textContent    = subText;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 2000);
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const dm = 1;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  function truncateStr(str, n) {
    return (str && str.length > n) ? str.substr(0, n - 1) + '…' : (str || '');
  }

  function escHtml(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

})();
