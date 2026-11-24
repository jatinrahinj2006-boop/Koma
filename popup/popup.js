/**
 * Manhwa & Manga Batch Downloader - Enhanced Popup Script (v1.5 Container Click Toggle)
 * Clicking anywhere on an image card toggles its selection state.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const detectedSiteBadge = document.getElementById('detected-site-badge');
  const seriesTitleInput = document.getElementById('series-title-input');
  const currentChapterNumEl = document.getElementById('current-chapter-num');
  
  const btnOpenSidepanel = document.getElementById('btn-open-sidepanel');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  const btnSingle = document.getElementById('btn-download-single');
  const btnBatch = document.getElementById('btn-download-batch');
  const btnCancel = document.getElementById('btn-cancel');

  const btnTogglePreview = document.getElementById('btn-toggle-preview');
  const previewContainer = document.getElementById('thumbnail-preview-container');
  const thumbnailGrid = document.getElementById('thumbnail-grid');
  const detectedCountEl = document.getElementById('detected-count');
  const btnSelectAll = document.getElementById('btn-select-all');
  const btnDeselectAll = document.getElementById('btn-deselect-all');

  const startChapterInput = document.getElementById('start-chapter');
  const endChapterInput = document.getElementById('end-chapter');
  const formatSelect = document.getElementById('format-select');
  const delaySelect = document.getElementById('delay-select');
  const autoScrollToggle = document.getElementById('auto-scroll-toggle');

  const progressCard = document.getElementById('progress-card');
  const progressStatusTitle = document.getElementById('progress-status-title');
  const progressPercent = document.getElementById('progress-percent');
  const progressBarFill = document.getElementById('progress-bar-fill');
  const progressSubtext = document.getElementById('progress-subtext');

  let activeTabId = null;
  let activeTabUrl = '';
  let activeWindowId = null;
  let detectedImages = [];
  let excludedUrlSet = new Set();

  const historyBadge = document.getElementById('history-badge');
  const filterPromosToggle = document.getElementById('filter-promos-toggle');
  const enhanceContrastToggle = document.getElementById('enhance-contrast-toggle');
  const backgroundModeToggle = document.getElementById('background-mode-toggle');
  const batchBundleSelect = document.getElementById('batch-bundle-select');
  const parallelDownloadToggle = document.getElementById('parallel-download-toggle');
  const batchParallelToggle = document.getElementById('batch-parallel-toggle');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    activeTabId = tab.id;
    activeTabUrl = tab.url;
    activeWindowId = tab.windowId;
    try {
      const hostname = new URL(tab.url).hostname;
      detectedSiteBadge.textContent = hostname.replace('www.', '');

      // Ensure content script injection is complete before messaging
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/content-script.js']
      }).then(() => {
        chrome.tabs.sendMessage(tab.id, { action: 'SCAN_CHAPTER_IMAGES', triggerScroll: false }, (response) => {
          if (chrome.runtime.lastError) {
            // Ignore connection error if page cannot receive messages (e.g. chrome:// or restricted page)
            return;
          }
          if (response && response.success) {
            const info = response.pageInfo || {};
            const seriesTitle = info.seriesTitle || tab.title.split('-')[0].trim() || 'Manga_Comic';
            seriesTitleInput.value = seriesTitle;
            
            if (info.chapterNumber) {
              currentChapterNumEl.textContent = info.chapterNumber;
              startChapterInput.value = info.chapterNumber;
              endChapterInput.value = Math.min(info.chapterNumber + 9, info.chapterNumber + 50);
            } else {
              currentChapterNumEl.textContent = '1';
              startChapterInput.value = 1;
              endChapterInput.value = 10;
            }

            // Query Download History for this series
            chrome.runtime.sendMessage({ action: 'GET_DOWNLOAD_HISTORY', seriesTitle }, (histRes) => {
              if (chrome.runtime.lastError) return;
              if (histRes && histRes.success && histRes.historyItem) {
                const lastCh = histRes.historyItem.lastChapter;
                if (historyBadge) {
                  historyBadge.textContent = `Last: Ch ${lastCh}`;
                  historyBadge.classList.remove('hidden');
                }
                startChapterInput.value = lastCh + 1;
                endChapterInput.value = lastCh + 10;
              }
            });

            if (response.images && response.images.length > 0) {
              detectedImages = response.images;
              detectedCountEl.textContent = detectedImages.length;
              renderVerticalStripList(detectedImages);
            }
          } else {
            currentChapterNumEl.textContent = '-';
          }
        });
      }).catch((e) => {
        // Tab is not a standard web page or scripting is restricted
        console.warn('Scripting not allowed on this tab:', e);
        currentChapterNumEl.textContent = '-';
      });
    } catch (e) {
      console.warn('Could not read tab URL:', e);
      detectedSiteBadge.textContent = 'Active Page';
    }
  }

  // Open Side Panel Trigger
  btnOpenSidepanel.addEventListener('click', async () => {
    if (activeWindowId && chrome.sidePanel && chrome.sidePanel.open) {
      try {
        await chrome.sidePanel.open({ windowId: activeWindowId });
        window.close();
      } catch (e) {
        console.error('Failed to open side panel:', e);
      }
    }
  });

  const btnOpenPdfStudio = document.getElementById('btn-open-pdf-studio');
  if (btnOpenPdfStudio) {
    btnOpenPdfStudio.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('tools/pdf-maker.html') });
      window.close();
    });
  }

  const btnOpenPdfDupChecker = document.getElementById('btn-open-pdf-dupchecker');
  if (btnOpenPdfDupChecker) {
    btnOpenPdfDupChecker.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('tools/pdf-maker.html?tab=dup-checker') });
      window.close();
    });
  }

  const queueCard = document.getElementById('queue-card');
  const queueCountEl = document.getElementById('queue-count');
  const queueList = document.getElementById('queue-list');
  const btnClearQueue = document.getElementById('btn-clear-queue');

  if (btnClearQueue) {
    btnClearQueue.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'CLEAR_COMPLETED_JOBS' });
    });
  }

  chrome.runtime.sendMessage({ action: 'GET_JOB_STATUS' }, (res) => {
    if (chrome.runtime.lastError) return;
    if (res && res.success) {
      if (res.state) renderJobState(res.state);
      if (res.queue) renderQueueState(res.queue);
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'PROGRESS_UPDATE' && msg.state) {
      renderJobState(msg.state);
    }
    if (msg.action === 'QUEUE_UPDATE' && msg.queue) {
      renderQueueState(msg.queue);
    }
  });

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      document.getElementById(targetId).classList.add('active');
    });
  });

  btnTogglePreview.addEventListener('click', () => {
    previewContainer.classList.toggle('hidden');
  });

  btnSelectAll.addEventListener('click', () => {
    excludedUrlSet.clear();
    updateThumbnailsCheckState(true);
  });

  btnDeselectAll.addEventListener('click', () => {
    detectedImages.forEach(img => excludedUrlSet.add(img.url));
    updateThumbnailsCheckState(false);
  });

  const highResToggle = document.getElementById('high-res-toggle');
  const autoSplitToggle = document.getElementById('auto-split-toggle');

  // Load and restore saved user preferences
  chrome.storage.local.get('userPreferences', (data) => {
    if (data && data.userPreferences) {
      const prefs = data.userPreferences;
      if (prefs.format && formatSelect) formatSelect.value = prefs.format;
      if (prefs.requestDelay !== undefined && delaySelect) delaySelect.value = prefs.requestDelay;
      if (prefs.autoScroll !== undefined && autoScrollToggle) autoScrollToggle.checked = prefs.autoScroll;
      if (prefs.highResAutoFix !== undefined && highResToggle) highResToggle.checked = prefs.highResAutoFix;
      if (prefs.autoSplitWebtoons !== undefined && autoSplitToggle) autoSplitToggle.checked = prefs.autoSplitWebtoons;
      if (prefs.filterPromos !== undefined && filterPromosToggle) filterPromosToggle.checked = prefs.filterPromos;
      if (prefs.enhanceContrast !== undefined && enhanceContrastToggle) enhanceContrastToggle.checked = prefs.enhanceContrast;
      if (prefs.runInBackground !== undefined && backgroundModeToggle) backgroundModeToggle.checked = prefs.runInBackground;
      if (prefs.batchOutputMode && batchBundleSelect) batchBundleSelect.value = prefs.batchOutputMode;
      if (prefs.parallelChapters !== undefined) {
        if (parallelDownloadToggle) parallelDownloadToggle.checked = prefs.parallelChapters;
        if (batchParallelToggle) batchParallelToggle.checked = prefs.parallelChapters;
      }
    }
  });

  // Synchronize both parallel download checkboxes
  if (parallelDownloadToggle && batchParallelToggle) {
    parallelDownloadToggle.addEventListener('change', () => {
      batchParallelToggle.checked = parallelDownloadToggle.checked;
      savePreferences();
    });
    batchParallelToggle.addEventListener('change', () => {
      parallelDownloadToggle.checked = batchParallelToggle.checked;
      savePreferences();
    });
  }

  function savePreferences() {
    const isParallel = batchParallelToggle ? batchParallelToggle.checked : (parallelDownloadToggle ? parallelDownloadToggle.checked : true);
    const prefs = {
      format: formatSelect ? formatSelect.value : 'zip',
      requestDelay: delaySelect ? parseInt(delaySelect.value, 10) : 150,
      autoScroll: autoScrollToggle ? autoScrollToggle.checked : true,
      highResAutoFix: highResToggle ? highResToggle.checked : true,
      autoSplitWebtoons: autoSplitToggle ? autoSplitToggle.checked : true,
      filterPromos: filterPromosToggle ? filterPromosToggle.checked : true,
      enhanceContrast: enhanceContrastToggle ? enhanceContrastToggle.checked : false,
      runInBackground: backgroundModeToggle ? backgroundModeToggle.checked : true,
      batchOutputMode: batchBundleSelect ? batchBundleSelect.value : 'single_archive',
      parallelChapters: isParallel
    };
    chrome.storage.local.set({ userPreferences: prefs });
  }

  [formatSelect, delaySelect, autoScrollToggle, highResToggle, autoSplitToggle, filterPromosToggle, enhanceContrastToggle, backgroundModeToggle, batchBundleSelect, parallelDownloadToggle, batchParallelToggle].forEach(el => {
    if (el) el.addEventListener('change', savePreferences);
  });

  const lightboxModal = document.getElementById('lightbox-modal');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxClose = document.getElementById('lightbox-close');

  if (lightboxClose) {
    lightboxClose.addEventListener('click', () => lightboxModal.classList.add('hidden'));
    lightboxModal.addEventListener('click', (e) => {
      if (e.target === lightboxModal) lightboxModal.classList.add('hidden');
    });
  }

  btnSingle.addEventListener('click', async () => {
    if (!activeTabId) return;

    const options = {
      customTitle: seriesTitleInput.value.trim() || 'Manga_Comic',
      format: formatSelect.value,
      pageUrl: activeTabUrl,
      requestDelay: parseInt(delaySelect.value, 10),
      autoScroll: autoScrollToggle ? autoScrollToggle.checked : true,
      highResAutoFix: highResToggle ? highResToggle.checked : true,
      autoSplitWebtoons: autoSplitToggle ? autoSplitToggle.checked : true,
      filterPromos: filterPromosToggle ? filterPromosToggle.checked : true,
      enhanceContrast: enhanceContrastToggle ? enhanceContrastToggle.checked : false,
      runInBackground: backgroundModeToggle ? backgroundModeToggle.checked : true,
      parallelChapters: parallelDownloadToggle ? parallelDownloadToggle.checked : true,
      excludedUrls: Array.from(excludedUrlSet)
    };

    chrome.runtime.sendMessage({
      action: 'START_SINGLE_CHAPTER',
      tabId: activeTabId,
      options
    });
  });

  if (startChapterInput && endChapterInput) {
    startChapterInput.addEventListener('input', () => {
      const s = parseInt(startChapterInput.value, 10);
      const e = parseInt(endChapterInput.value, 10);
      if (!isNaN(s) && (isNaN(e) || e < s)) {
        endChapterInput.value = s + 9;
      }
    });
  }

  btnBatch.addEventListener('click', async () => {
    if (!activeTabId) return;

    let start = parseInt(startChapterInput.value, 10);
    let end = parseInt(endChapterInput.value, 10);

    if (isNaN(start) || start < 1) {
      alert('Please enter a valid starting chapter number (e.g. 171)!');
      return;
    }

    if (isNaN(end) || end < start) {
      end = start;
      endChapterInput.value = start;
    }

    const options = {
      customTitle: seriesTitleInput.value.trim() || 'Manga_Comic',
      startChapter: start,
      endChapter: end,
      pageUrl: activeTabUrl,
      format: formatSelect.value,
      batchOutputMode: batchBundleSelect ? batchBundleSelect.value : 'single_archive',
      runInBackground: backgroundModeToggle ? backgroundModeToggle.checked : true,
      parallelChapters: batchParallelToggle ? batchParallelToggle.checked : (parallelDownloadToggle ? parallelDownloadToggle.checked : true),
      requestDelay: parseInt(delaySelect.value, 10),
      autoScroll: autoScrollToggle ? autoScrollToggle.checked : true,
      highResAutoFix: highResToggle ? highResToggle.checked : true,
      autoSplitWebtoons: autoSplitToggle ? autoSplitToggle.checked : true,
      filterPromos: filterPromosToggle ? filterPromosToggle.checked : true,
      enhanceContrast: enhanceContrastToggle ? enhanceContrastToggle.checked : false
    };

    chrome.runtime.sendMessage({
      action: 'START_BATCH_RANGE',
      tabId: activeTabId,
      options
    });
  });

  // --- TOC Scanner Implementation ---
  const btnScanToc = document.getElementById('btn-scan-toc');
  const tocCountEl = document.getElementById('toc-count');
  const tocListEl = document.getElementById('toc-list');
  const btnDownloadTocSelected = document.getElementById('btn-download-toc-selected');
  let detectedTocChapters = [];

  function scanSeriesToc() {
    if (!activeTabId) return;
    chrome.tabs.sendMessage(activeTabId, { action: 'SCAN_SERIES_TOC' }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res && res.success && res.chapters && res.chapters.length > 0) {
        detectedTocChapters = res.chapters;
        if (tocCountEl) tocCountEl.textContent = detectedTocChapters.length;
        renderTocList(detectedTocChapters);
      } else {
        if (tocListEl) tocListEl.innerHTML = '<p class="empty-hint">No chapter list links detected on this page.</p>';
      }
    });
  }

  if (btnScanToc) btnScanToc.addEventListener('click', scanSeriesToc);

  function renderTocList(chapters) {
    if (!tocListEl) return;
    tocListEl.innerHTML = '';
    chapters.forEach(ch => {
      const row = document.createElement('label');
      row.className = 'toc-item-row';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.dataset.url = ch.url;
      cb.dataset.num = ch.number;

      const titleSpan = document.createElement('span');
      titleSpan.className = 'toc-ch-title';
      titleSpan.textContent = ch.title;

      row.appendChild(cb);
      row.appendChild(titleSpan);
      tocListEl.appendChild(row);
    });
  }

  if (btnDownloadTocSelected) {
    btnDownloadTocSelected.addEventListener('click', async () => {
      const selectedCbs = Array.from(tocListEl.querySelectorAll('input[type="checkbox"]:checked'));
      if (selectedCbs.length === 0) {
        alert('Please select at least one chapter!');
        return;
      }

      // Build an ordered list of { url, number } for the selected chapters
      const selectedChapters = selectedCbs.map(cb => ({
        url: cb.dataset.url,
        number: cb.dataset.num
      }));

      const options = {
        customTitle: seriesTitleInput.value.trim() || 'Manga_Comic',
        format: formatSelect.value,
        batchOutputMode: batchBundleSelect ? batchBundleSelect.value : 'single_archive',
        runInBackground: backgroundModeToggle ? backgroundModeToggle.checked : true,
        parallelChapters: parallelDownloadToggle ? parallelDownloadToggle.checked : (batchParallelToggle ? batchParallelToggle.checked : true),
        requestDelay: parseInt(delaySelect.value, 10),
        autoScroll: autoScrollToggle ? autoScrollToggle.checked : true,
        highResAutoFix: highResToggle ? highResToggle.checked : true,
        autoSplitWebtoons: autoSplitToggle ? autoSplitToggle.checked : true,
        filterPromos: filterPromosToggle ? filterPromosToggle.checked : true,
        enhanceContrast: enhanceContrastToggle ? enhanceContrastToggle.checked : false,
        // TOC-specific: pass explicit chapter URLs so the batch engine visits them in order
        tocChapters: selectedChapters,
        startChapter: parseInt(selectedChapters[0].number, 10) || 1,
        endChapter: parseInt(selectedChapters[selectedChapters.length - 1].number, 10) || selectedChapters.length
      };

      chrome.runtime.sendMessage({
        action: 'START_BATCH_RANGE',
        tabId: activeTabId,
        options
      });
    });
  }

  // --- History & Bookmarks Implementation ---
  const btnSubHistory = document.getElementById('btn-sub-history');
  const btnSubBookmarks = document.getElementById('btn-sub-bookmarks');
  const btnAddBookmark = document.getElementById('btn-add-bookmark');
  const historyListEl = document.getElementById('history-list');
  let currentHistorySubTab = 'history';

  if (btnSubHistory && btnSubBookmarks) {
    btnSubHistory.addEventListener('click', () => {
      btnSubHistory.classList.add('active');
      btnSubBookmarks.classList.remove('active');
      currentHistorySubTab = 'history';
      loadHistoryTab();
    });

    btnSubBookmarks.addEventListener('click', () => {
      btnSubBookmarks.classList.add('active');
      btnSubHistory.classList.remove('active');
      currentHistorySubTab = 'bookmarks';
      loadBookmarksTab();
    });
  }

  if (btnAddBookmark) {
    btnAddBookmark.addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      let domain = 'Page';
      try { domain = new URL(tab.url).hostname.replace('www.', ''); } catch (e) {}
      const bookmark = {
        title: seriesTitleInput.value.trim() || tab.title.split('-')[0].trim(),
        url: tab.url,
        domain
      };

      chrome.runtime.sendMessage({ action: 'ADD_BOOKMARK', bookmark }, () => {
        if (currentHistorySubTab === 'bookmarks') loadBookmarksTab();
      });
    });
  }

  function loadHistoryTab() {
    if (!historyListEl) return;
    chrome.runtime.sendMessage({ action: 'GET_ALL_HISTORY' }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res && res.success && res.history) {
        renderHistoryList(res.history);
      } else {
        historyListEl.innerHTML = '<p class="empty-hint">No download history yet.</p>';
      }
    });
  }

  function loadBookmarksTab() {
    if (!historyListEl) return;
    chrome.runtime.sendMessage({ action: 'GET_BOOKMARKS' }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res && res.success && res.bookmarks) {
        renderBookmarksList(res.bookmarks);
      } else {
        historyListEl.innerHTML = '<p class="empty-hint">No bookmarks saved yet.</p>';
      }
    });
  }

  function renderHistoryList(historyObj) {
    if (!historyListEl) return;
    historyListEl.innerHTML = '';
    const keys = Object.keys(historyObj);
    if (keys.length === 0) {
      historyListEl.innerHTML = '<p class="empty-hint">No download history yet.</p>';
      return;
    }

    keys.forEach(k => {
      const item = historyObj[k];
      const card = document.createElement('div');
      card.className = 'history-card-item';

      const infoCol = document.createElement('div');
      infoCol.className = 'hist-info';

      const titleEl = document.createElement('span');
      titleEl.className = 'hist-title';
      titleEl.textContent = item.seriesTitle;

      const subEl = document.createElement('span');
      subEl.className = 'hist-sub';
      subEl.textContent = `Last: Ch. ${item.lastChapter} • ${item.domain || 'Site'}`;

      infoCol.appendChild(titleEl);
      infoCol.appendChild(subEl);

      if (item.pageUrl) {
        const resumeBtn = document.createElement('button');
        resumeBtn.className = 'btn secondary-btn small-btn';
        resumeBtn.textContent = 'Resume';
        resumeBtn.addEventListener('click', () => {
          chrome.tabs.create({ url: item.pageUrl });
        });
        card.appendChild(infoCol);
        card.appendChild(resumeBtn);
      } else {
        card.appendChild(infoCol);
      }

      historyListEl.appendChild(card);
    });
  }

  function renderBookmarksList(bookmarks) {
    if (!historyListEl) return;
    historyListEl.innerHTML = '';
    if (!bookmarks || bookmarks.length === 0) {
      historyListEl.innerHTML = '<p class="empty-hint">No bookmarks saved yet. Click ★ Bookmark Current Page above!</p>';
      return;
    }

    bookmarks.forEach(bm => {
      const card = document.createElement('div');
      card.className = 'history-card-item';

      const infoCol = document.createElement('div');
      infoCol.className = 'hist-info';

      const titleEl = document.createElement('span');
      titleEl.className = 'hist-title';
      titleEl.textContent = bm.title;

      const subEl = document.createElement('span');
      subEl.className = 'hist-sub';
      subEl.textContent = bm.domain;

      infoCol.appendChild(titleEl);
      infoCol.appendChild(subEl);

      const actionsRow = document.createElement('div');
      actionsRow.style.cssText = 'display:flex;gap:4px;';

      const openBtn = document.createElement('button');
      openBtn.className = 'btn secondary-btn small-btn';
      openBtn.textContent = 'Open';
      openBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: bm.url });
      });

      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn danger-btn small-btn text-btn';
      removeBtn.textContent = '🗑️';
      removeBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'REMOVE_BOOKMARK', url: bm.url }, () => loadBookmarksTab());
      });

      actionsRow.appendChild(openBtn);
      actionsRow.appendChild(removeBtn);

      card.appendChild(infoCol);
      card.appendChild(actionsRow);
      historyListEl.appendChild(card);
    });
  }

  btnCancel.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'CANCEL_DOWNLOAD' });
  });

  // --- Live PDF Previewer Modal ---
  const btnPdfPreview = document.getElementById('btn-pdf-preview');
  const pdfPreviewModal = document.getElementById('pdf-preview-modal');
  const pdfPreviewClose = document.getElementById('pdf-preview-close');
  const pdfPreviewImg = document.getElementById('pdf-preview-img');
  const pdfCurrentPageNum = document.getElementById('pdf-current-page-num');
  const pdfTotalPagesNum = document.getElementById('pdf-total-pages-num');
  const pdfPrevBtn = document.getElementById('pdf-prev-btn');
  const pdfNextBtn = document.getElementById('pdf-next-btn');

  let currentPdfPreviewIdx = 0;

  if (btnPdfPreview) {
    btnPdfPreview.addEventListener('click', () => {
      const activeImages = detectedImages.filter(img => !excludedUrlSet.has(img.url));
      if (activeImages.length === 0) {
        alert('No pages selected for PDF preview!');
        return;
      }
      currentPdfPreviewIdx = 0;
      updatePdfPreviewer(activeImages);
      if (pdfPreviewModal) pdfPreviewModal.classList.remove('hidden');
    });
  }

  if (pdfPreviewClose) {
    pdfPreviewClose.addEventListener('click', () => pdfPreviewModal.classList.add('hidden'));
    if (pdfPreviewModal) {
      pdfPreviewModal.addEventListener('click', (e) => {
        if (e.target === pdfPreviewModal) pdfPreviewModal.classList.add('hidden');
      });
    }
  }

  if (pdfPrevBtn) {
    pdfPrevBtn.addEventListener('click', () => {
      const activeImages = detectedImages.filter(img => !excludedUrlSet.has(img.url));
      if (currentPdfPreviewIdx > 0) {
        currentPdfPreviewIdx--;
        updatePdfPreviewer(activeImages);
      }
    });
  }

  if (pdfNextBtn) {
    pdfNextBtn.addEventListener('click', () => {
      const activeImages = detectedImages.filter(img => !excludedUrlSet.has(img.url));
      if (currentPdfPreviewIdx < activeImages.length - 1) {
        currentPdfPreviewIdx++;
        updatePdfPreviewer(activeImages);
      }
    });
  }

  function updatePdfPreviewer(activeImages) {
    if (!activeImages || activeImages.length === 0) return;
    if (pdfCurrentPageNum) pdfCurrentPageNum.textContent = currentPdfPreviewIdx + 1;
    if (pdfTotalPagesNum) pdfTotalPagesNum.textContent = activeImages.length;
    const target = activeImages[currentPdfPreviewIdx];
    if (!pdfPreviewImg || !target) return;

    // Use cached dataUrl if available
    if (target.dataUrl) {
      pdfPreviewImg.src = target.dataUrl;
      return;
    }

    pdfPreviewImg.src = '';
    pdfPreviewImg.alt = 'Loading page...';

    // Proxy through content script to bypass CDN hotlink protection
    if (activeTabId) {
      chrome.tabs.sendMessage(activeTabId, { action: 'FETCH_IMAGE_DATA', url: target.unscaledUrl || target.url }, (res) => {
        if (chrome.runtime.lastError) {
          pdfPreviewImg.src = target.unscaledUrl || target.url;
          pdfPreviewImg.alt = 'PDF Page Preview';
          return;
        }
        if (res && res.success && res.dataUrl) {
          target.dataUrl = res.dataUrl;
          pdfPreviewImg.src = res.dataUrl;
          pdfPreviewImg.alt = 'PDF Page Preview';
        } else {
          pdfPreviewImg.src = target.unscaledUrl || target.url;
          pdfPreviewImg.alt = 'PDF Page Preview';
        }
      });
    } else {
      pdfPreviewImg.src = target.unscaledUrl || target.url;
    }
  }

  function moveImagePosition(fromIdx, toIdx) {
    if (toIdx < 0 || toIdx >= detectedImages.length) return;
    const item = detectedImages.splice(fromIdx, 1)[0];
    detectedImages.splice(toIdx, 0, item);
    renderVerticalStripList(detectedImages);
  }

  /**
   * Renders images cleanly in vertical strip order with Reorder Controls.
   */
  function renderVerticalStripList(images) {
    thumbnailGrid.innerHTML = '';
    images.forEach((imgObj, idx) => {
      const item = document.createElement('div');
      item.className = 'thumb-item selected';

      const metaRow = document.createElement('div');
      metaRow.className = 'thumb-meta';

      const idxLabel = document.createElement('span');
      idxLabel.className = 'thumb-idx';
      idxLabel.textContent = `Page #${idx + 1}`;

      const reorderGroup = document.createElement('div');
      reorderGroup.style.cssText = 'display:flex;gap:3px;align-items:center;';

      const upBtn = document.createElement('button');
      upBtn.className = 'btn secondary-btn small-btn text-btn';
      upBtn.textContent = '◀';
      upBtn.title = 'Move Page Up';
      upBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        moveImagePosition(idx, idx - 1);
      });

      const downBtn = document.createElement('button');
      downBtn.className = 'btn secondary-btn small-btn text-btn';
      downBtn.textContent = '▶';
      downBtn.title = 'Move Page Down';
      downBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        moveImagePosition(idx, idx + 1);
      });

      reorderGroup.appendChild(upBtn);
      reorderGroup.appendChild(downBtn);

      const checkLabel = document.createElement('label');
      checkLabel.className = 'thumb-checkbox-label';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'thumb-checkbox';
      checkbox.checked = !excludedUrlSet.has(imgObj.url);

      const checkText = document.createTextNode(' Include');
      checkLabel.appendChild(checkbox);
      checkLabel.appendChild(checkText);

      metaRow.appendChild(idxLabel);
      metaRow.appendChild(reorderGroup);
      metaRow.appendChild(checkLabel);

      const imgEl = document.createElement('img');
      imgEl.className = 'thumb-img';
      imgEl.src = imgObj.unscaledUrl || imgObj.url;
      imgEl.loading = 'lazy';
      imgEl.title = 'Click to view full preview';

      imgEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (lightboxImg && lightboxModal) {
          lightboxImg.src = imgObj.unscaledUrl || imgObj.url;
          lightboxModal.classList.remove('hidden');
        }
      });

      checkbox.addEventListener('change', (e) => {
        if (checkbox.checked) {
          excludedUrlSet.delete(imgObj.url);
          item.classList.add('selected');
        } else {
          excludedUrlSet.add(imgObj.url);
          item.classList.remove('selected');
        }
      });

      // Clicking anywhere else on container card toggles checkbox
      item.addEventListener('click', (e) => {
        if (e.target !== checkbox && !checkLabel.contains(e.target) && e.target !== imgEl) {
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event('change'));
        }
      });

      item.appendChild(metaRow);
      item.appendChild(imgEl);
      thumbnailGrid.appendChild(item);
    });
  }

  function updateThumbnailsCheckState(checked) {
    const checkboxes = thumbnailGrid.querySelectorAll('.thumb-checkbox');
    const items = thumbnailGrid.querySelectorAll('.thumb-item');
    checkboxes.forEach((cb, idx) => {
      cb.checked = checked;
      if (checked) items[idx].classList.add('selected');
      else items[idx].classList.remove('selected');
    });
  }

  function renderJobState(state) {
    if (!state || state.status === 'idle' || state.status === 'completed' || state.status === 'cancelled') {
      if (state && (state.status === 'completed' || state.status === 'cancelled')) {
        progressStatusTitle.textContent = state.status === 'completed' ? 'Completed' : 'Cancelled';
        progressSubtext.textContent = state.message || '';
        progressBarFill.style.width = '100%';
        progressPercent.textContent = '100%';
        setTimeout(() => {
          progressCard.classList.add('hidden');
        }, 4000);
      } else {
        progressCard.classList.add('hidden');
      }
      return;
    }

    progressCard.classList.remove('hidden');
    
    let title = 'Downloading...';
    if (state.status === 'scanning') title = 'Scanning Chapter...';
    if (state.status === 'navigating') title = 'Opening Next Chapter...';
    if (state.status === 'processing') {
      title = `Chapter ${state.currentChapterNum || state.currentChapterIndex} (${state.currentChapterIndex}/${state.totalChapters})`;
    }

    progressStatusTitle.textContent = title;
    const totalProgress = state.progress || 0;
    progressPercent.textContent = `${totalProgress}%`;
    progressBarFill.style.width = `${totalProgress}%`;
    progressSubtext.textContent = state.subMessage || state.message || 'Processing...';
  }

  function renderQueueState(queue) {
    if (!queueCard || !queueList) return;
    if (!queue || queue.length === 0) {
      queueCard.classList.add('hidden');
      return;
    }

    queueCard.classList.remove('hidden');
    if (queueCountEl) queueCountEl.textContent = queue.length;
    queueList.innerHTML = '';

    queue.forEach(job => {
      const item = document.createElement('div');
      item.className = `queue-item ${job.status}`;

      const titleRow = document.createElement('div');
      titleRow.className = 'queue-item-header';

      const nameLabel = document.createElement('span');
      nameLabel.className = 'queue-item-title';
      nameLabel.textContent = `${job.seriesTitle} (${job.chapterLabel})`;

      const statusBadge = document.createElement('span');
      statusBadge.className = `queue-badge badge-${job.status}`;
      statusBadge.textContent = (job.status || 'QUEUED').toUpperCase();

      titleRow.appendChild(nameLabel);
      titleRow.appendChild(statusBadge);

      const subText = document.createElement('p');
      subText.className = 'queue-item-sub';
      subText.textContent = job.subMessage || job.message || '';

      item.appendChild(titleRow);
      item.appendChild(subText);

      if (job.status === 'queued' || job.status === 'processing') {
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'queue-item-cancel';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => {
          chrome.runtime.sendMessage({ action: 'CANCEL_JOB', jobId: job.id });
        });
        item.appendChild(cancelBtn);
      }

      queueList.appendChild(item);
    });
  }
});
