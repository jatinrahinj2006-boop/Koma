/**
 * Manhwa & Manga Batch Downloader - Enhanced Content Script (v1.4)
 * Advanced series title extraction from JSON-LD schema, OpenGraph tags, breadcrumbs, and document title.
 */

(function() {
  if (window.__manhwaDownloaderInjected) return;
  window.__manhwaDownloaderInjected = true;

  console.log('[Manhwa Content Script v1.4] Content script initialized.');

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => {
      try {
        if (request.action === 'GET_PAGE_INFO') {
          const info = await extractPageInfo();
          sendResponse({ success: true, data: info });
        } else if (request.action === 'SCAN_CHAPTER_IMAGES') {
          if (request.triggerScroll) {
            await autoScrollToLoadImages();
          }
          const images = extractChapterImages();
          const info = await extractPageInfo();
          sendResponse({ success: true, images, pageInfo: info });
        } else if (request.action === 'RESOLVE_NEXT_CHAPTER') {
          const nextUrl = findNextChapterUrl();
          sendResponse({ success: true, nextUrl });
        } else if (request.action === 'FETCH_IMAGE_DATA') {
          const dataUrl = await fetchImageDataInPage(request.url);
          sendResponse({ success: !!dataUrl, dataUrl });
        } else if (request.action === 'SCAN_SERIES_TOC') {
          const tocData = extractSeriesChapterList();
          sendResponse({ success: true, ...tocData });
        } else {
          sendResponse({ success: false, error: 'Unknown action' });
        }
      } catch (err) {
        console.error('[Manhwa Downloader] Error handling message:', err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  });

  /**
   * Advanced page info & series title extraction.
   */
  async function extractPageInfo() {
    const rawTitle = document.title || '';
    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
    const h1Text = document.querySelector('h1, .entry-title, .chapter-title, .post-title')?.innerText?.trim() || '';

    // 1. Check Breadcrumbs
    let breadcrumbTitle = '';
    const breadcrumbEls = document.querySelectorAll('.breadcrumb a, #breadcrumb a, .breadcrumbs a');
    if (breadcrumbEls.length > 1) {
      breadcrumbTitle = breadcrumbEls[breadcrumbEls.length - 1].innerText.trim();
    }

    // 2. Extract Chapter Number
    let chapterNum = null;
    const fullText = `${rawTitle} ${ogTitle} ${h1Text} ${window.location.pathname}`;
    const chMatch = fullText.match(/chapter[-_\s]*([0-9]+(?:\.[0-9]+)?)/i) ||
                    fullText.match(/ch[-_\s]*([0-9]+(?:\.[0-9]+)?)/i) ||
                    fullText.match(/[-_](\d+)\/?$/);

    if (chMatch) {
      chapterNum = parseFloat(chMatch[1]);
    }

    // 3. Clean Series Title
    let rawSeries = breadcrumbTitle || h1Text || ogTitle || rawTitle;

    // Clean common site suffixes (e.g. "- KingComiX.com", "- Read Manga Online", etc.)
    let cleanSeries = rawSeries
      .replace(/[-_–|]\s*(kingcomix|readmanga|manga|webtoon|comix|scan|free|online|hentai|porn).*/i, '')
      .replace(/chapter\s*[0-9]+.*/i, '')
      .replace(/ch\s*[0-9]+.*/i, '')
      .replace(/[-_–|].*/, '')
      .trim();

    if (!cleanSeries || cleanSeries.length < 2) {
      // Fallback to URL slug
      const slugParts = window.location.pathname.split('/').filter(Boolean);
      if (slugParts.length > 0) {
        cleanSeries = slugParts[slugParts.length - 1]
          .replace(/chapter[-_\s]*\d+.*/i, '')
          .replace(/[-_]/g, ' ')
          .trim();
      }
    }

    if (!cleanSeries) {
      cleanSeries = 'Manga_Comic';
    }

    // Convert to title case / clean characters
    cleanSeries = cleanSeries.replace(/[\\/:*?"<>|]/g, '_').trim();

    // 4. Paywall, Login-Gate & 404 Detection
    let isBlocked = false;
    let blockReason = null;
    const lowerDocTitle = rawTitle.toLowerCase();
    if (lowerDocTitle.includes('404') || lowerDocTitle.includes('not found') || lowerDocTitle.includes('page not found') || lowerDocTitle.includes('error 404')) {
      isBlocked = true;
      blockReason = '404 Page Not Found';
    } else {
      const paywallSelectors = [
        '.paywall', '.locked-chapter', '.chapter-locked', '.vip-lock',
        '.coin-required', '.login-to-read', '.membership-required',
        '#paywall', '.login-wall', '.premium-locked'
      ];
      for (const sel of paywallSelectors) {
        if (document.querySelector(sel)) {
          isBlocked = true;
          blockReason = `Paywall or Login Required (${sel})`;
          break;
        }
      }
    }

    const nextUrl = findNextChapterUrl();

    return {
      url: window.location.href,
      documentTitle: rawTitle,
      seriesTitle: cleanSeries,
      chapterNumber: chapterNum,
      nextUrl: nextUrl,
      isBlocked,
      blockReason
    };
  }

  function extractChapterImages() {
    const imageUrls = [];
    const seenUrls = new Set();
    const hostname = window.location.hostname;

    if (hostname.includes('webtoons.com')) {
      const webtoonImgs = document.querySelectorAll('#_imageList img');
      webtoonImgs.forEach((img, idx) => {
        const url = img.getAttribute('data-url') || img.src;
        if (url && !seenUrls.has(url)) {
          seenUrls.add(url);
          imageUrls.push({ url, index: idx + 1, width: img.naturalWidth, height: img.naturalHeight });
        }
      });
      if (imageUrls.length > 0) return imageUrls;
    }

    const readerSelectors = [
      '#readerarea',
      '.reading-content',
      '#reader',
      '.reader-area',
      '.chapter-content',
      '.chapter-images',
      '.comic-view',
      '.entry-content',
      '#image-container',
      '#chapter-container',
      '.canvas-container',
      '.view-story',
      '.vspagread',
      'article',
      'main'
    ];

    let container = null;
    let maxImagesInContainer = 0;
    for (const sel of readerSelectors) {
      const candidates = document.querySelectorAll(sel);
      for (const el of candidates) {
        const count = el.querySelectorAll('img, canvas, picture img, [data-src], [data-lazy-src]').length;
        if (count > maxImagesInContainer) {
          maxImagesInContainer = count;
          container = el;
        }
      }
    }

    // If best container has fewer than 3 images, scan document.body to avoid missing pages
    const scope = (container && maxImagesInContainer >= 3) ? container : document.body;
    const imgElements = Array.from(scope.querySelectorAll('img, canvas, picture img'));

    imgElements.forEach((img) => {
      let srcCandidate = 
        img.getAttribute('data-src') ||
        img.getAttribute('data-lazy-src') ||
        img.getAttribute('data-original') ||
        img.getAttribute('data-url') ||
        img.getAttribute('data-full-url') ||
        img.currentSrc ||
        img.src;

      // HTML5 Canvas support (e.g. dynamic canvas-based manga readers)
      if (!srcCandidate && img.tagName === 'CANVAS') {
        try {
          if (img.width > 200 && img.height > 200) {
            srcCandidate = img.toDataURL('image/jpeg', 0.92);
          }
        } catch (e) {}
      }

      if (!srcCandidate) return;

      if (srcCandidate.startsWith('data:image/svg') || srcCandidate.startsWith('data:image/gif')) {
        return;
      }

      try {
        const fullUrl = new URL(srcCandidate, window.location.href).href;
        const lowerUrl = fullUrl.toLowerCase();

        if (
          lowerUrl.includes('logo') ||
          lowerUrl.includes('avatar') ||
          lowerUrl.includes('banner') ||
          lowerUrl.includes('icon') ||
          lowerUrl.includes('discord') ||
          lowerUrl.includes('facebook') ||
          lowerUrl.includes('donate') ||
          lowerUrl.includes('paypal') ||
          lowerUrl.includes('patreon') ||
          lowerUrl.includes('credit') ||
          lowerUrl.includes('promo') ||
          lowerUrl.includes('scanlation') ||
          lowerUrl.includes('end_card') ||
          lowerUrl.includes('watermark') ||
          lowerUrl.includes('ko-fi') ||
          lowerUrl.includes('telegram')
        ) {
          return;
        }

        // Only filter out tiny icons/avatars if natural dimensions are already decoded
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          if (img.naturalWidth < 80 || img.naturalHeight < 50) {
            return;
          }
        }

        if (!seenUrls.has(fullUrl)) {
          seenUrls.add(fullUrl);
          const unscaledCandidate = getUnscaledUrl(fullUrl);
          imageUrls.push({
            url: fullUrl,
            unscaledUrl: unscaledCandidate,
            index: imageUrls.length + 1,
            width: img.naturalWidth || 800,
            height: img.naturalHeight || 1200,
            alt: img.alt || `page_${imageUrls.length + 1}`
          });
        }
      } catch (e) {}
    });

    if (imageUrls.length < 3 && container) {
      // Fallback: search whole document if reader container yielded too few images
      const fallbackImgs = Array.from(document.body.querySelectorAll('img, picture img, [data-src], [data-lazy-src], [data-original]'));
      fallbackImgs.forEach((img) => {
        const srcCandidate = img.getAttribute('data-src') ||
                             img.getAttribute('data-lazy-src') ||
                             img.getAttribute('data-original') ||
                             img.getAttribute('data-url') ||
                             img.src;
        if (!srcCandidate || srcCandidate.startsWith('data:image/svg')) return;
        try {
          const fullUrl = new URL(srcCandidate, window.location.href).href;
          const lower = fullUrl.toLowerCase();
          if (lower.includes('logo') || lower.includes('avatar') || lower.includes('banner') || lower.includes('discord')) return;
          if (!seenUrls.has(fullUrl)) {
            seenUrls.add(fullUrl);
            imageUrls.push({
              url: fullUrl,
              unscaledUrl: getUnscaledUrl(fullUrl),
              index: imageUrls.length + 1,
              width: img.naturalWidth || 800,
              height: img.naturalHeight || 1200,
              alt: `page_${imageUrls.length + 1}`
            });
          }
        } catch (e) {}
      });
    }

    console.log(`[Manhwa Downloader] Extracted ${imageUrls.length} chapter images.`);
    if (imageUrls.length > 0) {
      extractPageInfo().then(pageInfo => {
        injectFloatingDownloadWidget(pageInfo);
      });
    }
    return imageUrls;
  }

  function injectFloatingDownloadWidget(pageInfo) {
    if (document.getElementById('mmd-floating-widget-host')) return;

    const host = document.createElement('div');
    host.id = 'mmd-floating-widget-host';
    host.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      margin: 0;
      padding: 0;
      border: none;
      background: transparent;
    `;

    const shadowRoot = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
      .floating-widget {
        display: flex;
        align-items: center;
        gap: 10px;
        background: linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.14);
        color: #f8fafc;
        padding: 10px 18px;
        border-radius: 30px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 13px;
        font-weight: 600;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
        cursor: pointer;
        transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease, border-color 0.2s ease;
        user-select: none;
        box-sizing: border-box;
        animation: slideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      .floating-widget:hover {
        transform: translateY(-2px) scale(1.02);
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.6);
        border-color: rgba(225, 29, 72, 0.5);
      }
      .floating-widget:active {
        transform: translateY(0) scale(1);
      }
      .widget-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
      }
      .close-btn {
        opacity: 0.5;
        font-weight: normal;
        cursor: pointer;
        font-size: 18px;
        padding: 0 4px;
        line-height: 1;
        margin-left: 6px;
        transition: opacity 0.2s ease, color 0.2s ease;
      }
      .close-btn:hover {
        opacity: 1;
        color: #ef4444;
      }
      @keyframes slideIn {
        from { transform: translateY(40px) scale(0.92); opacity: 0; }
        to { transform: translateY(0) scale(1); opacity: 1; }
      }
    `;

    const widget = document.createElement('div');
    widget.className = 'floating-widget';

    const chLabel = pageInfo.chapterNumber ? `Ch. ${pageInfo.chapterNumber}` : 'Chapter';
    widget.innerHTML = `
      <span class="widget-icon">⚡</span>
      <span class="widget-text">Quick Download ${chLabel}</span>
      <span class="close-btn" id="mmd-widget-close">&times;</span>
    `;

    const closeBtn = widget.querySelector('#mmd-widget-close');
    const textSpan = widget.querySelector('.widget-text');

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      host.remove();
    });

    widget.addEventListener('click', (e) => {
      if (e.target === closeBtn) return;
      
      chrome.runtime.sendMessage({
        action: 'START_SINGLE_CHAPTER',
        tabId: null,
        options: {
          customTitle: pageInfo.seriesTitle || 'Manhwa',
          format: 'zip',
          requestDelay: 150,
          autoScroll: true,
          highResAutoFix: true,
          autoSplitWebtoons: true,
          filterPromos: true
        }
      });

      textSpan.textContent = '⏳ Downloading...';
      setTimeout(() => {
        textSpan.textContent = '✅ Queued!';
        setTimeout(() => {
          textSpan.textContent = `Quick Download ${chLabel}`;
        }, 3000);
      }, 1000);
    });

    shadowRoot.appendChild(style);
    shadowRoot.appendChild(widget);
    document.body.appendChild(host);
  }

  function getUnscaledUrl(url) {
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname;
      const cleanedPath = pathname.replace(/-(?:\d+x\d+|scaled|medium|thumb|small)(?=\.[a-z0-9]+$)/i, '');
      if (cleanedPath !== pathname) {
        parsed.pathname = cleanedPath;
        return parsed.href;
      }
    } catch (e) {}
    return null;
  }

  function forceEagerLoadImages() {
    try {
      const candidates = document.querySelectorAll('img, picture source, [data-src], [data-lazy-src], [data-original]');
      for (const el of candidates) {
        const realSrc = el.getAttribute('data-src') ||
                        el.getAttribute('data-lazy-src') ||
                        el.getAttribute('data-original') ||
                        el.getAttribute('data-url') ||
                        el.getAttribute('data-full-url');
        if (realSrc) {
          if (el.tagName === 'IMG' && (!el.src || el.src.startsWith('data:image/svg') || el.src.startsWith('data:image/gif'))) {
            el.src = realSrc;
          }
          if (el.tagName === 'SOURCE' && !el.srcset) {
            el.srcset = realSrc;
          }
        }
        if (el.getAttribute('loading') === 'lazy') {
          el.setAttribute('loading', 'eager');
        }
      }
      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('resize'));
    } catch (e) {
      console.warn('[Content Script] forceEagerLoad error:', e);
    }
  }

  async function autoScrollToLoadImages() {
    const rawTitle = (document.title || '').toLowerCase();
    if (rawTitle.includes('404') || rawTitle.includes('not found') || document.querySelector('.paywall, .locked-chapter, .chapter-locked')) {
      return; // Skip auto-scrolling on blocked / error pages
    }

    forceEagerLoadImages();

    return new Promise((resolve) => {
      const totalHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 2000);
      const isHidden = document.hidden || (typeof document.visibilityState !== 'undefined' && document.visibilityState === 'hidden');

      // If tab is running in background or minimized, browsers throttle timers to 1000ms.
      // Use fast 4-step chunk jumps and a strict 2-second timeout ceiling.
      if (isHidden) {
        let stepIdx = 0;
        const totalSteps = 4;
        const fastTimer = setInterval(() => {
          stepIdx++;
          const targetY = Math.floor((stepIdx / totalSteps) * totalHeight);
          window.scrollTo(0, targetY);
          forceEagerLoadImages();

          if (stepIdx >= totalSteps) {
            clearInterval(fastTimer);
            window.scrollTo(0, 0);
            setTimeout(resolve, 300);
          }
        }, 120);

        // Safety timeout: never hang in background tab
        setTimeout(() => {
          clearInterval(fastTimer);
          window.scrollTo(0, 0);
          resolve();
        }, 1800);
        return;
      }

      // Foreground normal fast scroll with 3.5s hard ceiling
      let currentPosition = 0;
      const step = Math.max(500, Math.floor(window.innerHeight * 0.85));

      const timer = setInterval(() => {
        currentPosition += step;
        window.scrollTo(0, currentPosition);

        if (currentPosition >= totalHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          setTimeout(resolve, 400);
        }
      }, 60);

      setTimeout(() => {
        clearInterval(timer);
        window.scrollTo(0, 0);
        resolve();
      }, 3500);
    });
  }

  function findNextChapterUrl() {
    const nextCandidates = Array.from(document.querySelectorAll('a, button, select option'));
    for (const el of nextCandidates) {
      const text = (el.innerText || el.textContent || '').toLowerCase().trim();
      const rel = (el.getAttribute && el.getAttribute('rel')) || '';
      const href = el.href || el.value;

      if (!href || href.startsWith('javascript:') || href === '#') continue;

      if (
        rel === 'next' ||
        text.includes('next chapter') ||
        text.includes('next ch') ||
        text.includes('next episode') ||
        text.includes('next ep') ||
        text === 'next' ||
        text === 'next >' ||
        text === '»' ||
        el.classList.contains('next_page') ||
        el.classList.contains('ch-next') ||
        el.classList.contains('pg_next') ||
        el.classList.contains('next') ||
        (el.className && el.className.toString().toLowerCase().includes('btn-next'))
      ) {
        try {
          return new URL(href, window.location.href).href;
        } catch (e) {}
      }
    }

    // Fallback: Programmatic URL incrementing
    const currentUrl = window.location.href;
    try {
      const parsed = new URL(currentUrl);

      // 1. Try common query parameters representing chapter/episode number
      const queryKeys = ['episode_no', 'chapter_no', 'episode', 'chapter', 'ch', 'ep', 'viewer_ch', 'c'];
      for (const key of queryKeys) {
        if (parsed.searchParams.has(key)) {
          const val = parseInt(parsed.searchParams.get(key), 10);
          if (!isNaN(val)) {
            parsed.searchParams.set(key, val + 1);
            return parsed.toString();
          }
        }
      }

      // 2. Try prefix-based numeric matching in path
      const prefixRegex = /(ch(?:apter)?|ep(?:isode)?|vol(?:ume)?|c)[-_\s]*(\d+)/i;
      const prefixMatch = parsed.pathname.match(prefixRegex);
      if (prefixMatch) {
        const prefix = prefixMatch[1];
        const oldNumStr = prefixMatch[2];
        const nextVal = parseInt(oldNumStr, 10) + 1;
        const paddedNum = String(nextVal).padStart(oldNumStr.length, '0');
        
        // Replace only the specific chapter match part to preserve prologue/etc.
        parsed.pathname = parsed.pathname.replace(prefixRegex, `${prefix}-${paddedNum}`);
        return parsed.toString();
      }

      // 3. Try standalone numeric segment in pathname (take the last one)
      const segments = parsed.pathname.split('/');
      for (let i = segments.length - 1; i >= 0; i--) {
        if (segments[i] && /^\d+$/.test(segments[i])) {
          const val = parseInt(segments[i], 10);
          segments[i] = String(val + 1);
          parsed.pathname = segments.join('/');
          return parsed.toString();
        }
      }
    } catch (e) {
      console.error('[Content Script] Fallback URL generator error:', e);
    }

    return null;
  }

  async function fetchImageDataInPage(url) {
    // Strategy 1: Fetch with Referer matching the page (most CDNs require this)
    const fetchAttempts = [
      { referrer: window.location.href, credentials: 'omit' },
      { referrer: window.location.origin + '/', credentials: 'omit' },
      { credentials: 'include' },
      {}
    ];

    for (const opts of fetchAttempts) {
      try {
        const resp = await fetch(url, opts);
        if (resp.ok) {
          const blob = await resp.blob();
          if (blob && blob.size > 100) {
            const dataUrl = await blobToDataUrl(blob);
            if (dataUrl && dataUrl.length > 200) return dataUrl;
          }
        }
      } catch (e) {}
    }

    // Strategy 2: Find already-loaded <img> with matching src and draw to canvas
    try {
      const imgEls = Array.from(document.querySelectorAll('img'));
      const targetImg = imgEls.find(img => {
        const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
        return src && (src === url || decodeURIComponent(src) === decodeURIComponent(url));
      });

      if (targetImg && targetImg.complete && targetImg.naturalWidth > 0) {
        const canvas = document.createElement('canvas');
        canvas.width = targetImg.naturalWidth;
        canvas.height = targetImg.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(targetImg, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        if (dataUrl && dataUrl.length > 200) {
          return dataUrl;
        }
        // Try PNG if JPEG fails
        const pngUrl = canvas.toDataURL('image/png');
        if (pngUrl && pngUrl.length > 500) return pngUrl;
      }
    } catch (e) {}

    return null;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  }

  function extractSeriesChapterList() {
    const chapters = [];
    const seenUrls = new Set();

    const links = Array.from(document.querySelectorAll(`
      .wp-manga-chapter a,
      .chapter-list a,
      .cl-item a,
      li.wp-manga-chapter a,
      .chapter-link,
      ul.main li a,
      .listing-chapters_wrap a,
      .chapters-list a,
      a[href*="/chapter"]
    `));

    links.forEach(a => {
      const href = a.href;
      if (!href || seenUrls.has(href)) return;
      
      const text = a.innerText ? a.innerText.trim() : '';
      const match = text.match(/(?:ch(?:apter)?\.?|ep(?:isode)?\.?)\s*(\d+(?:\.\d+)?)/i) || href.match(/chapter[-_\s]*(\d+(?:\.\d+)?)/i);
      
      if (match || text.toLowerCase().includes('chapter')) {
        seenUrls.add(href);
        const chNum = match ? parseFloat(match[1]) : (chapters.length + 1);
        chapters.push({
          url: href,
          number: chNum,
          title: text || `Chapter ${chNum}`
        });
      }
    });

    chapters.sort((a, b) => a.number - b.number);

    return {
      seriesTitle: document.title.split('-')[0].split('|')[0].trim(),
      chapters
    };
  }
})();
