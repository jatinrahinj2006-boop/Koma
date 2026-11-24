/**
 * Manhwa & Manga Batch Downloader - Service Worker (v1.3.4 Safe Network & Dynamic Tab Tracker)
 * Bundles Scoped JSZip directly so Chrome's service worker bytecode cache never serves stale zip logic.
 */

// ============================================================
// BUNDLED PURE-JS SCOPED ZIP ENGINE (v1.3.4)
// ============================================================
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c >>> 0;
}

function computeCRC32(uint8Array) {
  if (!uint8Array || uint8Array.length === 0) return 0;
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < uint8Array.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ uint8Array[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

const DOS_TIME_DEFAULT = 0x6000;
const DOS_DATE_DEFAULT = 0x5C21;

class JSZip {
  constructor(root = null, prefix = '') {
    this.root = root || this;
    this.prefix = prefix || '';
    this.files = root ? root.files : {};
  }

  file(name, data, options = {}) {
    if (!name) return null;
    const cleanName = name.startsWith('/') ? name.slice(1) : name;
    const fullPath = this.prefix + cleanName;

    if (arguments.length === 1 || data === undefined) {
      return this.root.files[fullPath] || null;
    }

    if (data === null) {
      delete this.root.files[fullPath];
      return this;
    }

    this.root.files[fullPath] = {
      name: fullPath,
      data: data,
      options: options || {}
    };
    return this;
  }

  folder(name) {
    if (!name) return this;
    let cleanName = name.startsWith('/') ? name.slice(1) : name;
    if (!cleanName.endsWith('/')) cleanName += '/';
    const fullPath = this.prefix + cleanName;

    if (!this.root.files[fullPath]) {
      this.root.files[fullPath] = {
        name: fullPath,
        data: new Uint8Array(0),
        options: { dir: true }
      };
    }
    return new JSZip(this.root, fullPath);
  }

  /**
   * Memory-safe streaming ZIP generator.
   *
   * OLD approach (crashed browser):
   *   - Built entries[] holding ALL contentBytes simultaneously  → peak RAM = 2× archive size
   *   - Then assembled final blob from entries[]                 → another full copy in Blob
   *
   * NEW approach (this implementation):
   *   - Streams each file's local-header + data directly into dataChunks[] and immediately
   *     deletes the source from zip.files so the GC can reclaim it.
   *   - cdMeta[] holds only tiny per-file metadata (numbers + name bytes), never the actual data.
   *   - Peak RAM = 1× archive size (the dataChunks[] array) + negligible metadata.
   *
   * Yield points every YIELD_EVERY files prevent blocking Chrome's MV3 30 s termination watchdog.
   */
  async generateAsync(options = { type: 'blob' }, onProgress = null) {
    const targetFiles = this.root.files;
    const fileKeys = Object.keys(targetFiles);
    const encoder = new TextEncoder();
    const YIELD_EVERY = 8; // yield every N files

    // --- Phase 1: Stream local entries ---
    // dataChunks holds the entire ZIP byte stream as small typed-array slices.
    // cdMeta holds only the metadata needed to write the central directory (no data copies).
    const dataChunks = [];
    const cdMeta = [];
    let currentOffset = 0;
    const totalFiles = fileKeys.length;

    for (let i = 0; i < totalFiles; i++) {
      if (i > 0 && i % YIELD_EVERY === 0) {
        await new Promise(r => setTimeout(r, 0)); // yield → reset termination watchdog
      }

      const key = fileKeys[i];
      const item = targetFiles[key];

      // --- Resolve raw data ---
      let rawData = item.data;
      if (rawData && typeof rawData.then === 'function') rawData = await rawData;

      let contentBytes;
      if (rawData instanceof Uint8Array) {
        contentBytes = rawData;
      } else if (ArrayBuffer.isView(rawData)) {
        contentBytes = new Uint8Array(rawData.buffer, rawData.byteOffset, rawData.byteLength);
      } else if (rawData instanceof ArrayBuffer || (rawData && rawData.byteLength !== undefined && typeof rawData.slice === 'function')) {
        contentBytes = new Uint8Array(rawData);
      } else if (typeof Blob !== 'undefined' && rawData instanceof Blob) {
        contentBytes = new Uint8Array(await rawData.arrayBuffer());
      } else if (typeof rawData === 'string') {
        contentBytes = encoder.encode(rawData);
      } else {
        contentBytes = new Uint8Array(0);
      }

      const isDir = (item.options && item.options.dir) || item.name.endsWith('/');
      if (isDir) contentBytes = new Uint8Array(0);

      const nameBytes = encoder.encode(item.name);
      const crc = isDir ? 0 : computeCRC32(contentBytes);
      const dataLen = contentBytes.length;

      // --- Build local file header (30 + nameLen bytes) ---
      const localHeader = new Uint8Array(30 + nameBytes.length);
      const lhv = new DataView(localHeader.buffer);
      lhv.setUint32(0, 0x04034b50, true);
      lhv.setUint16(4, 20, true);
      lhv.setUint16(6, 0x0800, true);
      lhv.setUint16(8, 0, true);
      lhv.setUint16(10, DOS_TIME_DEFAULT, true);
      lhv.setUint16(12, DOS_DATE_DEFAULT, true);
      lhv.setUint32(14, crc, true);
      lhv.setUint32(18, dataLen, true);
      lhv.setUint32(22, dataLen, true);
      lhv.setUint16(26, nameBytes.length, true);
      lhv.setUint16(28, 0, true);
      localHeader.set(nameBytes, 30);

      // --- Stream into dataChunks immediately (no entries[] accumulation) ---
      cdMeta.push({ nameBytes, isDir, crc, dataLen, localHeaderOffset: currentOffset });
      dataChunks.push(localHeader);
      if (dataLen > 0) dataChunks.push(contentBytes);
      currentOffset += localHeader.length + dataLen;

      // FREE the source data from zip.files immediately so GC can reclaim it
      // (safe because we've already streamed it into dataChunks)
      delete targetFiles[key];

      if (onProgress && typeof onProgress === 'function') {
        onProgress({ percent: Math.round(((i + 1) / totalFiles) * 90) }); // 0–90% = data phase
      }
    }

    // --- Phase 2: Central directory (small metadata only, no data) ---
    await new Promise(r => setTimeout(r, 0));
    const centralDirStart = currentOffset;

    for (let i = 0; i < cdMeta.length; i++) {
      if (i > 0 && i % YIELD_EVERY === 0) await new Promise(r => setTimeout(r, 0));

      const m = cdMeta[i];
      const cdHeader = new Uint8Array(46 + m.nameBytes.length);
      const cdv = new DataView(cdHeader.buffer);
      cdv.setUint32(0, 0x02014b50, true);
      cdv.setUint16(4, 0x0314, true); // Unix 2.0
      cdv.setUint16(6, 20, true);
      cdv.setUint16(8, 0x0800, true);
      cdv.setUint16(10, 0, true);
      cdv.setUint16(12, DOS_TIME_DEFAULT, true);
      cdv.setUint16(14, DOS_DATE_DEFAULT, true);
      cdv.setUint32(16, m.crc, true);
      cdv.setUint32(20, m.dataLen, true);
      cdv.setUint32(24, m.dataLen, true);
      cdv.setUint16(28, m.nameBytes.length, true);
      cdv.setUint16(30, 0, true);
      cdv.setUint16(32, 0, true);
      cdv.setUint16(34, 0, true);
      cdv.setUint16(36, 0, true);
      cdv.setUint32(38, m.isDir ? 0x41ED0010 : 0x81A40000, true);
      cdv.setUint32(42, m.localHeaderOffset, true);
      cdHeader.set(m.nameBytes, 46);

      dataChunks.push(cdHeader);
      currentOffset += cdHeader.length;
    }

    const centralDirSize = currentOffset - centralDirStart;

    // --- Phase 3: End of central directory record ---
    await new Promise(r => setTimeout(r, 0));
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, cdMeta.length, true);
    ev.setUint16(10, cdMeta.length, true);
    ev.setUint32(12, centralDirSize, true);
    ev.setUint32(16, centralDirStart, true);
    ev.setUint16(20, 0, true);
    dataChunks.push(eocd);

    if (onProgress) onProgress({ percent: 100 });

    // --- Assemble final Blob from pre-built chunks (no additional copies) ---
    const mimeType = 'application/zip';
    if (options.type === 'blob') {
      return new Blob(dataChunks, { type: mimeType });
    }
    // For uint8array / arraybuffer: flatten into single buffer
    const totalSize = dataChunks.reduce((s, c) => s + c.byteLength, 0);
    const finalBuf = new Uint8Array(totalSize);
    let pos = 0;
    for (const chunk of dataChunks) {
      finalBuf.set(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk.buffer || chunk), pos);
      pos += chunk.byteLength;
    }
    if (options.type === 'uint8array') return finalBuf;
    if (options.type === 'arraybuffer') return finalBuf.buffer;
    return new Blob([finalBuf], { type: mimeType });
  }
}

self.JSZip = JSZip;

// Verification self-test on startup:
try {
  const _testZip = new JSZip();
  const _testFolder = _testZip.folder('Ch_Test');
  _testFolder.file('001.jpg', new Uint8Array([0xFF, 0xD8, 0xFF]));
  if (!_testZip.files['Ch_Test/001.jpg']) {
    throw new Error('Scoped folder verification failed');
  }
  console.log('[Service Worker v1.3.1] Bundled Scoped JSZip successfully verified active!');
} catch (e) {
  console.error('[Service Worker v1.3.4] Critical JSZip verification failure:', e);
}

console.log('[Manhwa Service Worker v1.3.4] Service worker loaded.');

// Ensure any lingering DNR rules from previous sessions are cleaned up immediately on load
cleanupRefererRule();

let isCancelled = false;
let pendingDownloadFilename = null;
let isProcessingQueue = false;
let currentActiveJobId = null;
let keepAliveTimer = null;

// Keep Service Worker Alive During Multi-Chapter Processing
function startKeepAlive() {
  if (keepAliveTimer) return;
  keepAliveTimer = setInterval(() => {
    // Calling an async native Chrome API resets MV3's 30s termination watchdog timer
    try {
      chrome.runtime.getPlatformInfo(() => {});
    } catch (e) {}
  }, 20000);
}

function stopKeepAlive() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

function updateExtensionBadge(text, color = '#6366f1') {
  try {
    if (chrome.action && chrome.action.setBadgeText) {
      chrome.action.setBadgeText({ text: text ? String(text) : '' });
      if (text && chrome.action.setBadgeBackgroundColor) {
        chrome.action.setBadgeBackgroundColor({ color });
      }
    }
  } catch (e) {}
}

// Alarms Watchdog for Background Processing (Wakes up worker if dropped)
try {
  if (chrome.alarms) {
    chrome.alarms.create('MMD_QUEUE_WATCHDOG', { periodInMinutes: 0.5 });
    chrome.alarms.onAlarm.addListener(async (alarm) => {
      if (alarm.name === 'MMD_QUEUE_WATCHDOG') {
        const queue = await getJobQueue();
        const hasPending = queue.some(j => j.status === 'processing' || j.status === 'queued');
        if (hasPending && !isProcessingQueue) {
          console.log('[Watchdog] Waking service worker to resume background queue...');
          processNextQueueItem();
        }
      }
    });
  }
} catch (e) {
  console.warn('[Service Worker] Alarms setup error:', e);
}

// Clean up any orphaned background tabs left over from previous browser restarts
async function cleanupZombieWorkerTabs() {
  try {
    const data = await chrome.storage.local.get(['activeWorkerTabId', 'activeWorkerTabIds', 'downloadJobQueue']);
    const ids = new Set();
    if (data.activeWorkerTabId) ids.add(data.activeWorkerTabId);
    if (Array.isArray(data.activeWorkerTabIds)) {
      data.activeWorkerTabIds.forEach(id => ids.add(id));
    }
    for (const tabId of ids) {
      try {
        await chrome.tabs.remove(tabId);
        console.log(`[Service Worker] Cleaned up orphaned worker tab #${tabId}`);
      } catch (e) {}
    }
    await chrome.storage.local.remove(['activeWorkerTabId', 'activeWorkerTabIds']);

    // Clear any stuck processing jobs from previous crash
    if (Array.isArray(data.downloadJobQueue)) {
      const cleanedQueue = data.downloadJobQueue.map(j => {
        if (j.status === 'processing') return { ...j, status: 'failed', message: 'Interrupted by browser restart' };
        return j;
      });
      await chrome.storage.local.set({ downloadJobQueue: cleanedQueue });
    }
  } catch (e) {}
}

// Register Context Menus & Clean Zombies
chrome.runtime.onInstalled.addListener(() => {
  cleanupZombieWorkerTabs();
  if (chrome.contextMenus) {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'cm_download_chapter',
        title: '⚡ Quick Download Current Chapter',
        contexts: ['page', 'image', 'link']
      });
      chrome.contextMenus.create({
        id: 'cm_open_sidepanel',
        title: '📱 Open Reviewer Side Panel',
        contexts: ['page', 'image', 'link']
      });
    });
  }
});

if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    cleanupZombieWorkerTabs();
  });
}

if (chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab || !tab.id) return;
    if (info.menuItemId === 'cm_download_chapter') {
      const savedOpts = await getSavedUserPreferences();
      await enqueueJob('START_SINGLE_CHAPTER', tab.id, savedOpts);
      showDesktopNotification('Download Queued ⚡', 'Started downloading chapter in background...');
    } else if (info.menuItemId === 'cm_open_sidepanel') {
      if (chrome.sidePanel && chrome.sidePanel.open) {
        chrome.sidePanel.open({ windowId: tab.windowId }).catch(e => console.warn(e));
      }
    }
  });
}

// Listen for Keyboard Shortcuts
if (chrome.commands) {
  chrome.commands.onCommand.addListener(async (command) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    if (command === 'download_current_chapter') {
      const savedOpts = await getSavedUserPreferences();
      await enqueueJob('START_SINGLE_CHAPTER', tab.id, savedOpts);
      showDesktopNotification('Hotkeys Download Triggered ⚡', 'Downloading chapter in background...');
    } else if (command === 'open_side_panel') {
      if (chrome.sidePanel && chrome.sidePanel.open) {
        chrome.sidePanel.open({ windowId: tab.windowId }).catch(e => console.warn(e));
      }
    }
  });
}

async function getSavedUserPreferences() {
  const data = await chrome.storage.local.get('userPreferences');
  return data.userPreferences || {
    format: 'zip',
    requestDelay: 150,
    autoScroll: true,
    highResAutoFix: true,
    autoSplitWebtoons: true,
    filterPromos: true,
    enhanceContrast: false,
    parallelChapters: true,
    runInBackground: true
  };
}

function showDesktopNotification(title, message) {
  if (chrome.notifications && chrome.notifications.create) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: '../icons/icon-128.png',
      title: title,
      message: message,
      priority: 2
    });
  }
}

// Intercept Chrome download naming for Data URLs and Blob URLs
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  if (pendingDownloadFilename) {
    const targetName = pendingDownloadFilename;
    pendingDownloadFilename = null; // Reset after suggesting
    console.log(`[Service Worker] Overriding download filename to: ${targetName}`);
    suggest({ filename: targetName, conflictAction: 'uniquify' });
    return;
  }
  suggest();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.action === 'START_SINGLE_CHAPTER' || message.action === 'START_BATCH_RANGE') {
        isCancelled = false;
        let effectiveTabId = message.tabId;
        if (!effectiveTabId && sender.tab?.id) {
          effectiveTabId = sender.tab.id;
        }
        if (!effectiveTabId) {
          const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
          effectiveTabId = activeTab?.id;
        }
        const job = await enqueueJob(message.action, effectiveTabId, message.options);
        sendResponse({ success: true, jobId: job.id });
      } else if (message.action === 'CANCEL_DOWNLOAD' || message.action === 'CANCEL_JOB') {
        const jobId = message.jobId || currentActiveJobId;
        if (jobId) {
          await cancelJobById(jobId);
        } else {
          isCancelled = true;
          await updateState({ status: 'cancelled', message: 'Download cancelled by user.' });
        }
        sendResponse({ success: true });
      } else if (message.action === 'CLEAR_COMPLETED_JOBS') {
        await clearCompletedJobs();
        sendResponse({ success: true });
      } else if (message.action === 'GET_JOB_STATUS') {
        const state = await getStoredState();
        const queue = await getJobQueue();
        sendResponse({ success: true, state, queue });
      } else if (message.action === 'GET_QUEUE_STATE') {
        const queue = await getJobQueue();
        sendResponse({ success: true, queue });
      } else if (message.action === 'GET_DOWNLOAD_HISTORY') {
        const data = await chrome.storage.local.get('downloadHistory');
        const history = data.downloadHistory || {};
        const key = message.seriesTitle ? sanitizeFilename(message.seriesTitle).toLowerCase() : null;
        sendResponse({ success: true, historyItem: key ? history[key] : null });
      } else if (message.action === 'GET_ALL_HISTORY') {
        const data = await chrome.storage.local.get('downloadHistory');
        sendResponse({ success: true, history: data.downloadHistory || {} });
      } else if (message.action === 'GET_BOOKMARKS') {
        const data = await chrome.storage.local.get('mangaBookmarks');
        sendResponse({ success: true, bookmarks: data.mangaBookmarks || [] });
      } else if (message.action === 'ADD_BOOKMARK') {
        const data = await chrome.storage.local.get('mangaBookmarks');
        const bookmarks = data.mangaBookmarks || [];
        if (!bookmarks.some(b => b.url === message.bookmark.url)) {
          bookmarks.push({ ...message.bookmark, addedAt: Date.now() });
          await chrome.storage.local.set({ mangaBookmarks: bookmarks });
        }
        sendResponse({ success: true, bookmarks });
      } else if (message.action === 'REMOVE_BOOKMARK') {
        const data = await chrome.storage.local.get('mangaBookmarks');
        let bookmarks = data.mangaBookmarks || [];
        bookmarks = bookmarks.filter(b => b.url !== message.url);
        await chrome.storage.local.set({ mangaBookmarks: bookmarks });
        sendResponse({ success: true, bookmarks });
      } else if (message.action === 'HEARTBEAT') {
        sendResponse({ success: true, alive: true });
      } else {
        sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (err) {
      console.error('[Service Worker] Error executing action:', err);
      await updateState({ status: 'error', message: err.message });
      sendResponse({ success: false, error: err.message });
    }
  })();
  return true;
});

/**
 * FIFO Queue Engine Storage & Messaging (Persisted in storage.local)
 */
async function getJobQueue() {
  const data = await chrome.storage.local.get('jobQueueData');
  return data.jobQueueData || [];
}

async function saveJobQueue(queue) {
  await chrome.storage.local.set({ jobQueueData: queue });
  broadcastQueueState(queue);
}

function broadcastQueueState(queue) {
  try {
    chrome.runtime.sendMessage({ action: 'QUEUE_UPDATE', queue }).catch(() => {});
  } catch (e) {}
}

async function enqueueJob(type, tabId, options) {
  const queue = await getJobQueue();
  const seriesTitle = options.customTitle || 'Manhwa';
  const startCh = options.startChapter || 1;
  const endCh = options.endChapter || startCh;
  const chapterLabel = type === 'START_BATCH_RANGE'
    ? (startCh === endCh ? `Ch. ${startCh}` : `Ch. ${startCh}–${endCh}`)
    : `Current Ch`;

  const newJob = {
    id: 'job_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    type,
    tabId,
    seriesTitle,
    chapterLabel,
    startChapter: startCh,
    endChapter: endCh,
    options,
    status: 'queued', // queued, processing, completed, cancelled, failed
    progress: 0,
    message: 'Queued in line...',
    subMessage: 'Waiting for previous download...',
    createdAt: Date.now()
  };

  queue.push(newJob);
  await saveJobQueue(queue);
  processNextQueueItem();
  return newJob;
}

async function cancelJobById(jobId) {
  const queue = await getJobQueue();
  const job = queue.find(j => j.id === jobId);
  if (job) {
    if (job.status === 'processing' || jobId === currentActiveJobId) {
      isCancelled = true;
    }
    job.status = 'cancelled';
    job.message = 'Cancelled by user';
    await saveJobQueue(queue);
  }
}

async function clearCompletedJobs() {
  let queue = await getJobQueue();
  queue = queue.filter(j => j.status === 'queued' || j.status === 'processing');
  await saveJobQueue(queue);
}

async function updateJobState(jobId, newState) {
  const queue = await getJobQueue();
  const job = queue.find(j => j.id === jobId);
  if (job) {
    Object.assign(job, newState, { lastUpdated: Date.now() });
    await saveJobQueue(queue);
  }
}

async function processNextQueueItem() {
  if (isProcessingQueue) return;

  const queue = await getJobQueue();
  const nextJob = queue.find(j => j.status === 'queued');

  if (!nextJob) {
    isProcessingQueue = false;
    currentActiveJobId = null;
    stopKeepAlive();
    updateExtensionBadge('');
    await cleanupRefererRule();
    return;
  }

  isProcessingQueue = true;
  currentActiveJobId = nextJob.id;
  isCancelled = false;
  startKeepAlive();
  updateExtensionBadge('RUN', '#6366f1');

  await updateJobState(nextJob.id, { status: 'processing', progress: 0, message: 'Starting...' });

  try {
    if (nextJob.type === 'START_SINGLE_CHAPTER') {
      await handleSingleChapterDownload(nextJob.tabId, nextJob.options);
    } else if (nextJob.type === 'START_BATCH_RANGE') {
      await handleBatchRangeDownload(nextJob.tabId, nextJob.options);
    }
    if (!isCancelled) {
      await updateJobState(nextJob.id, { status: 'completed', progress: 100, message: 'Done! 🎉' });
      showDesktopNotification('Download Complete! 📚', `${nextJob.seriesTitle} (${nextJob.chapterLabel}) is ready!`);
      updateExtensionBadge('✓', '#10b981');
      setTimeout(() => updateExtensionBadge(''), 10000);
    } else {
      showDesktopNotification('Download Cancelled', `${nextJob.seriesTitle} (${nextJob.chapterLabel}) was cancelled.`);
      updateExtensionBadge('');
    }
  } catch (err) {
    const isCancelErr = isCancelled || err.message === 'Download cancelled' || String(err.message).toLowerCase().includes('cancelled');
    if (isCancelErr) {
      console.log(`[Queue Engine] Job ${nextJob.id} was cancelled by user.`);
      await updateJobState(nextJob.id, { status: 'cancelled', message: 'Cancelled by user' });
      showDesktopNotification('Download Cancelled', `${nextJob.seriesTitle} (${nextJob.chapterLabel}) was cancelled.`);
      updateExtensionBadge('');
    } else {
      console.error(`[Queue Engine] Job ${nextJob.id} failed:`, err);
      await updateJobState(nextJob.id, { status: 'failed', message: err.message || 'Error occurred' });
      showDesktopNotification('Download Failed ⚠️', `${nextJob.seriesTitle}: ${err.message || 'Unknown error'}`);
      updateExtensionBadge('ERR', '#ef4444');
      setTimeout(() => updateExtensionBadge(''), 10000);
    }
  } finally {
    isProcessingQueue = false;
    currentActiveJobId = null;
    setTimeout(() => processNextQueueItem(), 500);
  }
}

/**
 * Downloads single chapter currently open on tab.
 */
async function handleSingleChapterDownload(tabId, options) {
  if (!tabId || typeof tabId !== 'number') {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
    tabId = activeTab?.id;
    if (!tabId) {
      throw new Error('No active manga tab detected. Please navigate to a manga chapter first.');
    }
  }

  await updateState({
    status: 'scanning',
    currentChapter: 1,
    totalChapters: 1,
    progress: 0,
    message: 'Scanning current page for images...'
  });

  await ensureContentScriptInjected(tabId);

  const response = await sendMessageToTab(tabId, {
    action: 'SCAN_CHAPTER_IMAGES',
    triggerScroll: options.autoScroll !== false
  });

  if (!response || !response.success || !response.images || response.images.length === 0) {
    throw new Error('No chapter images detected on current page!');
  }

  let images = response.images;

  if (options.excludedUrls && Array.isArray(options.excludedUrls) && options.excludedUrls.length > 0) {
    const excludedSet = new Set(options.excludedUrls);
    images = images.filter(img => !excludedSet.has(img.url));
  }

  if (images.length === 0) {
    throw new Error('All detected images were excluded!');
  }

  const { pageInfo } = response;
  const seriesName = options.customTitle || pageInfo.seriesTitle || 'Manhwa';
  const chapterName = pageInfo.chapterNumber ? `Ch_${pageInfo.chapterNumber}` : '';

  if (pageInfo?.url) {
    await updateRefererRule(pageInfo.url);
  }

  await downloadChapterImages(seriesName, chapterName, images, options, tabId, pageInfo?.url);
  const _tab = tabId ? await chrome.tabs.get(tabId).catch(() => null) : null;
  await saveDownloadHistory(seriesName, pageInfo.chapterNumber || 1, {
    domain: pageInfo?.url ? new URL(pageInfo.url).hostname.replace('www.', '') : (_tab?.url ? new URL(_tab.url).hostname.replace('www.', '') : ''),
    pageUrl: pageInfo?.url || _tab?.url || ''
  });

  await updateState({
    status: 'completed',
    progress: 100,
    message: `Successfully downloaded ${images.length} images for ${seriesName} ${chapterName}!`
  });
}

function urlsRoughlyMatch(url1, url2) {
  if (!url1 || !url2) return false;
  try {
    const u1 = new URL(url1);
    const u2 = new URL(url2);
    return u1.origin === u2.origin && u1.pathname.replace(/\/+$/, '') === u2.pathname.replace(/\/+$/, '');
  } catch (e) {
    return url1 === url2;
  }
}

/**
 * Constructs the next chapter URL by parsing and incrementing chapter numbers.
 * Supports query parameters, path prefixes, standalone segments, and preserves zero-padding.
 */
function constructNextUrl(currentUrl, targetChNum) {
  if (!currentUrl) return currentUrl;
  try {
    const parsed = new URL(currentUrl);

    // 1. Try query parameters representing chapter/episode number
    const queryKeys = ['episode_no', 'chapter_no', 'episode', 'chapter', 'ch', 'ep', 'viewer_ch', 'c'];
    for (const key of queryKeys) {
      if (parsed.searchParams.has(key)) {
        parsed.searchParams.set(key, targetChNum);
        return parsed.toString();
      }
    }

    // 2. Find ALL prefix matches, then use the LAST one so series slugs like
    //    /c-99999/chapter-1 don't get the wrong segment replaced.
    const prefixRegex = /(?:^|[\/_\-\s])(chapter|ch|episode|ep|volume|vol|c)([-_\s\/]*)(\d+(?:\.\d+)?)/gi;
    const allMatches = [...parsed.pathname.matchAll(prefixRegex)];
    if (allMatches.length > 0) {
      const m = allMatches[allMatches.length - 1]; // last match = actual chapter
      const fullMatched = m[0];
      const prefix = m[1];
      const sep = m[2];
      const oldNumStr = m[3];
      const paddedNum = String(targetChNum).padStart(oldNumStr.length, '0');
      const replacement = fullMatched.replace(
        new RegExp(`(${prefix})([-_\\s\\/]*)${oldNumStr}`, 'i'),
        `$1$2${paddedNum}`
      );
      const before = parsed.pathname.substring(0, m.index);
      const after = parsed.pathname.substring(m.index + fullMatched.length);
      parsed.pathname = before + replacement + after;
      return parsed.toString();
    }

    // 3. Try standalone numeric segment in pathname (take the last numeric segment)
    const segments = parsed.pathname.split('/');
    for (let i = segments.length - 1; i >= 0; i--) {
      if (segments[i] && /^\d+(?:\.\d+)?$/.test(segments[i])) {
        segments[i] = String(targetChNum);
        parsed.pathname = segments.join('/');
        return parsed.toString();
      }
    }

    // 4. Fallback for series overview/info pages without chapter in URL:
    // e.g. https://site.com/series/solo-leveling -> https://site.com/series/solo-leveling/chapter-171
    const cleanPath = parsed.pathname.replace(/\/+$/, '');
    parsed.pathname = `${cleanPath}/chapter-${targetChNum}`;
    return parsed.toString();
  } catch (e) {
    console.error('[Service Worker] Error constructing next URL:', e);
  }
  return currentUrl;
}

/**
 * Handles multi-chapter range download with 5-Tab Concurrent Worker Pool.
 * Features:
 * - 5-Tab Concurrent Worker Pool: Opens up to 5 background tabs in parallel, fetching
 *   and processing 5 chapters simultaneously for a 4x–5x download speed boost.
 * - Volume Chunking: Flushes archives in 25-chapter volumes as expected by readers.
 * - Anti-Bot Stagger: Staggers tab creation and requests with 350ms delays to stay safe.
 * - Fully Backgrounded: Runs completely in hidden inactive tabs (active: false).
 */
async function handleBatchRangeDownload(tabId, options) {
  // For batch downloads we do NOT need the user's tab at all.
  // All work happens in freshly opened background worker tabs.
  // We only use tabId as a potential source of the base URL — but only as a last resort
  // and only to read the URL, never to inject into or scan from.

  const tocChapters = options.tocChapters || null;
  const startCh = parseInt(options.startChapter, 10) || 1;
  const endCh = parseInt(options.endChapter, 10) || startCh;
  const totalChaptersCount = tocChapters ? tocChapters.length : (endCh - startCh + 1);
  const format = options.format || 'zip';
  const isArchive = format === 'zip' || format === 'cbz';
  let batchOutputMode = options.batchOutputMode || 'single_archive';

  // Large batch protection: if > 10 chapters, use volume_chunks to avoid RAM exhaustion
  if (batchOutputMode === 'single_archive' && isArchive && totalChaptersCount > 10) {
    console.warn(`[Batch Engine] Total chapters (${totalChaptersCount}) > 10. Auto-switching to volume_chunks for memory safety.`);
    batchOutputMode = 'volume_chunks';
  }

  // Storage check
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const freeBytes = (estimate.quota || 0) - (estimate.usage || 0);
      if (freeBytes < 200 * 1024 * 1024 && batchOutputMode === 'single_archive') {
        batchOutputMode = 'volume_chunks';
      }
    } catch (e) {}
  }

  // Determine base chapter URL.
  // Priority: explicit TOC first chapter > options.pageUrl (from popup's activeTabUrl) > reading the tab's URL.
  // We build the STARTING chapter URL by plugging startCh into the base URL so the
  // batch always begins at the chapter the user typed, regardless of which page they're on.
  let baseChapterUrl;
  if (tocChapters) {
    baseChapterUrl = tocChapters[0].url;
  } else {
    // options.pageUrl is set from activeTabUrl in popup.js — it's the page the user had open.
    // We reconstruct it to point at startCh so chapter 171 is downloaded when the user typed 171.
    const rawBase = options.pageUrl || (await chrome.tabs.get(tabId).catch(() => null))?.url || null;
    baseChapterUrl = rawBase ? constructNextUrl(rawBase, startCh) : null;
  }

  // If no explicit tocChapters, try to get a TOC map from the user's tab (read-only, no injection into it)
  let detectedTocMap = null;
  if (!tocChapters && tabId && Number.isInteger(tabId) && tabId > 0) {
    try {
      const tocRes = await sendMessageToTab(tabId, { action: 'SCAN_SERIES_TOC' });
      if (tocRes && tocRes.success && Array.isArray(tocRes.chapters) && tocRes.chapters.length > 0) {
        detectedTocMap = new Map();
        tocRes.chapters.forEach(ch => {
          if (ch.number !== undefined && ch.url) {
            detectedTocMap.set(parseFloat(ch.number), ch.url);
          }
        });
      }
    } catch (_) {}
  }

  // Build task list
  const allTasks = [];
  for (let i = 0; i < totalChaptersCount; i++) {
    const tocEntry = tocChapters ? tocChapters[i] : null;
    const chNum = tocEntry ? (parseFloat(tocEntry.number) || (startCh + i)) : (startCh + i);
    let chUrl = tocEntry ? tocEntry.url : null;
    if (!chUrl && detectedTocMap && detectedTocMap.has(chNum)) {
      chUrl = detectedTocMap.get(chNum);
    }
    if (!chUrl && baseChapterUrl) {
      chUrl = constructNextUrl(baseChapterUrl, chNum);
    }
    allTasks.push({
      index: i,
      chapterNum: chNum,
      url: chUrl
    });
  }

  const TARGET_VOLUME_CHAPTERS = 25;
  const activeWorkerTabIds = new Set();
  let completedCount = 0;
  let batchSeriesName = options.customTitle || null;
  let hasAddedImages = false;
  let lastCompletedUrl = null;

  // Decide concurrency (up to 5 tabs in parallel if parallel mode is enabled, or 1 tab if disabled)
  const isBg = options.runInBackground !== false;
  const useParallel = options.parallelChapters !== false;
  // Always allow up to 5 worker tabs regardless of request delay.
  // The per-request delay (options.requestDelay) is applied between image fetches inside each tab,
  // not between tab launches — so it must not reduce the tab pool size.
  const poolConcurrency = useParallel ? Math.min(5, allTasks.length) : 1;

  await updateState({
    status: 'processing',
    currentChapterIndex: 1,
    totalChapters: totalChaptersCount,
    progress: 0,
    message: `Starting ${poolConcurrency}x parallel batch download for ${totalChaptersCount} chapters...`,
    subMessage: isBg ? `Processing ${poolConcurrency} chapters simultaneously in background...` : 'Processing in active tab...'
  });

  // Split into volumes of 25 chapters if in volume_chunks mode
  const volumeSlices = [];
  if (batchOutputMode === 'volume_chunks' && isArchive) {
    for (let i = 0; i < allTasks.length; i += TARGET_VOLUME_CHAPTERS) {
      volumeSlices.push(allTasks.slice(i, i + TARGET_VOLUME_CHAPTERS));
    }
  } else {
    volumeSlices.push(allTasks);
  }

  let singleMegaZip = (isArchive && batchOutputMode === 'single_archive') ? new self.JSZip() : null;

  try {
    for (let vIdx = 0; vIdx < volumeSlices.length; vIdx++) {
      if (isCancelled) break;

      const volumeTasks = volumeSlices[vIdx];
      const volStartCh = volumeTasks[0].chapterNum;
      const volEndCh = volumeTasks[volumeTasks.length - 1].chapterNum;
      let volumeZip = (isArchive && batchOutputMode === 'volume_chunks') ? new self.JSZip() : null;
      let volumeImagesCount = 0;

      // Spawn worker tab pool for this volume
      const workerTabs = [];
      const currentPoolSize = Math.min(poolConcurrency, volumeTasks.length);

      if (isBg) {
        for (let p = 0; p < currentPoolSize; p++) {
          if (isCancelled) break;
          try {
            const initialUrl = volumeTasks[p]?.url || 'about:blank';
            const bgTab = await chrome.tabs.create({ url: initialUrl, active: false });
            if (bgTab && Number.isInteger(bgTab.id) && bgTab.id > 0) {
              workerTabs.push({ id: bgTab.id, currentUrl: initialUrl });
              activeWorkerTabIds.add(bgTab.id);
            } else {
              console.warn('[Parallel Batch] chrome.tabs.create returned invalid tab id:', bgTab);
            }
            if (p < currentPoolSize - 1) {
              await new Promise(r => setTimeout(r, 350)); // Stagger tab launches
            }
          } catch (tabErr) {
            console.warn('[Parallel Batch] Failed creating worker tab:', tabErr);
          }
        }
      } else {
        // Foreground Mode: Opens a visible dedicated tab so the user sees the download right in front of them!
        for (let p = 0; p < currentPoolSize; p++) {
          if (isCancelled) break;
          try {
            const initialUrl = volumeTasks[p]?.url || 'about:blank';
            // Make the first tab active (visible focus) so user switches to it; subsequent parallel tabs open in background
            const fgTab = await chrome.tabs.create({ url: initialUrl, active: (p === 0) });
            if (fgTab && Number.isInteger(fgTab.id) && fgTab.id > 0) {
              workerTabs.push({ id: fgTab.id, currentUrl: initialUrl });
              activeWorkerTabIds.add(fgTab.id);
            } else {
              console.warn('[Foreground Batch] chrome.tabs.create returned invalid tab id:', fgTab);
            }
            if (p < currentPoolSize - 1) {
              await new Promise(r => setTimeout(r, 350));
            }
          } catch (tabErr) {
            console.warn('[Foreground Batch] Failed creating worker tab:', tabErr);
          }
        }
      }

      if (workerTabs.length === 0) {
        throw new Error('[Batch Engine] Failed to create any background worker tabs. Check your URL and try again.');
      }

      await chrome.storage.local.set({ activeWorkerTabIds: Array.from(activeWorkerTabIds) });

      // Worker Queue Loop: workers grab chapters as they finish
      let taskCursor = 0;
      const workerPromises = workerTabs.map(async (worker) => {
        while (!isCancelled) {
          const taskIdx = taskCursor++;
          if (taskIdx >= volumeTasks.length) break;

          const task = volumeTasks[taskIdx];
          const targetZip = volumeZip || singleMegaZip;

          await processChapter(task, worker, targetZip);
        }
      });

      async function processChapter(task, worker, targetZip) {
        if (isCancelled || !worker || !worker.id) return;

        updateExtensionBadge(String(task.chapterNum), '#6366f1');

        await updateState({
          status: 'processing',
          currentChapterIndex: completedCount + 1,
          totalChapters: totalChaptersCount,
          currentChapterNum: task.chapterNum,
          progress: Math.round((completedCount / totalChaptersCount) * 100),
          message: `Chapter ${task.chapterNum} (${completedCount + 1}/${totalChaptersCount}) [⚡ ${currentPoolSize}x Parallel]...`,
          subMessage: `Volume ${vIdx + 1} of ${volumeSlices.length}`
        });

        // Navigate worker tab if not already on the correct URL, and wait for it to load completely
        try {
          const liveTab = await chrome.tabs.get(worker.id).catch(() => null);
          if (liveTab && !urlsRoughlyMatch(liveTab.url, task.url)) {
            await chrome.tabs.update(worker.id, { url: task.url });
            await waitForTabToLoad(worker.id);
            await new Promise(r => setTimeout(r, 1200));
          } else if (liveTab) {
            await waitForTabToLoad(worker.id);
            await new Promise(r => setTimeout(r, 1200));
          }
        } catch (_) {}

        await ensureContentScriptInjected(worker.id);

        let response = await sendMessageToTab(worker.id, {
          action: 'SCAN_CHAPTER_IMAGES',
          triggerScroll: options.autoScroll !== false
        });

        // Single retry reload if 0 images found
        if (!response || !response.success || !response.images || response.images.length === 0) {
          try {
            await chrome.tabs.reload(worker.id);
            await waitForTabToLoad(worker.id);
            await new Promise(r => setTimeout(r, 2500));
            await ensureContentScriptInjected(worker.id);
            response = await sendMessageToTab(worker.id, {
              action: 'SCAN_CHAPTER_IMAGES',
              triggerScroll: options.autoScroll !== false
            });
          } catch (_) {}
        }

        if (response && response.success && response.images && response.images.length > 0) {
          hasAddedImages = true;
          if (!batchSeriesName && response.pageInfo?.seriesTitle) {
            batchSeriesName = response.pageInfo.seriesTitle;
          }
          const cleanSeries = sanitizeFilename(batchSeriesName || options.customTitle || 'Manhwa');
          const chapterLabel = `Ch_${task.chapterNum}`;
          const pageUrl = response.pageInfo?.url || task.url;

          if (pageUrl) {
            await updateRefererRule(pageUrl);
          }

          const histMeta = {
            domain: pageUrl ? new URL(pageUrl).hostname.replace('www.', '') : '',
            pageUrl: pageUrl
          };

          if (format === 'pdf') {
            const pdfPages = await fetchChapterImagesToPdf(response.images, options, worker.id, pageUrl);
            if (pdfPages.length > 0) {
              const pdfBlob = await compileImagesToPdfBlob(pdfPages);
              const pdfFilename = `${cleanSeries}_${chapterLabel}.pdf`;
              await downloadPdfInstance(pdfBlob, pdfFilename);
              await saveDownloadHistory(cleanSeries, task.chapterNum, histMeta);
            }
          } else if (batchOutputMode === 'chapter_zip' && isArchive) {
            const chZip = new self.JSZip();
            const addedCount = await fetchChapterImagesToZip(chZip, cleanSeries, chapterLabel, response.images, options, worker.id, pageUrl);
            if (addedCount > 0) {
              const ext = format === 'cbz' ? 'cbz' : 'zip';
              const chArchiveName = `${cleanSeries}_${chapterLabel}.${ext}`;
              await downloadZipInstance(chZip, chArchiveName, {
                seriesTitle: cleanSeries,
                chapterNum: task.chapterNum,
                pageCount: addedCount
              });
              await saveDownloadHistory(cleanSeries, task.chapterNum, histMeta);
            }
          } else if (targetZip) {
            const addedCount = await fetchChapterImagesToZip(targetZip, cleanSeries, chapterLabel, response.images, options, worker.id, pageUrl);
            if (addedCount > 0) {
              volumeImagesCount += addedCount;
            }
          } else {
            await downloadChapterImages(cleanSeries, chapterLabel, response.images, options, worker.id, pageUrl);
          }

          completedCount++;
          lastCompletedUrl = pageUrl;
        } else {
          console.warn(`[Parallel Batch] Chapter ${task.chapterNum} returned 0 images.`);
        }
      }

      // Wait for all workers to finish all chapters in this volume
      await Promise.all(workerPromises);

      // Clean up worker tabs for this volume slice
      if (isBg) {
        for (const w of workerTabs) {
          try { await chrome.tabs.remove(w.id); } catch (_) {}
          activeWorkerTabIds.delete(w.id);
        }
        await chrome.storage.local.set({ activeWorkerTabIds: Array.from(activeWorkerTabIds) });
      }

      // Flush volume archive if in volume_chunks mode
      if (!isCancelled && volumeZip && Object.keys(volumeZip.files).length > 0) {
        const cleanSeries = sanitizeFilename(batchSeriesName || options.customTitle || 'Manhwa');
        const ext = format === 'cbz' ? 'cbz' : 'zip';
        const volArchiveName = `${cleanSeries}_Ch_${volStartCh}_to_${volEndCh}.${ext}`;

        await updateState({
          status: 'processing',
          message: `Packaging Volume ${volStartCh}–${volEndCh}...`,
          subMessage: `Compressing ${volumeImagesCount} pages...`
        });

        await downloadZipInstance(volumeZip, volArchiveName, {
          seriesTitle: cleanSeries,
          chapterNum: `${volStartCh}-${volEndCh}`
        });

        await saveDownloadHistory(cleanSeries, volEndCh, {
          domain: lastCompletedUrl ? new URL(lastCompletedUrl).hostname.replace('www.', '') : '',
          pageUrl: lastCompletedUrl
        });

        showDesktopNotification(`Volume Saved! 📚`, `${cleanSeries} Ch. ${volStartCh}–${volEndCh} downloaded!`);
        volumeZip = null; // Free memory
      }
    }

    // Finalize single mega ZIP if used (<= 10 chapters)
    if (!isCancelled && singleMegaZip && hasAddedImages) {
      const cleanSeries = sanitizeFilename(batchSeriesName || 'Manhwa');
      const ext = format === 'cbz' ? 'cbz' : 'zip';
      const archiveFilename = startCh === endCh
        ? `${cleanSeries}_Ch_${startCh}.${ext}`
        : `${cleanSeries}_Ch_${startCh}_to_${endCh}.${ext}`;

      await updateState({
        status: 'processing',
        progress: 99,
        message: `Packaging batch ${ext.toUpperCase()} archive...`,
        subMessage: `Building ${archiveFilename}...`
      });

      await downloadZipInstance(singleMegaZip, archiveFilename, {
        seriesTitle: batchSeriesName || 'Manhwa',
        chapterNum: `${startCh}-${endCh}`
      });

      singleMegaZip = null;
      await saveDownloadHistory(batchSeriesName || 'Manhwa', endCh, {
        domain: lastCompletedUrl ? new URL(lastCompletedUrl).hostname.replace('www.', '') : '',
        pageUrl: lastCompletedUrl
      });
    }
  } finally {
    // Safety cleanup: Ensure ALL active worker tabs are closed under any circumstances
    if (activeWorkerTabIds.size > 0) {
      for (const tid of activeWorkerTabIds) {
        try { await chrome.tabs.remove(tid); } catch (_) {}
      }
      activeWorkerTabIds.clear();
      await chrome.storage.local.remove('activeWorkerTabIds');
    }
  }

  if (!isCancelled) {
    if (!hasAddedImages) {
      throw new Error(`Failed to extract or download images for chapters ${startCh} to ${endCh}. Please verify that the chapters exist and are accessible.`);
    }
    await updateState({
      status: 'completed',
      progress: 100,
      message: `Batch download finished for ${completedCount} chapters! 🎉`
    });
  }
}

/**
 * Downloads single chapter images as ZIP/CBZ archive, PDF, or individual files.
 */
async function downloadChapterImages(seriesTitle, chapterLabel, images, options, tabId = null, pageUrl = null) {
  const cleanSeries = sanitizeFilename(seriesTitle);
  const cleanChapter = sanitizeFilename(chapterLabel);
  const format = options.format || 'zip';

  if (format === 'pdf') {
    await updateState({ message: 'Fetching images for PDF document...' });
    const pdfPages = await fetchChapterImagesToPdf(images, options, tabId, pageUrl);

    if (isCancelled) throw new Error('Download cancelled');
    if (pdfPages.length === 0) throw new Error('Failed to fetch any images for PDF!');

    await updateState({ message: 'Compiling PDF document...' });
    const pdfBlob = await compileImagesToPdfBlob(pdfPages);
    const pdfFilename = cleanChapter ? `${cleanSeries}_${cleanChapter}.pdf` : `${cleanSeries}.pdf`;
    await downloadPdfInstance(pdfBlob, pdfFilename);
  } else if (format === 'zip' || format === 'cbz') {
    const zip = new self.JSZip();
    const successCount = await fetchChapterImagesToZip(zip, cleanSeries, cleanChapter, images, options, tabId, pageUrl);

    if (isCancelled) throw new Error('Download cancelled');
    if (successCount === 0) throw new Error('Failed to fetch any images for ZIP!');

    const ext = format === 'cbz' ? 'cbz' : 'zip';
    const archiveFilename = cleanChapter ? `${cleanSeries}_${cleanChapter}.${ext}` : `${cleanSeries}.${ext}`;
    await downloadZipInstance(zip, archiveFilename, {
      seriesTitle: cleanSeries,
      chapterNum: cleanChapter,
      pageCount: successCount
    });
  } else {
    // Subfolder format
    const delayMs = parseInt(options.requestDelay, 10) || 150;
    for (let i = 0; i < images.length; i++) {
      if (isCancelled) throw new Error('Download cancelled');

      const img = images[i];
      const ext = getImageExtension(img.url);
      const subDir = cleanChapter ? `${cleanSeries}/${cleanChapter}` : cleanSeries;
      const fileSubpath = `${subDir}/${String(i + 1).padStart(3, '0')}.${ext}`;

      pendingDownloadFilename = fileSubpath;

      try {
        const imageBlob = await fetchImageBlob(img, tabId, pageUrl);
        await triggerDownload(imageBlob, fileSubpath);
      } catch (err) {
        console.error(`Failed image download ${img.url}:`, err);
      }

      if (delayMs > 0 && i < images.length - 1) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }
}

async function fetchChapterImagesToPdf(images, options, tabId = null, pageUrl = null) {
  const pdfPages = [];
  const isParallel = options.parallelChapters !== false;
  const concurrency = isParallel ? 3 : 5;
  const delayMs = parseInt(options.requestDelay, 10) || 0;

  for (let i = 0; i < images.length; i += concurrency) {
    if (isCancelled) throw new Error('Download cancelled');

    const chunk = images.slice(i, i + concurrency);
    const chunkResults = new Array(chunk.length);

    await Promise.all(chunk.map(async (img, idx) => {
      if (isCancelled) return;
      try {
        const imageBlob = await fetchImageBlob(img, tabId, pageUrl);
        const processedEntries = await processImageForPdf(imageBlob, options);
        chunkResults[idx] = processedEntries;
      } catch (err) {
        console.error(`[PDF Fetcher] Failed image:`, err);
        chunkResults[idx] = [];
      }
    }));

    for (let idx = 0; idx < chunkResults.length; idx++) {
      if (chunkResults[idx] && chunkResults[idx].length > 0) {
        pdfPages.push(...chunkResults[idx]);
      }
    }

    const imageProgress = Math.round((Math.min(i + concurrency, images.length) / images.length) * 100);
    await updateState({
      progress: imageProgress,
      subMessage: `Processed ${pdfPages.length} PDF pages...`
    });

    if (delayMs > 0 && (i + concurrency) < images.length) {
      await new Promise(r => setTimeout(r, Math.min(delayMs, 1000)));
    } else if (isParallel && (i + concurrency) < images.length) {
      await new Promise(r => setTimeout(r, 50));
    }
  }

  return pdfPages;
}

async function downloadPdfInstance(pdfBlob, pdfFilename) {
  await updateState({ subMessage: 'Packaging PDF document...' });
  console.log(`[Service Worker] Triggering download for PDF ${pdfFilename} (${(pdfBlob.size / 1024 / 1024).toFixed(2)} MB)...`);
  return await triggerDownload(pdfBlob, pdfFilename);
}

/**
 * Pure JavaScript PDF Compiler Engine (PDF-1.4 format, zero dependencies)
 */
async function compileImagesToPdfBlob(imageEntries) {
  const chunks = [];
  let currentOffset = 0;

  function addString(str) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    chunks.push(bytes);
    currentOffset += bytes.length;
  }

  function addBytes(bytes) {
    chunks.push(bytes);
    currentOffset += bytes.length;
  }

  addString('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  const xrefOffsets = [0];
  function startObject(num) {
    xrefOffsets[num] = currentOffset;
    addString(`${num} 0 obj\n`);
  }

  const pageCount = imageEntries.length;
  const catalogObjNum = 1;
  const pagesObjNum = 2;

  startObject(1);
  addString(`<< /Type /Catalog /Pages ${pagesObjNum} 0 R >>\nendobj\n`);

  const pageObjectIds = [];
  let nextObjId = 3;

  for (let i = 0; i < pageCount; i++) {
    const pageObjId = nextObjId++;
    const streamObjId = nextObjId++;
    const imgObjId = nextObjId++;
    pageObjectIds.push({ pageObjId, streamObjId, imgObjId, img: imageEntries[i] });
  }

  startObject(2);
  const kidsStr = pageObjectIds.map(p => `${p.pageObjId} 0 R`).join(' ');
  addString(`<< /Type /Pages /Kids [ ${kidsStr} ] /Count ${pageCount} >>\nendobj\n`);

  for (let i = 0; i < pageObjectIds.length; i++) {
    const p = pageObjectIds[i];
    let width = p.img.width || 800;
    let height = p.img.height || 1200;
    const imgData = p.img;

    let jpegBlob = (imgData.blob && imgData.blob.blob instanceof Blob)
      ? imgData.blob.blob
      : (imgData.blob instanceof Blob ? imgData.blob : (imgData instanceof Blob ? imgData : null));
    let jpegBuffer = imgData.buffer || (imgData.blob && imgData.blob.buffer) || null;

    // Check if the image is already a valid JPEG by inspecting magic bytes
    let isRealJpeg = imgData.isJpeg;
    if (isRealJpeg === undefined) {
      if (jpegBuffer) {
        const h = new Uint8Array(jpegBuffer.slice(0, 3));
        isRealJpeg = h.length === 3 && h[0] === 0xFF && h[1] === 0xD8 && h[2] === 0xFF;
      } else if (jpegBlob && typeof jpegBlob.slice === 'function') {
        try {
          const headerBuf = await jpegBlob.slice(0, 3).arrayBuffer();
          const headerBytes = new Uint8Array(headerBuf);
          isRealJpeg = headerBytes.length === 3 && headerBytes[0] === 0xFF && headerBytes[1] === 0xD8 && headerBytes[2] === 0xFF;
        } catch (e) {}
      }
    }

    // If not real JPEG (e.g. WebP, PNG, AVIF), convert to JPEG using OffscreenCanvas
    if (!isRealJpeg) {
      if (typeof createImageBitmap === 'function' && typeof OffscreenCanvas === 'function') {
        let bmp = null;
        try {
          const source = jpegBlob || (jpegBuffer ? new Blob([jpegBuffer]) : null);
          if (source) {
            bmp = await createImageBitmap(source);
            width = bmp.width;
            height = bmp.height;
            const cvs = new OffscreenCanvas(width, height);
            const ctx = cvs.getContext('2d');
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(bmp, 0, 0);
            jpegBlob = await cvs.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
            jpegBuffer = await jpegBlob.arrayBuffer();
            isRealJpeg = true;
          }
        } catch (convErr) {
          console.warn('[PDF Compiler] Failed to convert image to JPEG:', convErr);
        } finally {
          if (bmp && typeof bmp.close === 'function') {
            try { bmp.close(); } catch (_) {}
          }
        }
      }
    }

    let imgBytes;
    if (jpegBuffer) {
      imgBytes = new Uint8Array(jpegBuffer);
    } else if (jpegBlob && typeof jpegBlob.arrayBuffer === 'function') {
      const imgArrayBuffer = await jpegBlob.arrayBuffer();
      imgBytes = new Uint8Array(imgArrayBuffer);
    } else {
      throw new Error(`Failed to extract valid image data for PDF page ${i + 1}`);
    }

    startObject(p.pageObjId);
    addString(`<< /Type /Page /Parent ${pagesObjNum} 0 R /MediaBox [0 0 ${width} ${height}] /Contents ${p.streamObjId} 0 R /Resources << /XObject << /Im${i + 1} ${p.imgObjId} 0 R >> >> >>\nendobj\n`);

    const streamContent = `q ${width} 0 0 ${height} 0 0 cm /Im${i + 1} Do Q\n`;
    startObject(p.streamObjId);
    addString(`<< /Length ${streamContent.length} >>\nstream\n${streamContent}endstream\nendobj\n`);

    startObject(p.imgObjId);
    addString(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgBytes.length} >>\nstream\n`);
    addBytes(imgBytes);
    addString(`\nendstream\nendobj\n`);
  }

  const xrefStart = currentOffset;
  addString(`xref\n0 ${nextObjId}\n0000000000 65535 f \n`);
  for (let i = 1; i < nextObjId; i++) {
    const off = String(xrefOffsets[i]).padStart(10, '0');
    addString(`${off} 00000 n \n`);
  }

  addString(`trailer\n<< /Size ${nextObjId} /Root ${catalogObjNum} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  return new Blob(chunks, { type: 'application/pdf' });
}

async function processImageForPdf(imgData, options) {
  const imageBlob = (imgData && imgData.blob instanceof Blob)
    ? imgData.blob
    : (imgData instanceof Blob ? imgData : (imgData ? new Blob([imgData]) : null));
  const imageBuffer = imgData?.buffer || (imageBlob ? await imageBlob.arrayBuffer() : null);

  const autoSplit = options.autoSplitWebtoons !== false;
  const pdfEntries = [];

  if (autoSplit && typeof createImageBitmap === 'function' && typeof OffscreenCanvas === 'function' && imageBlob) {
    let imageBitmap = null;
    try {
      imageBitmap = await createImageBitmap(imageBlob);
      const width = imageBitmap.width || 0;
      const height = imageBitmap.height || 0;
      if (width <= 0 || height <= 0) {
        throw new Error('Image has zero or invalid dimensions');
      }
      const aspectRatio = height / width;

      if (aspectRatio > 2.5 && height > 1500) {
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(imageBitmap, 0, 0);

        const imageData = ctx.getImageData(0, 0, width, height);
        const pixels = imageData.data;
        const rowBrightness = new Float32Array(height);
        const step = Math.max(1, Math.floor(width / 50));

        for (let y = 0; y < height; y++) {
          let sum = 0, count = 0;
          const rowOffset = y * width * 4;
          for (let x = 0; x < width * 4; x += step * 4) {
            sum += (0.299 * pixels[rowOffset + x] + 0.587 * pixels[rowOffset + x + 1] + 0.114 * pixels[rowOffset + x + 2]);
            count++;
          }
          rowBrightness[y] = sum / (count || 1);
        }

        const targetSliceHeight = Math.min(1200, Math.floor(width * 1.5));
        const minSliceHeight = 500;
        const splitPoints = [0];
        let lastSplit = 0;

        for (let y = minSliceHeight; y < height - minSliceHeight; y++) {
          if (y - lastSplit >= targetSliceHeight) {
            let bestGapY = y, maxGapScore = -1;
            const searchStart = Math.max(lastSplit + minSliceHeight, y - 200);
            const searchEnd = Math.min(height - minSliceHeight, y + 200);
            for (let gy = searchStart; gy < searchEnd; gy++) {
              const b = rowBrightness[gy];
              const dist = Math.abs(gy - y);
              const score = (b > 240 || b < 15 ? 100 : b) - (dist / 10);
              if (score > maxGapScore) { maxGapScore = score; bestGapY = gy; }
            }
            splitPoints.push(bestGapY);
            lastSplit = bestGapY;
            y = bestGapY + minSliceHeight;
          }
        }
        splitPoints.push(height);

        if (splitPoints.length > 2) {
          const targetWidth = Math.max(width, 800);
          const scaleFactor = targetWidth / width;

          for (let s = 0; s < splitPoints.length - 1; s++) {
            const startY = splitPoints[s];
            const endY = splitPoints[s + 1];
            const sliceH = endY - startY;
            if (sliceH <= 0) continue;
            const destH = Math.round(sliceH * scaleFactor);

            const sliceCanvas = new OffscreenCanvas(targetWidth, destH);
            const sCtx = sliceCanvas.getContext('2d');
            if (options.enhanceContrast) sCtx.filter = 'contrast(1.08) brightness(1.02)';
            sCtx.imageSmoothingEnabled = true;
            sCtx.imageSmoothingQuality = 'high';

            sCtx.drawImage(imageBitmap, 0, startY, width, sliceH, 0, 0, targetWidth, destH);
            const sliceBlob = await sliceCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
            const sliceBuffer = await sliceBlob.arrayBuffer();
            pdfEntries.push({ blob: sliceBlob, buffer: sliceBuffer, width: targetWidth, height: destH, isJpeg: true });
          }
          return pdfEntries;
        }
      }
    } catch (e) {
      console.warn('[PDF Processor] Webtoon slicer fallback:', e);
    } finally {
      if (imageBitmap && typeof imageBitmap.close === 'function') {
        try { imageBitmap.close(); } catch (_) {}
      }
    }
  }

  let width = 800, height = 1200;
  let isJpeg = false;
  if (imageBuffer) {
    const h = new Uint8Array(imageBuffer.slice(0, 3));
    isJpeg = h.length === 3 && h[0] === 0xFF && h[1] === 0xD8 && h[2] === 0xFF;
  }

  if (imageBlob) {
    let bmp = null;
    try {
      bmp = await createImageBitmap(imageBlob);
      width = bmp.width;
      height = bmp.height;
      if (options.enhanceContrast || !isJpeg) {
        const cvs = new OffscreenCanvas(width, height);
        const ctx = cvs.getContext('2d');
        if (options.enhanceContrast) ctx.filter = 'contrast(1.08) brightness(1.02)';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(bmp, 0, 0);
        const boostedBlob = await cvs.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
        const boostedBuffer = await boostedBlob.arrayBuffer();
        return [{ blob: boostedBlob, buffer: boostedBuffer, width, height, isJpeg: true }];
      }
    } catch (e) {
    } finally {
      if (bmp && typeof bmp.close === 'function') {
        try { bmp.close(); } catch (_) {}
      }
    }
  }

  return [{ blob: imageBlob, buffer: imageBuffer, width, height, isJpeg }];
}

/**
 * Helper: Fetches images for a chapter and appends them to a JSZip instance under a subfolder.
 * Pages and sliced webtoon strips are numbered strictly sequentially (001.jpg, 002.jpg, ...).
 */
async function fetchChapterImagesToZip(zip, cleanSeries, cleanChapter, images, options, tabId = null, pageUrl = null) {
  const folderName = cleanChapter ? cleanChapter : cleanSeries;
  const folder = zip.folder(folderName);
  let pageCounter = 1;
  const isParallel = options.parallelChapters !== false;
  // If multi-chapter parallel tabs are running, use 3 concurrent images per tab
  // (3 * 5 = 15 total connections) to prevent saturating TCP sockets and bandwidth.
  const concurrency = isParallel ? 3 : 5;
  const delayMs = parseInt(options.requestDelay, 10) || 0;

  for (let i = 0; i < images.length; i += concurrency) {
    if (isCancelled) throw new Error('Download cancelled');

    const chunk = images.slice(i, i + concurrency);
    const chunkResults = new Array(chunk.length);

    await Promise.all(chunk.map(async (img, idx) => {
      if (isCancelled) return;
      try {
        const imageBlob = await fetchImageBlob(img, tabId, pageUrl);
        const entries = await processImageForZip(imageBlob, options);
        chunkResults[idx] = entries;
      } catch (err) {
        console.error(`[Parallel Fetcher] Failed image:`, err);
        chunkResults[idx] = [];
      }
    }));

    // Append all slices in strict chronological page order (001.jpg, 002.jpg, ...)
    for (let idx = 0; idx < chunkResults.length; idx++) {
      const entries = chunkResults[idx];
      if (entries && entries.length > 0) {
        for (const entry of entries) {
          const pageNum = String(pageCounter++).padStart(3, '0');
          folder.file(`${pageNum}.${entry.ext}`, entry.buffer);
          entry.buffer = null; // Free buffer reference in array
        }
      }
      chunkResults[idx] = null; // Free entry reference in array
    }

    const imageProgress = Math.round((Math.min(i + concurrency, images.length) / images.length) * 100);
    await updateState({
      progress: imageProgress,
      subMessage: `Packaged ${pageCounter - 1} pages from ${images.length} images (⚡ Multi-threaded)...`
    });

    // Polite pacing delay between chunks to preserve bandwidth for other apps and prevent socket exhaustion
    if (delayMs > 0 && (i + concurrency) < images.length) {
      await new Promise(r => setTimeout(r, Math.min(delayMs, 1000)));
    } else if (isParallel && (i + concurrency) < images.length) {
      // 50ms polite micro-pause
      await new Promise(r => setTimeout(r, 50));
    }
  }

  const successCount = pageCounter - 1;

  // If no images succeeded for this chapter, clean up the empty directory entry
  if (successCount === 0 && folderName) {
    const dirKey = folderName.endsWith('/') ? folderName : folderName + '/';
    delete zip.files[dirKey];
  }

  return successCount;
}

/**
 * Helper: Packages and triggers a download for a JSZip instance.
 * Generates ComicInfo.xml metadata for CBZ and comic readers.
 */
async function downloadZipInstance(zip, zipFilename, metadata = {}) {
  // 1. Validation: Ensure archive actually contains image files (not just empty folders or ComicInfo.xml)
  const imageEntries = Object.keys(zip.files).filter(k => {
    const lower = k.toLowerCase();
    return !k.endsWith('/') && !lower.endsWith('.xml') && !lower.endsWith('.txt');
  });

  if (imageEntries.length === 0) {
    throw new Error(`Archive integrity check failed: No valid image files found to package for "${zipFilename}".`);
  }

  const { seriesTitle, chapterNum, pageCount } = metadata;
  if (seriesTitle && !zip.file('ComicInfo.xml')) {
    const xmlContent = generateComicInfoXml(seriesTitle, chapterNum, pageCount || imageEntries.length);
    zip.file('ComicInfo.xml', xmlContent);
  }

  await updateState({ subMessage: `Compressing ${imageEntries.length} images into archive...` });

  // generateAsync with live progress updates so the UI never appears frozen
  let lastReportedPct = 0;
  const zipBlob = await zip.generateAsync(
    { type: 'blob' },
    (progressData) => {
      const pct = Math.round(progressData.percent || 0);
      if (pct !== lastReportedPct) {
        lastReportedPct = pct;
        // Fire-and-forget UI update during packaging — does not block generateAsync
        updateState({ subMessage: `Compressing archive... ${pct}%` }).catch(() => {});
      }
    }
  );

  if (!zipBlob || zipBlob.size === 0) {
    throw new Error(`ZIP generation produced an empty archive for "${zipFilename}". Aborting download.`);
  }

  console.log(`[Service Worker] Triggering download for ${zipFilename} (${imageEntries.length} pages, ${(zipBlob.size / 1024 / 1024).toFixed(2)} MB)...`);
  return await triggerDownload(zipBlob, zipFilename);
}

/**
 * Robust Streaming Download Runner for Chrome Service Workers.
 * Prefers streaming URL.createObjectURL (Chrome 116+) which bypasses
 * V8 string memory limits and Chrome's 32MB Data URL ceiling.
 */
async function triggerDownload(blobOrData, filename) {
  const cleanName = filename.replace(/^[\\\/]+/, '');
  pendingDownloadFilename = cleanName;

  let blob;
  if (blobOrData instanceof Blob) {
    blob = blobOrData;
  } else if (blobOrData && blobOrData.blob instanceof Blob) {
    blob = blobOrData.blob;
  } else if (blobOrData instanceof ArrayBuffer || ArrayBuffer.isView(blobOrData)) {
    blob = new Blob([blobOrData]);
  } else if (blobOrData && blobOrData.buffer instanceof ArrayBuffer) {
    blob = new Blob([blobOrData.buffer], { type: blobOrData.mime || 'application/octet-stream' });
  } else {
    blob = new Blob([blobOrData]);
  }

  // Strategy 1: URL.createObjectURL directly in service worker (Chrome 116+)
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    try {
      const blobUrl = URL.createObjectURL(blob);
      return await new Promise((resolve, reject) => {
        // Guard: if the downloads API never calls back (e.g. Chrome bug), reject after 30 s
        const cbTimeout = setTimeout(() => {
          try { URL.revokeObjectURL(blobUrl); } catch (e) {}
          reject(new Error('chrome.downloads.download (Blob URL) timed out after 30 s'));
        }, 30000);

        chrome.downloads.download({
          url: blobUrl,
          filename: cleanName,
          saveAs: false
        }, (downloadId) => {
          clearTimeout(cbTimeout);
          if (chrome.runtime.lastError) {
            try { URL.revokeObjectURL(blobUrl); } catch (e) {}
            console.warn('[Service Worker] Blob URL download rejected, trying data URL fallback:', chrome.runtime.lastError.message);
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            console.log(`[Service Worker] Download started via Blob URL! ID: ${downloadId}`);
            // Revoke after 5 seconds: gives Chrome's download engine time to open the data pipe,
            // while ensuring no memory accumulates across subsequent volume archives.
            setTimeout(() => {
              try { URL.revokeObjectURL(blobUrl); } catch (e) {}
            }, 5000);
            resolve(downloadId);
          }
        });
      });
    } catch (blobErr) {
      console.warn('[Service Worker] Blob URL creation failed, trying data URL fallback:', blobErr);
    }
  }

  // Strategy 2: Data URL fallback
  const dataUrl = await blobToDataUrl(blob);
  return new Promise((resolve, reject) => {
    // Guard: if the downloads API never calls back, reject after 30 s
    const cbTimeout = setTimeout(() => {
      reject(new Error('chrome.downloads.download (Data URL) timed out after 30 s'));
    }, 30000);

    chrome.downloads.download({
      url: dataUrl,
      filename: cleanName,
      saveAs: false
    }, (downloadId) => {
      clearTimeout(cbTimeout);
      if (chrome.runtime.lastError) {
        pendingDownloadFilename = null;
        console.error('chrome.downloads error:', chrome.runtime.lastError);
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        console.log(`[Service Worker] Download started via Data URL! ID: ${downloadId}`);
        resolve(downloadId);
      }
    });
  });
}

function escapeXmlString(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateComicInfoXml(seriesTitle, chapterNum, pageCount) {
  const cleanTitle = escapeXmlString(seriesTitle || 'Manga');
  const cleanCh = escapeXmlString(chapterNum || '1');
  return `<?xml version="1.0" encoding="utf-8"?>
<ComicInfo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <Series>${cleanTitle}</Series>
  <Number>${cleanCh}</Number>
  <PageCount>${pageCount || 1}</PageCount>
  <Manga>YesAndRightToLeft</Manga>
</ComicInfo>`;
}

async function saveDownloadHistory(seriesTitle, chapterNum, extraMeta = {}) {
  if (!seriesTitle || !chapterNum) return;
  try {
    const key = sanitizeFilename(seriesTitle).toLowerCase();
    const data = await chrome.storage.local.get('downloadHistory');
    const history = data.downloadHistory || {};
    // Preserve existing domain/pageUrl if not being overwritten
    const existing = history[key] || {};
    history[key] = {
      ...existing,
      seriesTitle,
      lastChapter: parseInt(chapterNum, 10),
      updatedAt: Date.now(),
      domain: extraMeta.domain || existing.domain || '',
      pageUrl: extraMeta.pageUrl || existing.pageUrl || ''
    };
    await chrome.storage.local.set({ downloadHistory: history });
  } catch (e) {
    console.warn('Failed to save download history:', e);
  }
}

/**
 * Dynamic Referer & Origin rule for DeclarativeNetRequest.
 * Bypasses anti-hotlink and Cloudflare referer blocks on all manga CDNs.
 * Scoped STRICTLY to this extension's initiator domain (chrome.runtime.id)
 * so it NEVER touches, alters, or breaks other tabs (YouTube, Discord, Google, etc.).
 */
async function updateRefererRule(pageUrl) {
  if (!chrome.declarativeNetRequest || !pageUrl) return;
  try {
    const origin = new URL(pageUrl).origin;
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1001],
      addRules: [{
        id: 1001,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [
            { header: 'Referer', operation: 'set', value: pageUrl },
            { header: 'Origin', operation: 'set', value: origin }
          ]
        },
        condition: {
          initiatorDomains: [chrome.runtime.id],
          resourceTypes: ['xmlhttprequest', 'image', 'other']
        }
      }]
    });
  } catch (e) {
    console.warn('[Service Worker] updateRefererRule error:', e);
  }
}

/**
 * Clean up DeclarativeNetRequest rules when downloading is idle or completed
 * so zero network rules linger in the browser.
 */
async function cleanupRefererRule() {
  if (!chrome.declarativeNetRequest) return;
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1001]
    });
  } catch (e) {}
}

/**
 * Content Validation: Detects fake 200 responses returning HTML, XML or JSON error pages.
 */
function isDisguisedHtmlOrError(buffer) {
  if (!buffer || buffer.byteLength < 4) return true;
  const sample = new Uint8Array(buffer.slice(0, Math.min(buffer.byteLength, 256)));
  const str = new TextDecoder('utf-8', { fatal: false }).decode(sample).trim().toLowerCase();
  if (
    str.startsWith('<!doctype') ||
    str.startsWith('<html') ||
    str.startsWith('<?xml') ||
    str.startsWith('<head') ||
    str.startsWith('{"error"') ||
    str.startsWith('{"message"') ||
    str.includes('404 not found') ||
    str.includes('access denied') ||
    str.includes('cloudflare') ||
    str.includes('error code:')
  ) {
    return true;
  }
  return false;
}

/**
 * Byte-Level Image Integrity: Validates file headers and EOF/IEND/RIFF markers
 * to detect network-truncated half-downloaded images.
 */
function isImageTruncatedOrCorrupt(buffer, mime) {
  if (!buffer || buffer.byteLength < 80) return true;
  if (isDisguisedHtmlOrError(buffer)) return true;

  const len = buffer.byteLength;
  // If buffer is reasonably sized (> 10KB) and not disguised HTML, it's valid
  if (len > 10240) return false;

  const u8 = new Uint8Array(buffer);
  // For tiny buffers (< 10KB), ensure it has a recognized image header
  if (u8[0] === 0xFF && u8[1] === 0xD8) return false; // JPEG
  if (u8[0] === 0x89 && u8[1] === 0x50) return false; // PNG
  if (u8[0] === 0x52 && u8[1] === 0x49) return false; // WebP (RIFF)
  if (u8[0] === 0x47 && u8[1] === 0x49) return false; // GIF
  if (len >= 8 && u8[4] === 0x66 && u8[5] === 0x74) return false; // AVIF

  return false;
}

/**
 * Accurately detects image MIME type from binary magic bytes.
 */
function detectImageMime(buffer) {
  if (!buffer || buffer.byteLength < 4) return null;
  const u8 = new Uint8Array(buffer.slice(0, 16));

  // JPEG: FF D8
  if (u8[0] === 0xFF && u8[1] === 0xD8) return 'image/jpeg';
  // PNG: 89 50 4E 47
  if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4E && u8[3] === 0x47) return 'image/png';
  // GIF: 47 49 46
  if (u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46) return 'image/gif';
  // WebP: RIFF ... WEBP
  if (u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46) return 'image/webp';
  // AVIF / HEIC: ftyp
  if (u8.length >= 8 && u8[4] === 0x66 && u8[5] === 0x74 && u8[6] === 0x79 && u8[7] === 0x70) return 'image/avif';

  return null;
}

function getExtFromMime(mime) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/avif') return 'avif';
  return 'jpg';
}

function guessMimeFromUrl(url) {
  try {
    const ext = url.split('?')[0].split('#')[0].split('.').pop().toLowerCase();
    const map = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' };
    return map[ext] || 'image/jpeg';
  } catch (e) {
    return 'image/jpeg';
  }
}

/**
 * Universal Image Fetcher: Returns { blob, buffer, mime }
 * Fetches raw ArrayBuffer directly with extension host permissions, decodes binary magic bytes,
 * validates against HTML error disguise and network truncation, and falls back to content script.
 */
async function fetchImageBlob(imgObj, tabId = null, pageUrl = null) {
  const primaryUrl = (typeof imgObj === 'object' && imgObj.unscaledUrl) ? imgObj.unscaledUrl : (typeof imgObj === 'string' ? imgObj : imgObj.url);
  const fallbackUrl = (typeof imgObj === 'object' && imgObj.url) ? imgObj.url : primaryUrl;

  const targetUrls = (primaryUrl && fallbackUrl && primaryUrl !== fallbackUrl)
    ? [primaryUrl, fallbackUrl]
    : [primaryUrl || fallbackUrl];

  for (const url of targetUrls) {
    if (!url || !url.startsWith('http')) continue;

    // Direct background fetch with multiple retry options
    const fetchConfigs = [
      { credentials: 'omit' },
      {},
      { mode: 'cors' },
      { credentials: 'include' }
    ];

    for (const config of fetchConfigs) {
      try {
        // Abort fetch if it stalls for >20 seconds (prevents single-image hangs blocking whole batch)
        const controller = new AbortController();
        const fetchTimer = setTimeout(() => controller.abort(), 20000);
        let resp;
        try {
          resp = await fetch(url, { ...config, signal: controller.signal });
        } finally {
          clearTimeout(fetchTimer);
        }
        if (resp.ok) {
          const buf = await resp.arrayBuffer();
          if (buf && buf.byteLength > 80 && !isDisguisedHtmlOrError(buf)) {
            const mime = detectImageMime(buf) || guessMimeFromUrl(url) || 'image/jpeg';
            if (!isImageTruncatedOrCorrupt(buf, mime)) {
              const blob = new Blob([buf], { type: mime });
              return { blob, buffer: buf, mime };
            }
          }
        }
      } catch (err) {}
    }

    // Fallback: Ask Content Script in page context
    if (tabId) {
      try {
        const res = await sendMessageToTab(tabId, { action: 'FETCH_IMAGE_DATA', url });
        if (res && res.success && res.dataUrl && res.dataUrl.length > 200) {
          const blob = await dataUrlToBlob(res.dataUrl);
          const buf = await blob.arrayBuffer();
          if (buf && buf.byteLength > 80 && !isDisguisedHtmlOrError(buf)) {
            const mime = detectImageMime(buf) || blob.type || 'image/jpeg';
            return { blob, buffer: buf, mime };
          }
        }
      } catch (e) {}
    }
  }

  throw new Error(`Unable to fetch valid image: ${fallbackUrl}`);
}

/**
 * Smart Webtoon Slicer & Image Processor for ZIP Packaging:
 * Returns an array of sliced/processed page entries [{ buffer, ext }, ...]
 * preserving pure sequential chapter ordering without compound prefixes.
 */
async function processImageForZip(imgData, options) {
  const imageBlob = (imgData && imgData.blob instanceof Blob)
    ? imgData.blob
    : (imgData instanceof Blob ? imgData : (imgData ? new Blob([imgData]) : null));
  const imageBuffer = imgData?.buffer || (imageBlob ? await imageBlob.arrayBuffer() : null);
  const mime = imgData?.mime || imageBlob?.type || detectImageMime(imageBuffer) || 'image/jpeg';
  const ext = getExtFromMime(mime);

  const autoSplit = options.autoSplitWebtoons !== false; // Default enabled

  if (autoSplit && typeof createImageBitmap === 'function' && typeof OffscreenCanvas === 'function' && imageBlob) {
    let imageBitmap = null;
    try {
      imageBitmap = await createImageBitmap(imageBlob);
      const width = imageBitmap.width;
      const height = imageBitmap.height;
      const aspectRatio = height / width;

      // Only slice ultra-tall strips (aspect ratio > 2.5 and height > 1500px)
      if (aspectRatio > 2.5 && height > 1500) {
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(imageBitmap, 0, 0);

        const imageData = ctx.getImageData(0, 0, width, height);
        const pixels = imageData.data;

        // Sample row brightness to detect gap rows
        const rowBrightness = new Float32Array(height);
        const step = Math.max(1, Math.floor(width / 50));

        for (let y = 0; y < height; y++) {
          let sum = 0;
          let count = 0;
          const rowOffset = y * width * 4;
          for (let x = 0; x < width * 4; x += step * 4) {
            const r = pixels[rowOffset + x];
            const g = pixels[rowOffset + x + 1];
            const b = pixels[rowOffset + x + 2];
            sum += (0.299 * r + 0.587 * g + 0.114 * b);
            count++;
          }
          rowBrightness[y] = sum / (count || 1);
        }

        const targetSliceHeight = Math.min(1200, Math.floor(width * 1.5));
        const minSliceHeight = 500;
        const splitPoints = [0];

        let lastSplit = 0;
        for (let y = minSliceHeight; y < height - minSliceHeight; y++) {
          const heightFromLast = y - lastSplit;

          if (heightFromLast >= targetSliceHeight) {
            let bestGapY = y;
            let maxGapScore = -1;

            const searchStart = Math.max(lastSplit + minSliceHeight, y - 200);
            const searchEnd = Math.min(height - minSliceHeight, y + 200);

            for (let gy = searchStart; gy < searchEnd; gy++) {
              const b = rowBrightness[gy];
              const dist = Math.abs(gy - y);
              const score = (b > 240 || b < 15 ? 100 : b) - (dist / 10);
              if (score > maxGapScore) {
                maxGapScore = score;
                bestGapY = gy;
              }
            }

            splitPoints.push(bestGapY);
            lastSplit = bestGapY;
            y = bestGapY + minSliceHeight;
          }
        }
        splitPoints.push(height);

        if (splitPoints.length > 2) {
          const targetWidth = Math.max(width, 800);
          const scaleFactor = targetWidth / width;
          const slices = [];

          for (let s = 0; s < splitPoints.length - 1; s++) {
            const startY = splitPoints[s];
            const endY = splitPoints[s + 1];
            const sliceH = endY - startY;
            if (sliceH <= 0) continue;

            const destH = Math.round(sliceH * scaleFactor);

            const sliceCanvas = new OffscreenCanvas(targetWidth, destH);
            const sCtx = sliceCanvas.getContext('2d');
            sCtx.imageSmoothingEnabled = true;
            sCtx.imageSmoothingQuality = 'high';

            sCtx.drawImage(
              imageBitmap,
              0, startY, width, sliceH,
              0, 0, targetWidth, destH
            );

            const sliceBlob = await sliceCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
            const sliceBuffer = await sliceBlob.arrayBuffer();
            slices.push({ buffer: sliceBuffer, ext: 'jpg' });
          }
          return slices;
        }
      }
    } catch (e) {
      console.warn('[Service Worker] Webtoon strip slicer fallback to original:', e);
    } finally {
      if (imageBitmap && typeof imageBitmap.close === 'function') {
        try { imageBitmap.close(); } catch (_) {}
      }
    }
  }

  // Fallback: return single original image
  return [{ buffer: imageBuffer, ext: ext }];
}

function getImageExtensionFromBlob(blob) {
  if (blob && blob.type) {
    if (blob.type.includes('png')) return 'png';
    if (blob.type.includes('webp')) return 'webp';
    if (blob.type.includes('gif')) return 'gif';
    if (blob.type.includes('avif')) return 'avif';
  }
  return 'jpg';
}

function dataUrlToBlob(dataUrl) {
  return fetch(dataUrl).then(res => res.blob());
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to convert blob to data URL'));
    reader.readAsDataURL(blob);
  });
}

function getImageExtension(url) {
  try {
    const cleanUrl = url.split('?')[0].split('#')[0];
    const ext = cleanUrl.substring(cleanUrl.lastIndexOf('.') + 1).toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes(ext)) {
      return ext === 'jpeg' ? 'jpg' : ext;
    }
  } catch (e) {}
  return 'jpg';
}

function sanitizeFilename(name) {
  if (!name) return 'Manhwa';
  let cleaned = name
    .replace(/\s*[\-\|]\s*(Read|Chapter|Online|Scanlation|English|Free|Raw|Manga|Manhwa|Comic).*$/i, '')
    .replace(/chapter\s*\d+.*/i, '')
    .replace(/[\\/:*?"<>|\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[\s._]+|[\s._]+$/g, '')
    .trim();

  // Guard against Windows reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(cleaned)) {
    cleaned = cleaned + '_manga';
  }

  // Filesystem path length safety (keep under 180 chars to avoid OS errors)
  if (cleaned.length > 180) {
    cleaned = cleaned.substring(0, 180).replace(/_+$/, '');
  }

  return cleaned || 'Manhwa';
}

async function ensureContentScriptInjected(tabId) {
  // NEVER fall back to activeTab — it would inject into the user's reading tab.
  // If tabId is not a valid positive integer, bail immediately.
  if (!Number.isInteger(tabId) || tabId <= 0) {
    console.warn('[Service Worker] ensureContentScriptInjected: invalid tabId — refusing to inject:', tabId);
    return false;
  }

  try {
    const res = await sendMessageToTab(tabId, { action: 'GET_PAGE_INFO' });
    if (res && res.success) return true;
  } catch (e) {}

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/content-script.js']
    });
    return true;
  } catch (err) {
    console.warn(`[Service Worker] Script injection failed for tab ${tabId}:`, err?.message);
    return false;
  }
}

function sendMessageToTab(tabId, message, retries = 4) {
  if (!tabId || typeof tabId !== 'number') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const trySend = (attemptsLeft) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError || !response) {
          if (attemptsLeft > 0) {
            setTimeout(() => trySend(attemptsLeft - 1), 1000);
          } else {
            resolve(null);
          }
        } else {
          resolve(response);
        }
      });
    };
    trySend(retries);
  });
}

function waitForTabToLoad(tabId, maxWaitMs = 15000) {
  return new Promise((resolve) => {
    let finished = false;

    const cleanup = () => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };

    // Hard timeout so heavy ad trackers never hang the downloader
    const timer = setTimeout(cleanup, maxWaitMs);

    // If tab is already complete and loaded (not blank), resolve immediately!
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        cleanup();
        return;
      }
      if (tab.status === 'complete' && tab.url && tab.url !== 'about:blank') {
        cleanup();
      }
    });

    const listener = (tid, changeInfo) => {
      if (tid === tabId && changeInfo.status === 'complete') {
        cleanup();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function updateState(newState) {
  const current = await getStoredState();
  const merged = { ...current, ...newState, lastUpdated: Date.now() };
  await chrome.storage.local.set({ downloadJobState: merged });
  if (currentActiveJobId) {
    await updateJobState(currentActiveJobId, newState);
  }
  try {
    chrome.runtime.sendMessage({ action: 'PROGRESS_UPDATE', state: merged }).catch(() => {});
  } catch (e) {}
}

async function getStoredState() {
  const data = await chrome.storage.local.get('downloadJobState');
  return data.downloadJobState || { status: 'idle', progress: 0, message: 'Ready' };
}
