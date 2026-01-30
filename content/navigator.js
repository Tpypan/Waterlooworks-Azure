/**
 * WaterlooActuallyWorks Navigator
 * Handles job navigation, shortlisting, and UI enhancements in modals and job lists
 */

(function() {
  'use strict';

  if (!window.location.href.includes('waterlooworks.uwaterloo.ca')) {
    return;
  }

  console.log('[WAW] Navigator loading...');

  // ============================================
  // Global State
  // ============================================
  
  let jobLinks = [];
  let currentJobIndex = -1;
  let shortlistedJobs = new Set();
  let settings = null;
  let modalObserver = null;

  const DEFAULT_SETTINGS = {
    newJobDaysThreshold: 7,
    shortlistFolderName: 'shortlist'
  };

  // ============================================
  // Settings & Storage
  // ============================================

  async function loadSettings() {
    try {
      if (window.AzureStorage) {
        const loaded = await window.AzureStorage.getSettings([
          'newJobDaysThreshold',
          'shortlistFolderName'
        ]);
        settings = {
          newJobDaysThreshold: loaded.newJobDaysThreshold || DEFAULT_SETTINGS.newJobDaysThreshold,
          shortlistFolderName: loaded.shortlistFolderName || DEFAULT_SETTINGS.shortlistFolderName
        };
      } else {
        settings = DEFAULT_SETTINGS;
      }
    } catch (e) {
      settings = DEFAULT_SETTINGS;
    }

    // Load shortlisted jobs from localStorage
    try {
      const saved = localStorage.getItem('waw-shortlisted-jobs');
      if (saved) {
        shortlistedJobs = new Set(JSON.parse(saved).map(String));
        console.log(`[WAW] Loaded ${shortlistedJobs.size} shortlisted jobs`);
      }
    } catch (e) {
      console.error('[WAW] Failed to load shortlist:', e);
    }
  }

  function saveShortlist() {
    try {
      localStorage.setItem('waw-shortlisted-jobs', JSON.stringify(Array.from(shortlistedJobs)));
    } catch (e) {
      console.error('[WAW] Failed to save shortlist:', e);
    }
  }

  // ============================================
  // Job Table Functions
  // ============================================

  function getAllJobLinks() {
    const selectors = [
      'tbody tr a.overflow--ellipsis',
      'tbody[data-v-612a1958] a',
      '.table__row--body a[href="javascript:void(0)"]',
      'table tbody a[onclick]',
      'tr.table__row--body a',
      'tbody a'
    ];

    let links = [];
    for (const selector of selectors) {
      const found = document.querySelectorAll(selector);
      if (found.length > 0) {
        links = found;
        break;
      }
    }

    jobLinks = Array.from(links);
    console.log(`[WAW] Found ${jobLinks.length} job links`);
    return jobLinks;
  }

  function getJobIdFromRow(row) {
    // Method 1: Checkbox value
    const checkbox = row.querySelector('input[type="checkbox"][name="dataViewerSelection"]');
    if (checkbox && checkbox.value) {
      return String(checkbox.value);
    }

    // Method 2: Job ID in first column spans
    const firstTh = row.querySelector('th');
    if (firstTh) {
      const spans = firstTh.querySelectorAll('span');
      for (const span of spans) {
        const text = span.textContent.trim();
        if (/^\d{6}$/.test(text)) {
          return text;
        }
      }
    }

    // Method 3: Regex match for 6-digit number
    const match = row.textContent.match(/\b\d{6}\b/);
    if (match) return match[0];

    return null;
  }

  function enhanceJobTable() {
    getAllJobLinks();
    
    // Clear existing enhancements
    document.querySelectorAll('.waw-row-indicator').forEach(el => el.remove());
    
    jobLinks.forEach((link, index) => {
      const row = link.closest('tr');
      if (!row) return;

      const jobId = getJobIdFromRow(row);
      if (!jobId) return;

      // Add shortlist indicator
      addShortlistIndicator(row, jobId);
      
      // Check if job is new and highlight
      checkAndHighlightNewJob(row);
      
      // Store index on row for navigation
      row.dataset.wawIndex = index;
      row.dataset.wawJobId = jobId;
    });
  }

  function addShortlistIndicator(row, jobId) {
    const titleCell = row.querySelector('td:nth-child(2)') || row.querySelector('td a')?.closest('td');
    if (!titleCell) return;

    // Check if indicator already exists
    if (row.querySelector('.waw-shortlist-indicator')) return;

    const isShortlisted = shortlistedJobs.has(String(jobId));

    const indicator = document.createElement('span');
    indicator.className = 'waw-row-indicator waw-shortlist-indicator';
    indicator.dataset.jobId = jobId;
    indicator.innerHTML = isShortlisted ? '★' : '☆';
    indicator.title = isShortlisted ? 'Remove from shortlist' : 'Add to shortlist';
    indicator.style.cssText = `
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 20px;
      cursor: pointer;
      color: ${isShortlisted ? '#f39c12' : '#999'};
      z-index: 10;
      transition: all 0.2s ease;
    `;

    indicator.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await toggleShortlistJob(jobId, indicator);
    });

    indicator.addEventListener('mouseenter', () => {
      indicator.style.transform = 'translateY(-50%) scale(1.2)';
      indicator.style.color = '#f39c12';
    });

    indicator.addEventListener('mouseleave', () => {
      indicator.style.transform = 'translateY(-50%)';
      indicator.style.color = shortlistedJobs.has(String(jobId)) ? '#f39c12' : '#999';
    });

    // Make cell relative positioned
    titleCell.style.position = 'relative';
    titleCell.style.paddingRight = '40px';
    titleCell.appendChild(indicator);
  }

  function checkAndHighlightNewJob(row) {
    // Look for NEW badge or deadline text
    const hasNewBadge = row.querySelector('.badge-new, span:contains("NEW")');
    const deadlineText = row.textContent.match(/Deadline in (\d+) day/);
    
    if (hasNewBadge || (deadlineText && parseInt(deadlineText[1]) > (settings?.newJobDaysThreshold || 7) - 7)) {
      row.classList.add('waw-new-job');
    }
  }

  // ============================================
  // Shortlist Functions
  // ============================================

  async function toggleShortlistJob(jobId, indicatorElement = null) {
    const jobIdStr = String(jobId);
    const wasShortlisted = shortlistedJobs.has(jobIdStr);

    if (wasShortlisted) {
      shortlistedJobs.delete(jobIdStr);
      showNotification('Removed from shortlist', 'remove');
    } else {
      shortlistedJobs.add(jobIdStr);
      showNotification('Added to shortlist!', 'add');
      
      // Try to add to WaterlooWorks folder
      await addToWaterlooWorksFolder(jobId);
    }

    saveShortlist();
    
    // Update all indicators for this job
    document.querySelectorAll(`.waw-shortlist-indicator[data-job-id="${jobId}"]`).forEach(el => {
      const isNowShortlisted = shortlistedJobs.has(jobIdStr);
      el.innerHTML = isNowShortlisted ? '★' : '☆';
      el.title = isNowShortlisted ? 'Remove from shortlist' : 'Add to shortlist';
      el.style.color = isNowShortlisted ? '#f39c12' : '#999';
    });

    // Update modal indicator if open
    updateModalShortlistIndicator();
  }

  async function addToWaterlooWorksFolder(jobId) {
    // Find the row for this job and click the folder button
    const row = document.querySelector(`tr[data-waw-job-id="${jobId}"]`);
    if (!row) return;

    // Find folder button in the row
    const folderButton = row.querySelector('button i.material-icons');
    if (folderButton && (folderButton.textContent.includes('folder') || folderButton.textContent.includes('create_new_folder'))) {
      // This would trigger WaterlooWorks' folder system
      // For now, we just track locally
      console.log(`[WAW] Would add job ${jobId} to folder`);
    }
  }

  // ============================================
  // Modal Navigation
  // ============================================

  function isModalOpen() {
    return document.querySelector('div[data-v-70e7ded6-s]') !== null;
  }

  function getCurrentModalJobId() {
    const modal = document.querySelector('div[data-v-70e7ded6-s]');
    if (!modal) return null;

    // Try to find job ID in modal header
    const header = modal.querySelector('.dashboard-header--mini');
    if (header) {
      const idSpan = header.querySelector('.tag-label span, span.tag-label');
      if (idSpan) {
        const match = idSpan.textContent.match(/\d{6}/);
        if (match) return match[0];
      }
    }

    // Fallback to current index
    if (currentJobIndex >= 0 && jobLinks[currentJobIndex]) {
      const row = jobLinks[currentJobIndex].closest('tr');
      if (row) return getJobIdFromRow(row);
    }

    return null;
  }

  function addModalNavigationUI() {
    const modal = document.querySelector('div[data-v-70e7ded6-s]');
    if (!modal) return;

    // Remove existing nav UI
    const existing = document.getElementById('waw-modal-nav');
    if (existing) existing.remove();

    const jobId = getCurrentModalJobId();
    const isShortlisted = jobId ? shortlistedJobs.has(String(jobId)) : false;

    const navUI = document.createElement('div');
    navUI.id = 'waw-modal-nav';
    navUI.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      display: flex;
      gap: 8px;
      z-index: 1000001;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    navUI.innerHTML = `
      <button class="waw-nav-btn" id="waw-nav-prev" title="Previous job (←)">
        <span style="font-size: 18px;">←</span>
        <span style="font-size: 11px;">Prev</span>
      </button>
      <button class="waw-nav-btn waw-shortlist-btn" id="waw-nav-shortlist" title="Shortlist (S)" data-job-id="${jobId || ''}">
        <span style="font-size: 20px;">${isShortlisted ? '★' : '☆'}</span>
        <span style="font-size: 11px;">Shortlist</span>
      </button>
      <button class="waw-nav-btn" id="waw-nav-next" title="Next job (→)">
        <span style="font-size: 18px;">→</span>
        <span style="font-size: 11px;">Next</span>
      </button>
      <button class="waw-nav-btn waw-close-btn" id="waw-nav-close" title="Close (Esc)">
        <span style="font-size: 16px;">✕</span>
        <span style="font-size: 11px;">Close</span>
      </button>
    `;

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      .waw-nav-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 10px 16px;
        background: linear-gradient(135deg, #667eea, #764ba2);
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-family: inherit;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        transition: all 0.2s ease;
        min-width: 60px;
      }
      .waw-nav-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(0,0,0,0.4);
      }
      .waw-nav-btn:active {
        transform: translateY(0);
      }
      .waw-shortlist-btn {
        background: linear-gradient(135deg, #f39c12, #e67e22);
      }
      .waw-shortlist-btn.is-shortlisted {
        background: linear-gradient(135deg, #27ae60, #2ecc71);
      }
      .waw-close-btn {
        background: linear-gradient(135deg, #e74c3c, #c0392b);
      }
    `;
    navUI.appendChild(style);

    document.body.appendChild(navUI);

    // Event listeners
    document.getElementById('waw-nav-prev').addEventListener('click', () => navigateJob(-1));
    document.getElementById('waw-nav-next').addEventListener('click', () => navigateJob(1));
    document.getElementById('waw-nav-shortlist').addEventListener('click', () => {
      const jid = getCurrentModalJobId();
      if (jid) toggleShortlistJob(jid);
    });
    document.getElementById('waw-nav-close').addEventListener('click', closeModal);

    // Update shortlist button state
    updateModalShortlistIndicator();
  }

  function updateModalShortlistIndicator() {
    const btn = document.getElementById('waw-nav-shortlist');
    if (!btn) return;

    const jobId = getCurrentModalJobId();
    if (!jobId) return;

    const isShortlisted = shortlistedJobs.has(String(jobId));
    btn.querySelector('span:first-child').textContent = isShortlisted ? '★' : '☆';
    btn.classList.toggle('is-shortlisted', isShortlisted);
  }

  function navigateJob(delta) {
    // Refresh job links if needed
    if (jobLinks.length === 0) {
      getAllJobLinks();
    }

    // Determine current index from modal if not set
    if (currentJobIndex < 0) {
      const modalJobId = getCurrentModalJobId();
      if (modalJobId) {
        for (let i = 0; i < jobLinks.length; i++) {
          const row = jobLinks[i].closest('tr');
          if (row && getJobIdFromRow(row) === modalJobId) {
            currentJobIndex = i;
            break;
          }
        }
      }
    }

    // Calculate new index
    let newIndex = currentJobIndex + delta;

    // Handle wrapping / pagination
    if (newIndex < 0) {
      // Try to go to previous page
      const prevPageBtn = document.querySelector('.pagination .previous:not(.disabled) a, a[aria-label="Previous"]');
      if (prevPageBtn) {
        sessionStorage.setItem('waw-goto-last', 'true');
        prevPageBtn.click();
        return;
      }
      newIndex = 0;
      showNotification('First job on this page', 'info');
    } else if (newIndex >= jobLinks.length) {
      // Try to go to next page
      const nextPageBtn = document.querySelector('.pagination .next:not(.disabled) a, a[aria-label="Next"]');
      if (nextPageBtn) {
        sessionStorage.setItem('waw-goto-first', 'true');
        nextPageBtn.click();
        return;
      }
      newIndex = jobLinks.length - 1;
      showNotification('Last job on this page', 'info');
    }

    currentJobIndex = newIndex;

    // Click the job link to open it
    if (jobLinks[currentJobIndex]) {
      const link = jobLinks[currentJobIndex];
      
      // Close current modal first
      closeModal();
      
      // Wait a bit then click the new job
      setTimeout(() => {
        link.click();
      }, 100);
    }
  }

  function closeModal() {
    // Find and click close button
    const closeBtn = document.querySelector('div[data-v-70e7ded6-s] button[aria-label="Close"], .modal__close, button.close');
    if (closeBtn) {
      closeBtn.click();
    } else {
      // Try pressing Escape
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27 }));
    }
  }

  // ============================================
  // Keyboard Navigation
  // ============================================

  function setupKeyboardNav() {
    document.addEventListener('keydown', (e) => {
      // Don't intercept in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return;
      }

      // Modal navigation
      if (isModalOpen()) {
        switch (e.key) {
          case 'ArrowLeft':
          case 'a':
          case 'A':
            e.preventDefault();
            navigateJob(-1);
            break;
          case 'ArrowRight':
          case 'd':
          case 'D':
            e.preventDefault();
            navigateJob(1);
            break;
          case 'ArrowUp':
          case 'w':
          case 'W':
          case 's':
          case 'S':
            e.preventDefault();
            const jid = getCurrentModalJobId();
            if (jid) toggleShortlistJob(jid);
            break;
          case 'Escape':
            e.preventDefault();
            closeModal();
            break;
        }
        return;
      }

      // Job list navigation
      if (jobLinks.length === 0) return;

      switch (e.key) {
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          selectAndOpenJob(1);
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          selectAndOpenJob(-1);
          break;
      }
    });
  }

  function selectAndOpenJob(delta) {
    if (jobLinks.length === 0) {
      getAllJobLinks();
      if (jobLinks.length === 0) return;
    }

    // Clear previous selection
    document.querySelectorAll('.waw-selected').forEach(el => el.classList.remove('waw-selected'));

    // Calculate new index
    if (currentJobIndex < 0) {
      currentJobIndex = delta > 0 ? 0 : jobLinks.length - 1;
    } else {
      currentJobIndex += delta;
    }

    // Clamp
    if (currentJobIndex < 0) currentJobIndex = 0;
    if (currentJobIndex >= jobLinks.length) currentJobIndex = jobLinks.length - 1;

    // Select and open
    const row = jobLinks[currentJobIndex].closest('tr');
    if (row) {
      row.classList.add('waw-selected');
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      jobLinks[currentJobIndex].click();
    }
  }

  // ============================================
  // Notifications
  // ============================================

  function showNotification(message, type = 'info') {
    const existing = document.getElementById('waw-notification');
    if (existing) existing.remove();

    const colors = {
      add: 'linear-gradient(135deg, #27ae60, #2ecc71)',
      remove: 'linear-gradient(135deg, #e74c3c, #c0392b)',
      info: 'linear-gradient(135deg, #3498db, #2980b9)',
      error: 'linear-gradient(135deg, #e74c3c, #c0392b)'
    };

    const icons = {
      add: '★',
      remove: '☆',
      info: 'ℹ️',
      error: '❌'
    };

    const notification = document.createElement('div');
    notification.id = 'waw-notification';
    notification.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: ${colors[type] || colors.info};
      color: white;
      padding: 16px 28px;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      z-index: 1000002;
      box-shadow: 0 6px 30px rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      gap: 10px;
      animation: wawFadeIn 0.3s ease;
    `;
    notification.innerHTML = `<span style="font-size: 20px;">${icons[type] || icons.info}</span> ${message}`;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transition = 'opacity 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 1500);
  }

  // ============================================
  // Observer Setup
  // ============================================

  function setupModalObserver() {
    if (modalObserver) return;

    modalObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) {
            const modal = node.matches && node.matches('div[data-v-70e7ded6-s]') ? node :
                         node.querySelector && node.querySelector('div[data-v-70e7ded6-s]');
            
            if (modal) {
              console.log('[WAW] Modal opened');
              setTimeout(() => {
                addModalNavigationUI();
              }, 300);
            }
          }
        }

        for (const node of mutation.removedNodes) {
          if (node.nodeType === 1 && node.matches && node.matches('div[data-v-70e7ded6-s]')) {
            console.log('[WAW] Modal closed');
            const navUI = document.getElementById('waw-modal-nav');
            if (navUI) navUI.remove();
          }
        }
      }
    });

    modalObserver.observe(document.body, { childList: true, subtree: true });
  }

  function setupTableObserver() {
    const tableContainer = document.querySelector('tbody[data-v-612a1958]') || 
                          document.querySelector('table tbody');
    
    if (!tableContainer) {
      setTimeout(setupTableObserver, 500);
      return;
    }

    const observer = new MutationObserver(() => {
      // Debounce
      clearTimeout(observer._timeout);
      observer._timeout = setTimeout(() => {
        console.log('[WAW] Table updated, refreshing...');
        enhanceJobTable();
      }, 200);
    });

    observer.observe(tableContainer, { childList: true, subtree: true });
  }

  // ============================================
  // Styles
  // ============================================

  function injectStyles() {
    if (document.getElementById('waw-styles')) return;

    const style = document.createElement('style');
    style.id = 'waw-styles';
    style.textContent = `
      @keyframes wawFadeIn {
        from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
        to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      }

      .waw-selected {
        background-color: rgba(102, 126, 234, 0.15) !important;
        outline: 2px solid #667eea;
      }

      .waw-new-job {
        background-color: rgba(46, 204, 113, 0.1) !important;
      }

      .waw-new-job td:first-child::before {
        content: 'NEW';
        display: inline-block;
        background: #27ae60;
        color: white;
        font-size: 10px;
        font-weight: bold;
        padding: 2px 6px;
        border-radius: 3px;
        margin-right: 8px;
      }

      .waw-shortlisted-row {
        background-color: rgba(243, 156, 18, 0.1) !important;
      }

      /* Make table cells relative for indicators */
      tbody tr td {
        position: relative;
      }
    `;

    document.head.appendChild(style);
  }

  // ============================================
  // Initialize
  // ============================================

  async function initialize() {
    console.log('[WAW] Initializing Navigator...');

    await loadSettings();
    injectStyles();
    setupModalObserver();
    setupKeyboardNav();

    // Setup table features after delay
    setTimeout(() => {
      enhanceJobTable();
      setupTableObserver();

      // Check if we should navigate after page load (pagination)
      if (sessionStorage.getItem('waw-goto-first')) {
        sessionStorage.removeItem('waw-goto-first');
        currentJobIndex = 0;
        if (jobLinks[0]) {
          setTimeout(() => jobLinks[0].click(), 500);
        }
      } else if (sessionStorage.getItem('waw-goto-last')) {
        sessionStorage.removeItem('waw-goto-last');
        currentJobIndex = jobLinks.length - 1;
        if (jobLinks[currentJobIndex]) {
          setTimeout(() => jobLinks[currentJobIndex].click(), 500);
        }
      }
    }, 1500);

    console.log('[WAW] Navigator ready!');
  }

  // Start
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initialize();
  } else {
    document.addEventListener('DOMContentLoaded', initialize);
  }

  // Export
  window.WAWNavigator = {
    navigateJob,
    toggleShortlistJob,
    getCurrentModalJobId,
    isModalOpen,
    shortlistedJobs
  };

})();
