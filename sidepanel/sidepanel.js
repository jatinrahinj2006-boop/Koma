/**
 * Manga Panel Reviewer - Side Panel Script (v1.6 Real-Time Dynamic Tab Tracker)
 * Automatically auto-scans and updates preview when switching tabs or navigating to new manga pages.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const siteBadge = document.getElementById('sp-site-badge');
  const spSeriesTitleInput = document.getElementById('sp-series-title-input');
  const chapterLabelEl = document.getElementById('sp-chapter-label');
  const panelsCountEl = document.getElementById('sp-panels-count');
  const formatBadgesEl = document.getElementById('sp-format-badges');

  const btnAll = document.getElementById('sp-btn-all');
  const btnNone = document.getElementById('sp-btn-none');
  const panelGrid = document.getElementById('sp-panel-grid');
  const emptyState = document.getElementById('sp-empty-state');

  const formatSelect = document.getElementById('sp-format-select');
  const delaySelect = document.getElementById('sp-delay-select');
  const btnDownloadSelected = document.getElementById('sp-btn-download-selected');
  const selectedCountEl = document.getElementById('sp-selected-count');

  const progressCard = document.getElementById('sp-progress-card');
  const progressTitle = document.getElementById('sp-progress-title');
  const progressPct = document.getElementById('sp-progress-pct');
  const progressFill = document.getElementById('sp-progress-fill');
  const progressSub = document.getElementById('sp-progress-sub');
  const btnCancel = document.getElementById('sp-btn-cancel');

  let activeTabId = null;
  let activeTabUrl = '';
  let detectedPanels = [];
  let excludedSet = new Set();

  // Initial Content Load
  await refreshTabContent();

  // Listen for tab updates (URL change, navigation to another manga/chapter)
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tabId === activeTabId && changeInfo.status === 'complete') {
      console.log('[Sidepanel] Tab updated/navigated. Refreshing content...');
      refreshTabContent();
    }
  });

  // Listen for active tab switches
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    console.log('[Sidepanel] Active tab changed. Refreshing content...');
    activeTabId = activeInfo.tabId;
    await refreshTabContent();
  });

  const spQueueCard = document.getElementById('sp-queue-card');
  const spQueueCountEl = document.getElementById('sp-queue-count');
  const spQueueList = document.getElementById('sp-queue-list');
  const spBtnClearQueue = document.getElementById('sp-btn-clear-queue');

  if (spBtnClearQueue) {
    spBtnClearQueue.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'CLEAR_COMPLETED_JOBS' });
    });
  }

  // Listen for background service worker job events
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

  btnAll.addEventListener('click', () => {
    excludedSet.clear();
    updateAllCheckboxes(true);
    updateSelectedCount();
  });

  btnNone.addEventListener('click', () => {
    detectedPanels.forEach(p => excludedSet.add(p.url));
    updateAllCheckboxes(false);
    updateSelectedCount();
  });

  const spHistoryBadge = document.getElementById('sp-history-badge');
  const spFilterPromosToggle = document.getElementById('sp-filter-promos-toggle');
  const spEnhanceContrastToggle = document.getElementById('sp-enhance-contrast-toggle');

  const spHighResToggle = document.getElementById('sp-high-res-toggle');
  const spAutoSplitToggle = document.getElementById('sp-auto-split-toggle');
  const spParallelToggle = document.getElementById('sp-parallel-toggle');

  // Load and restore saved user preferences
  chrome.storage.local.get('userPreferences', (data) => {
    if (data && data.userPreferences) {
      const prefs = data.userPreferences;
      if (prefs.format && formatSelect) formatSelect.value = prefs.format;
      if (prefs.requestDelay !== undefined && delaySelect) delaySelect.value = prefs.requestDelay;
      if (prefs.highResAutoFix !== undefined && spHighResToggle) spHighResToggle.checked = prefs.highResAutoFix;
      if (prefs.autoSplitWebtoons !== undefined && spAutoSplitToggle) spAutoSplitToggle.checked = prefs.autoSplitWebtoons;
      if (prefs.filterPromos !== undefined && spFilterPromosToggle) spFilterPromosToggle.checked = prefs.filterPromos;
      if (prefs.enhanceContrast !== undefined && spEnhanceContrastToggle) spEnhanceContrastToggle.checked = prefs.enhanceContrast;
      if (prefs.parallelChapters !== undefined && spParallelToggle) spParallelToggle.checked = prefs.parallelChapters;
    }
  });

  function savePreferences() {
    const prefs = {
      format: formatSelect ? formatSelect.value : 'zip',
      requestDelay: delaySelect ? parseInt(delaySelect.value, 10) : 150,
      autoScroll: true,
      highResAutoFix: spHighResToggle ? spHighResToggle.checked : true,
      autoSplitWebtoons: spAutoSplitToggle ? spAutoSplitToggle.checked : true,
      filterPromos: spFilterPromosToggle ? spFilterPromosToggle.checked : true,
      enhanceContrast: spEnhanceContrastToggle ? spEnhanceContrastToggle.checked : false,
      parallelChapters: spParallelToggle ? spParallelToggle.checked : true
    };
    chrome.storage.local.set({ userPreferences: prefs });
  }

  [formatSelect, delaySelect, spHighResToggle, spAutoSplitToggle, spFilterPromosToggle, spEnhanceContrastToggle, spParallelToggle].forEach(el => {
    if (el) el.addEventListener('change', savePreferences);
  });

  const spLightboxModal = document.getElementById('sp-lightbox-modal');
  const spLightboxImg = document.getElementById('sp-lightbox-img');
  const spLightboxClose = document.getElementById('sp-lightbox-close');

  if (spLightboxClose) {
    spLightboxClose.addEventListener('click', () => spLightboxModal.classList.add('hidden'));
    spLightboxModal.addEventListener('click', (e) => {
      if (e.target === spLightboxModal) spLightboxModal.classList.add('hidden');
    });
  }

  btnDownloadSelected.addEventListener('click', () => {
    if (!activeTabId) return;

    const options = {
      customTitle: spSeriesTitleInput.value.trim() || 'Manga_Comic',
      format: formatSelect.value,
      pageUrl: activeTabUrl,
      requestDelay: parseInt(delaySelect.value, 10),
      autoScroll: true,
      highResAutoFix: spHighResToggle ? spHighResToggle.checked : true,
      autoSplitWebtoons: spAutoSplitToggle ? spAutoSplitToggle.checked : true,
      filterPromos: spFilterPromosToggle ? spFilterPromosToggle.checked : true,
      enhanceContrast: spEnhanceContrastToggle ? spEnhanceContrastToggle.checked : false,
      parallelChapters: spParallelToggle ? spParallelToggle.checked : true,
      runInBackground: true,
      excludedUrls: Array.from(excludedSet)
    };

    chrome.runtime.sendMessage({
      action: 'START_SINGLE_CHAPTER',
      tabId: activeTabId,
      options
    });
  });

  btnCancel.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'CANCEL_DOWNLOAD' });
  });

  /**
   * Dynamically auto-scans active tab and re-renders side panel gallery.
   */
  async function refreshTabContent() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    activeTabId = tab.id;
    activeTabUrl = tab.url;
    excludedSet.clear();

    try {
      const hostname = new URL(tab.url).hostname;
      siteBadge.textContent = hostname.replace('www.', '');

      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/content-script.js']
      }).then(() => {
        chrome.tabs.sendMessage(tab.id, { action: 'SCAN_CHAPTER_IMAGES', triggerScroll: false }, (response) => {
          if (chrome.runtime.lastError) return;
          if (response && response.success && response.images) {
            const info = response.pageInfo || {};
            const seriesTitle = info.seriesTitle || tab.title.split('-')[0].trim() || 'Manga_Comic';
            spSeriesTitleInput.value = seriesTitle;

            chapterLabelEl.textContent = info.chapterNumber ? `Chapter ${info.chapterNumber}` : 'Current Chapter';

            // Query Download History for this series
            chrome.runtime.sendMessage({ action: 'GET_DOWNLOAD_HISTORY', seriesTitle }, (histRes) => {
              if (chrome.runtime.lastError) return;
              if (histRes && histRes.success && histRes.historyItem) {
                const lastCh = histRes.historyItem.lastChapter;
                if (spHistoryBadge) {
                  spHistoryBadge.textContent = `Last: Ch ${lastCh}`;
                  spHistoryBadge.classList.remove('hidden');
                }
              }
            });
            
            detectedPanels = response.images;
            panelsCountEl.textContent = `${detectedPanels.length} Panels`;
            renderPanels(detectedPanels);
            renderFormatBadges(detectedPanels);
          } else {
            emptyState.style.display = 'block';
            panelGrid.innerHTML = '';
            panelsCountEl.textContent = '0 Panels';
            chapterLabelEl.textContent = 'No chapter';
          }
        });
      }).catch((e) => {
        console.warn('Scripting not allowed on this tab:', e);
        emptyState.style.display = 'block';
        panelGrid.innerHTML = '';
        panelsCountEl.textContent = '0 Panels';
        chapterLabelEl.textContent = 'No chapter';
      });
    } catch (e) {
      console.warn('Sidepanel tab query error:', e);
      siteBadge.textContent = 'Active Reader';
    }
  }

  // --- PDF Studio Launcher ---
  const spBtnPdfStudio = document.getElementById('sp-btn-pdf-studio');
  if (spBtnPdfStudio) {
    spBtnPdfStudio.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('tools/pdf-maker.html') });
    });
  }

  // --- Live PDF Previewer Modal (Side Panel) ---
  const spBtnPdfPreview = document.getElementById('sp-btn-pdf-preview');
  const spPdfModal = document.getElementById('sp-pdf-modal');
  const spPdfModalClose = document.getElementById('sp-pdf-modal-close');
  const spPdfImg = document.getElementById('sp-pdf-img');
  const spPdfCurrentPage = document.getElementById('sp-pdf-current-page');
  const spPdfTotalPages = document.getElementById('sp-pdf-total-pages');
  const spPdfPrevBtn = document.getElementById('sp-pdf-prev-btn');
  const spPdfNextBtn = document.getElementById('sp-pdf-next-btn');

  let currentSpPdfIdx = 0;

  if (spBtnPdfPreview) {
    spBtnPdfPreview.addEventListener('click', () => {
      const activePanels = detectedPanels.filter(p => !excludedSet.has(p.url));
      if (activePanels.length === 0) {
        alert('No panels selected for PDF preview!');
        return;
      }
      currentSpPdfIdx = 0;
      updateSpPdfPreviewer(activePanels);
      if (spPdfModal) spPdfModal.classList.remove('hidden');
    });
  }

  if (spPdfModalClose) {
    spPdfModalClose.addEventListener('click', () => spPdfModal.classList.add('hidden'));
    if (spPdfModal) {
      spPdfModal.addEventListener('click', (e) => {
        if (e.target === spPdfModal) spPdfModal.classList.add('hidden');
      });
    }
  }

  if (spPdfPrevBtn) {
    spPdfPrevBtn.addEventListener('click', () => {
      const activePanels = detectedPanels.filter(p => !excludedSet.has(p.url));
      if (currentSpPdfIdx > 0) {
        currentSpPdfIdx--;
        updateSpPdfPreviewer(activePanels);
      }
    });
  }

  if (spPdfNextBtn) {
    spPdfNextBtn.addEventListener('click', () => {
      const activePanels = detectedPanels.filter(p => !excludedSet.has(p.url));
      if (currentSpPdfIdx < activePanels.length - 1) {
        currentSpPdfIdx++;
        updateSpPdfPreviewer(activePanels);
      }
    });
  }

  function updateSpPdfPreviewer(activePanels) {
    if (!activePanels || activePanels.length === 0) return;
    if (spPdfCurrentPage) spPdfCurrentPage.textContent = currentSpPdfIdx + 1;
    if (spPdfTotalPages) spPdfTotalPages.textContent = activePanels.length;
    const target = activePanels[currentSpPdfIdx];
    if (!spPdfImg || !target) return;

    // If we already have a cached dataUrl, use it directly
    if (target.dataUrl) {
      spPdfImg.src = target.dataUrl;
      return;
    }

    // Show loading placeholder
    spPdfImg.src = '';
    spPdfImg.alt = 'Loading page...';

    // Always proxy through content script to bypass hotlink protection
    if (activeTabId) {
      chrome.tabs.sendMessage(activeTabId, { action: 'FETCH_IMAGE_DATA', url: target.unscaledUrl || target.url }, (res) => {
        if (chrome.runtime.lastError) {
          spPdfImg.src = target.unscaledUrl || target.url;
          spPdfImg.alt = 'PDF Page Preview';
          return;
        }
        if (res && res.success && res.dataUrl) {
          target.dataUrl = res.dataUrl;
          spPdfImg.src = res.dataUrl;
          spPdfImg.alt = 'PDF Page Preview';
        } else {
          // Last resort: try setting the URL directly (works on some non-protected sites)
          spPdfImg.src = target.unscaledUrl || target.url;
          spPdfImg.alt = 'PDF Page Preview';
        }
      });
    } else {
      spPdfImg.src = target.unscaledUrl || target.url;
    }
  }

  function movePanelPosition(fromIdx, toIdx) {
    if (toIdx < 0 || toIdx >= detectedPanels.length) return;
    const item = detectedPanels.splice(fromIdx, 1)[0];
    detectedPanels.splice(toIdx, 0, item);
    renderPanels(detectedPanels);
  }

  function renderPanels(panels) {
    if (!panels || panels.length === 0) {
      emptyState.style.display = 'block';
      selectedCountEl.textContent = '0';
      return;
    }

    emptyState.style.display = 'none';
    panelGrid.innerHTML = '';

    panels.forEach((p, index) => {
      const card = document.createElement('div');
      card.className = 'panel-card selected';

      const topBar = document.createElement('div');
      topBar.className = 'panel-top-bar';

      const ext = getExtension(p.url);
      const idxTag = document.createElement('span');
      idxTag.className = 'panel-idx-tag';
      idxTag.textContent = `#${index + 1} (${ext.toUpperCase()})`;

      const reorderGroup = document.createElement('div');
      reorderGroup.style.cssText = 'display:flex;gap:3px;align-items:center;';

      const upBtn = document.createElement('button');
      upBtn.className = 'text-btn';
      upBtn.textContent = '◀';
      upBtn.title = 'Move Panel Up';
      upBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        movePanelPosition(index, index - 1);
      });

      const downBtn = document.createElement('button');
      downBtn.className = 'text-btn';
      downBtn.textContent = '▶';
      downBtn.title = 'Move Panel Down';
      downBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        movePanelPosition(index, index + 1);
      });

      reorderGroup.appendChild(upBtn);
      reorderGroup.appendChild(downBtn);

      const checkWrap = document.createElement('label');
      checkWrap.className = 'panel-check-wrap';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'panel-check';
      checkbox.checked = !excludedSet.has(p.url);

      const checkLabelText = document.createTextNode(' Include');
      checkWrap.appendChild(checkbox);
      checkWrap.appendChild(checkLabelText);

      topBar.appendChild(idxTag);
      topBar.appendChild(reorderGroup);
      topBar.appendChild(checkWrap);

      const img = document.createElement('img');
      img.className = 'panel-img';
      img.src = p.dataUrl || p.unscaledUrl || p.url;
      img.loading = 'lazy';
      img.title = 'Click to view full preview';

      // Fallback for hotlink-protected CDN images
      img.onerror = () => {
        if (activeTabId) {
          chrome.tabs.sendMessage(activeTabId, { action: 'FETCH_IMAGE_DATA', url: p.url }, (res) => {
            if (res && res.success && res.dataUrl) {
              p.dataUrl = res.dataUrl;
              img.src = res.dataUrl;
            }
          });
        }
      };

      img.addEventListener('click', (e) => {
        e.stopPropagation();
        if (spLightboxImg && spLightboxModal) {
          spLightboxImg.src = p.dataUrl || p.unscaledUrl || p.url;
          spLightboxModal.classList.remove('hidden');
        }
      });

      checkbox.addEventListener('change', (e) => {
        if (checkbox.checked) {
          excludedSet.delete(p.url);
          card.classList.add('selected');
        } else {
          excludedSet.add(p.url);
          card.classList.remove('selected');
        }
        updateSelectedCount();
      });

      card.addEventListener('click', (e) => {
        if (e.target !== checkbox && !checkWrap.contains(e.target) && e.target !== img) {
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event('change'));
        }
      });

      card.appendChild(topBar);
      card.appendChild(img);
      panelGrid.appendChild(card);
    });

    updateSelectedCount();
  }

  function renderFormatBadges(panels) {
    const counts = {};
    panels.forEach(p => {
      const ext = getExtension(p.url).toUpperCase();
      counts[ext] = (counts[ext] || 0) + 1;
    });

    formatBadgesEl.innerHTML = '';
    Object.keys(counts).forEach(fmt => {
      const badge = document.createElement('span');
      badge.className = 'badge fmt-badge';
      badge.textContent = `${fmt}: ${counts[fmt]}`;
      formatBadgesEl.appendChild(badge);
    });
  }

  function getExtension(url) {
    try {
      const cleanUrl = url.split('?')[0].split('#')[0];
      const ext = cleanUrl.substring(cleanUrl.lastIndexOf('.') + 1).toLowerCase();
      if (['jpg', 'jpeg', 'png', 'webp', 'avif'].includes(ext)) {
        return ext === 'jpeg' ? 'jpg' : ext;
      }
    } catch (e) {}
    return 'jpg';
  }

  function updateAllCheckboxes(checked) {
    const cards = panelGrid.querySelectorAll('.panel-card');
    const checkboxes = panelGrid.querySelectorAll('.panel-check');
    checkboxes.forEach((cb, idx) => {
      cb.checked = checked;
      if (checked) cards[idx].classList.add('selected');
      else cards[idx].classList.remove('selected');
    });
  }

  function updateSelectedCount() {
    const total = detectedPanels.length;
    const selected = total - excludedSet.size;
    selectedCountEl.textContent = selected;
  }

  function renderJobState(state) {
    if (!state || state.status === 'idle' || state.status === 'completed' || state.status === 'cancelled') {
      if (state && (state.status === 'completed' || state.status === 'cancelled')) {
        progressTitle.textContent = state.status === 'completed' ? 'Completed' : 'Cancelled';
        progressSub.textContent = state.message || '';
        progressFill.style.width = '100%';
        progressPct.textContent = `${100}%`;
        setTimeout(() => {
          progressCard.classList.add('hidden');
        }, 4000);
      } else {
        progressCard.classList.add('hidden');
      }
      return;
    }

    progressCard.classList.remove('hidden');
    progressTitle.textContent = state.message || 'Downloading...';
    const pct = state.progress || 0;
    progressPct.textContent = `${pct}%`;
    progressFill.style.width = `${pct}%`;
    progressSub.textContent = state.subMessage || 'Processing panels...';
  }

  function renderQueueState(queue) {
    if (!spQueueCard || !spQueueList) return;
    if (!queue || queue.length === 0) {
      spQueueCard.classList.add('hidden');
      return;
    }

    spQueueCard.classList.remove('hidden');
    if (spQueueCountEl) spQueueCountEl.textContent = queue.length;
    spQueueList.innerHTML = '';

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

      spQueueList.appendChild(item);
    });
  }
});
