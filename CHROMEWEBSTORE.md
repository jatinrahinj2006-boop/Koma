# Chrome Web Store Metadata & Publishing Guide

**Extension Name**: Koma — Manga & Manhwa Downloader  
**Short Description**: Batch download manhwa & manga chapters with 1-click into organized ZIP archives or subfolders.  
**Category**: Productivity / Media  
**Manifest Version**: V3  
**Last Updated**: 2026-11-24  

---

## Detailed Store Description

**Koma** makes saving your favorite webtoons, manhwa, and manga fast, organized, and effortless.

Reading 100+ chapters of manhwa online? Instead of manually right-clicking and saving thousands of individual image files page-by-page, this extension lets you download single chapters or full chapter ranges (e.g. Chapter 1 to 50) with one click!

### Key Features:
- ⚡ **1-Click Chapter Download**: Scans current open reader page, triggers lazy-loaded image assets, and downloads all pages in order.
- 📚 **Batch Chapter Ranges**: Download multiple chapters (e.g., Chapters 1–50) with automated background URL pattern & Next-Chapter navigation.
- 📦 **Clean ZIP Packaging**: Automatically bundles every chapter into a clean `.zip` archive (`Solo_Leveling_Ch_001.zip`), keeping your downloads folder clutter-free.
- 📁 **Organized Directories**: Choose between ZIP files or structured subfolders (`/ManhwaName/Chapter_01/001.jpg`).
- 👁️ **Smart Lazy-Load Trigger**: Auto-scrolls long vertical manhwa strips to force high-resolution image rendering before downloading.
- 🎨 **Modern Glassmorphism UI**: High-tech dark mode popup with real-time download progress bars.

---

## Permissions Justification

| Permission | Purpose / Justification |
| :--- | :--- |
| `downloads` | Required to initiate browser file downloads for generated chapter ZIP archives and image assets. |
| `storage` | Required to persist user download settings (ZIP vs Folder format, auto-scroll toggle) and job states. |
| `tabs` | Required to query current active tab URL and page title to auto-detect manhwa series name and chapter numbers. |
| `activeTab` | Grants temporary script injection access to read image elements on the active comic reader tab. |
| `scripting` | Required to inject `content-script.js` for DOM scanning and lazy-load scrolling on demand. |
| `<all_urls>` (Host Permission) | Required to fetch cross-origin comic image assets directly from reader CDNs without CORS or hotlink image blocks. |

---

## Single Purpose & Privacy Statement

### Single Purpose Description
The sole purpose of this extension is to detect comic/manhwa/manga image assets on web reader pages and batch download them for offline reading into organized ZIP archives.

### Data Use Disclosures
- **Does the extension collect personal data?** No.
- **Does it track user browsing activity?** No.
- **Does it send data to remote servers?** No. All processing occurs locally inside the browser extension context.
- **Is third-party analytics included?** No.

---

## Version History

- **v1.3.4** (2026-11-22):
  - 🌐 **Critical Fix — Other Tabs Losing Internet / Disconnecting**: Fixed an unscoped `declarativeNetRequest` header rule that was modifying `Referer` and `Origin` on all browser network traffic globally, which caused YouTube, Discord, Google, and other websites to reject API requests (CORS/CSRF failures). The rule is now strictly isolated to `initiatorDomains: [chrome.runtime.id]` and automatically uninstalled when downloads finish.
  - ⚡ **TCP Socket Flooding & Bandwidth Pacing**: Added balanced per-tab concurrency (3 image streams per parallel tab) and polite micro-pacing delays in image fetch loops to prevent saturating home router connection tables and DNS buffers.
- **v1.3.3** (2026-11-22):
  - 🐛 **Fix — Parallel engine was opening only 2 tabs instead of 5**: The old code had `maxPoolSize = (requestDelay >= 1000) ? 2 : 5`, which throttled the tab pool to 2 when request delay was set to 1000ms or 2000ms. The request delay is applied per image fetch *inside* each tab — it has nothing to do with how many tabs can run in parallel. Pool is now always `min(5, totalChapters)` when parallel mode is on.
- **v1.3.2** (2026-11-22):
  - 🛡️ **Critical Fix — `Missing required property 'tabId'` crash**: Completely removed the dangerous active-tab fallback inside `ensureContentScriptInjected`. The function now immediately bails if `tabId` is not a valid positive integer — it will never accidentally inject into the user's reading tab again.
  - 🎯 **Fix — Batch downloads now start from the ENTERED chapter, not the current page**: `handleBatchRangeDownload` now builds the initial worker-tab URL using `options.pageUrl` + `startCh` via `constructNextUrl`, so entering Chapter 171 opens background tabs at Chapter 171 regardless of which chapter the user has open.
  - 🔧 **Fix — URL chapter slug last-match**: `constructNextUrl` now uses the **last** regex match in the pathname, so series slugs like `/c-99999/chapter-1` correctly replace only the chapter segment, not the series ID.
  - ✅ **Fix — Worker tab validation**: `chrome.tabs.create` results are now validated (`Number.isInteger(bgTab.id) && bgTab.id > 0`) before being pushed to the worker pool; a guard throws a clear error if zero valid tabs could be created.
- **v1.3.1** (2026-11-22):
  - 🚀 Independent Worker Tabs: Guaranteed that batch downloads run strictly inside dedicated background worker tabs (never navigating, scrolling, or touching the user's active reading tab).
  - 🎯 Strict URL Pattern Prefix Matching: Upgraded chapter URL generator with boundary-aware matching to cleanly replace chapter numbers across all manga reader URL formats.
  - 🛡️ Auto-Adjust Chapter Range: Changing the starting chapter automatically updates the end chapter range so valid ranges are always preserved.
  - 🧹 Stale Queue Auto-Purge: Cleaned up orphaned worker tabs and stale interrupted queue jobs on startup.
- **v1.3.0** (2026-11-22):
  - ⚡ 5x Parallel Engine Toggle: Added dedicated UI checkboxes for the 5-tab concurrent engine in both Popup (Batch Range tab & Settings panel) and Side Panel Reviewer.
  - 🎯 Dedicated Chapter Tab Navigation: When starting a batch download (e.g. from Chapter 171), the engine opens a dedicated tab navigated to the requested chapter before scanning.
  - 🛡️ Navigation State Verification: Upgraded `waitForTabToLoad` with expected URL verification to prevent premature image scanning of previous pages.
  - 🔍 Smart Series TOC Auto-Resolution: Batch downloader automatically queries series chapter links when initiated from overview or TOC pages.
- **v1.2.9** (2026-11-21):
  - 🛡️ TabId Safety & Injection Guard: Added automatic active-tab resolution and fallback guards so script injection never fails with missing `tabId`.
  - 🛑 Graceful Queue Cancellation: Cleaned up queue cancellation logging so user-cancelled downloads don't trigger false error alarms.
- **v1.2.8** (2026-11-21):
  - ⚡ 5-Tab Concurrent Worker Pool: Up to 5 background tabs process chapters in parallel for a 4x–5x speedup.
  - 🎯 Direct Start Chapter Resolution: Fixed chapter detection bug so batch downloads immediately start on the requested chapter.
  - 🛠️ PDF Studio UI Fixes: Connected all upload buttons in the left sidebar with synchronous native picker integration.
  - 📊 Enhanced History: Added source domain and functional "Resume Reading" buttons to history cards.
- **v1.0.0** (2026-07-31): Initial release with 1-click single chapter download, multi-chapter range downloader, JSZip bundling, auto-scroll lazy loader, and glassmorphism UI.
