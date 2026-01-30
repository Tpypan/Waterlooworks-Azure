/**
 * Keyboard Navigation for WaterlooWorks Azure
 * Left/Right to navigate jobs, Up/Down for pages (when no selection)
 */

const KeyboardNav = {
  currentIndex: -1,
  rows: [],
  isEnabled: true,
  initialized: false,

  /**
   * Initialize keyboard navigation
   */
  init() {
    if (this.initialized) return;
    this.initialized = true;
    
    console.log('[Azure] Initializing keyboard navigation');
    
    // Find all job posting rows
    this.refreshRows();
    
    // Set up keyboard listener
    document.addEventListener('keydown', (e) => this.handleKeydown(e));
    
    // Re-scan rows when content changes
    if (window.AzureObservers) {
      window.AzureObservers.onContentChange(() => {
        this.refreshRows();
      });
    }
    
    // Also re-scan periodically in case of dynamic updates
    setInterval(() => this.refreshRows(), 2000);

    // Add navigation UI if on posting detail page
    this.addNavigationUI();

    // Show help tooltip
    this.showHelpToast();
  },

  /**
   * Refresh the list of job rows
   */
  refreshRows() {
    const selectors = [
      'table tbody tr[data-id]',
      'table.table tbody tr',
      '#postingsTable tbody tr',
      '.posting-list tbody tr',
      'table tbody tr:not(.azure-no-results)'
    ];

    for (const selector of selectors) {
      const rows = document.querySelectorAll(selector);
      if (rows.length > 0) {
        this.rows = Array.from(rows).filter(row => {
          const cells = row.querySelectorAll('td');
          return cells.length > 0 && !row.classList.contains('header');
        });
        console.log(`[Azure] Found ${this.rows.length} job rows`);
        break;
      }
    }

    if (this.currentIndex >= this.rows.length) {
      this.currentIndex = this.rows.length - 1;
    }
  },

  /**
   * Handle keydown events
   */
  handleKeydown(e) {
    // Don't intercept if user is typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      return;
    }

    const url = window.location.href;
    const isPostingList = url.includes('postings') || url.includes('jobs');
    const isPostingDetail = url.includes('posting.htm') || url.includes('postingId=');

    // Handle posting detail page navigation
    if (isPostingDetail) {
      switch (e.key) {
        case 'ArrowLeft':
        case 'h':
          e.preventDefault();
          this.navigatePosting('prev');
          return;
        case 'ArrowRight':
        case 'l':
          e.preventDefault();
          this.navigatePosting('next');
          return;
        case 's':
        case 'S':
          e.preventDefault();
          this.shortlistCurrentPosting();
          return;
        case 'Escape':
          e.preventDefault();
          this.goBackToList();
          return;
        case '?':
          e.preventDefault();
          this.showHelpToast();
          return;
      }
      return;
    }

    // Handle posting list page
    if (!isPostingList) return;
    if (this.rows.length === 0) {
      this.refreshRows();
      if (this.rows.length === 0) return;
    }

    switch (e.key) {
      // Left/Right or h/l to navigate between jobs
      case 'ArrowRight':
      case 'l':
        e.preventDefault();
        this.moveSelection(1);
        break;
        
      case 'ArrowLeft':
      case 'h':
        e.preventDefault();
        this.moveSelection(-1);
        break;
      
      // Up/Down or j/k for page navigation (only when no job selected)
      case 'ArrowDown':
      case 'j':
        e.preventDefault();
        if (this.currentIndex === -1) {
          this.nextPage();
        } else {
          // If job is selected, move to next job instead
          this.moveSelection(1);
        }
        break;
        
      case 'ArrowUp':
      case 'k':
        e.preventDefault();
        if (this.currentIndex === -1) {
          this.prevPage();
        } else {
          // If job is selected, move to prev job instead
          this.moveSelection(-1);
        }
        break;
        
      case 's':
      case 'S':
        e.preventDefault();
        this.shortlistCurrent();
        break;
        
      case 'Enter':
      case 'o':
        e.preventDefault();
        this.openCurrent(e.shiftKey || e.ctrlKey || e.metaKey);
        break;
        
      case 'O':
        e.preventDefault();
        this.openCurrent(true);
        break;

      case 'a':
      case 'A':
        e.preventDefault();
        this.applyCurrent();
        break;
        
      case 'Escape':
        this.clearSelection();
        break;
        
      case '?':
        e.preventDefault();
        this.showHelpToast();
        break;
    }
  },

  /**
   * Move selection and auto-open the job
   */
  moveSelection(delta) {
    // Remove old selection
    if (this.currentIndex >= 0 && this.rows[this.currentIndex]) {
      this.rows[this.currentIndex].classList.remove('azure-selected');
    }

    // Calculate new index
    if (this.currentIndex === -1) {
      this.currentIndex = delta > 0 ? 0 : this.rows.length - 1;
    } else {
      this.currentIndex += delta;
    }

    // Clamp to valid range
    if (this.currentIndex < 0) this.currentIndex = 0;
    if (this.currentIndex >= this.rows.length) this.currentIndex = this.rows.length - 1;

    // Apply new selection
    const row = this.rows[this.currentIndex];
    if (row) {
      row.classList.add('azure-selected');
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      this.announceSelection(row);
      
      // Auto-open the job posting
      this.openCurrent(false);
    }
  },

  /**
   * Clear selection
   */
  clearSelection() {
    this.rows.forEach(row => row.classList.remove('azure-selected'));
    this.currentIndex = -1;
    this.showToast('Selection cleared. ↑↓ for pages, ←→ to select jobs.');
  },

  /**
   * Get the currently selected row
   */
  getCurrentRow() {
    if (this.currentIndex >= 0 && this.currentIndex < this.rows.length) {
      return this.rows[this.currentIndex];
    }
    return null;
  },

  /**
   * Open the current job posting
   */
  openCurrent(newTab = false) {
    const row = this.getCurrentRow();
    if (!row) {
      this.showToast('Press ← or → to select a job first');
      return;
    }

    const link = row.querySelector('a[href*="posting"]') || 
                 row.querySelector('td a') ||
                 row.querySelector('a');
    
    if (link) {
      if (newTab) {
        window.open(link.href, '_blank');
      } else {
        // Store current position for navigation
        sessionStorage.setItem('azure-job-index', this.currentIndex);
        sessionStorage.setItem('azure-job-count', this.rows.length);
        link.click();
      }
    }
  },

  /**
   * Shortlist the current job
   */
  shortlistCurrent() {
    const row = this.getCurrentRow();
    if (!row) {
      this.showToast('Press ← or → to select a job first');
      return;
    }

    const shortlistBtn = row.querySelector('a[href*="shortlist"]') ||
                         row.querySelector('button[data-action="shortlist"]') ||
                         row.querySelector('.shortlist-btn') ||
                         row.querySelector('a[title*="hortlist"]') ||
                         row.querySelector('a[onclick*="shortlist"]') ||
                         row.querySelector('input[type="checkbox"][name*="shortlist"]');

    if (shortlistBtn) {
      shortlistBtn.click();
      row.classList.add('azure-shortlisted-flash');
      setTimeout(() => row.classList.remove('azure-shortlisted-flash'), 500);
      this.showToast('✓ Shortlisted!');
      setTimeout(() => this.moveSelection(1), 300);
    } else {
      const buttons = row.querySelectorAll('a.btn, button');
      for (const btn of buttons) {
        const text = btn.textContent.toLowerCase();
        if (text.includes('shortlist') || text.includes('star') || text.includes('save')) {
          btn.click();
          row.classList.add('azure-shortlisted-flash');
          setTimeout(() => row.classList.remove('azure-shortlisted-flash'), 500);
          this.showToast('✓ Shortlisted!');
          setTimeout(() => this.moveSelection(1), 300);
          return;
        }
      }
      this.showToast('Shortlist button not found');
    }
  },

  /**
   * Apply to current job
   */
  applyCurrent() {
    const row = this.getCurrentRow();
    if (!row) {
      this.showToast('Press ← or → to select a job first');
      return;
    }

    const applyBtn = row.querySelector('a[href*="apply"]') ||
                     row.querySelector('button[data-action="apply"]') ||
                     row.querySelector('.apply-btn');

    if (applyBtn) {
      applyBtn.click();
    } else {
      this.showToast('Apply button not found');
    }
  },

  /**
   * Go to next page
   */
  nextPage() {
    const nextBtn = document.querySelector('.pagination .next a') ||
                    document.querySelector('.pager .next a') ||
                    document.querySelector('a[rel="next"]') ||
                    document.querySelector('.pagination li:last-child a') ||
                    document.querySelector('a.next');
    
    if (nextBtn && !nextBtn.parentElement?.classList.contains('disabled')) {
      nextBtn.click();
      this.currentIndex = -1;
      this.showToast('Next page ↓');
    } else {
      this.showToast('No more pages');
    }
  },

  /**
   * Go to previous page
   */
  prevPage() {
    const prevBtn = document.querySelector('.pagination .prev a') ||
                    document.querySelector('.pager .prev a') ||
                    document.querySelector('a[rel="prev"]') ||
                    document.querySelector('.pagination li:first-child a') ||
                    document.querySelector('a.prev');
    
    if (prevBtn && !prevBtn.parentElement?.classList.contains('disabled')) {
      prevBtn.click();
      this.currentIndex = -1;
      this.showToast('↑ Previous page');
    } else {
      this.showToast('No previous page');
    }
  },

  /**
   * Navigate to previous/next posting from detail page
   */
  navigatePosting(direction) {
    // Try to find built-in navigation buttons
    const prevBtn = document.querySelector('a[href*="previous"]') ||
                    document.querySelector('.prev-posting') ||
                    document.querySelector('button[onclick*="previous"]');
    const nextBtn = document.querySelector('a[href*="next"]') ||
                    document.querySelector('.next-posting') ||
                    document.querySelector('button[onclick*="next"]');

    if (direction === 'prev' && prevBtn) {
      prevBtn.click();
      this.showToast('← Previous job');
    } else if (direction === 'next' && nextBtn) {
      nextBtn.click();
      this.showToast('Next job →');
    } else {
      // Fallback: go back and navigate
      this.showToast(direction === 'prev' ? '← Previous' : 'Next →');
      history.back();
    }
  },

  /**
   * Shortlist from posting detail page
   */
  shortlistCurrentPosting() {
    const shortlistBtn = document.querySelector('a[href*="shortlist"]') ||
                         document.querySelector('button[onclick*="shortlist"]') ||
                         document.querySelector('.shortlist-btn') ||
                         document.querySelector('a.btn:contains("Shortlist")');
    
    if (shortlistBtn) {
      shortlistBtn.click();
      this.showToast('✓ Shortlisted!');
    } else {
      // Try to find by text
      const buttons = document.querySelectorAll('a.btn, button.btn');
      for (const btn of buttons) {
        if (btn.textContent.toLowerCase().includes('shortlist')) {
          btn.click();
          this.showToast('✓ Shortlisted!');
          return;
        }
      }
      this.showToast('Shortlist button not found');
    }
  },

  /**
   * Go back to job list
   */
  goBackToList() {
    history.back();
  },

  /**
   * Add navigation UI to posting detail page
   */
  addNavigationUI() {
    const url = window.location.href;
    if (!url.includes('posting.htm') && !url.includes('postingId=')) {
      return;
    }

    // Wait for page to load
    setTimeout(() => {
      // Check if UI already exists
      if (document.getElementById('azure-nav-ui')) return;

      const navUI = document.createElement('div');
      navUI.id = 'azure-nav-ui';
      navUI.className = 'azure-nav-ui';
      navUI.innerHTML = `
        <button class="azure-nav-btn azure-nav-prev" title="Previous job (← or H)">
          <span class="azure-nav-arrow">←</span>
          <span class="azure-nav-label">Prev</span>
          <span class="azure-nav-shortcut">H</span>
        </button>
        <button class="azure-nav-btn azure-nav-shortlist" title="Shortlist (S)">
          <span class="azure-nav-icon">★</span>
          <span class="azure-nav-label">Shortlist</span>
          <span class="azure-nav-shortcut">S</span>
        </button>
        <button class="azure-nav-btn azure-nav-next" title="Next job (→ or L)">
          <span class="azure-nav-arrow">→</span>
          <span class="azure-nav-label">Next</span>
          <span class="azure-nav-shortcut">L</span>
        </button>
        <button class="azure-nav-btn azure-nav-back" title="Back to list (Esc)">
          <span class="azure-nav-icon">✕</span>
          <span class="azure-nav-label">Back</span>
          <span class="azure-nav-shortcut">Esc</span>
        </button>
      `;

      document.body.appendChild(navUI);

      // Add event listeners
      navUI.querySelector('.azure-nav-prev').addEventListener('click', () => this.navigatePosting('prev'));
      navUI.querySelector('.azure-nav-next').addEventListener('click', () => this.navigatePosting('next'));
      navUI.querySelector('.azure-nav-shortlist').addEventListener('click', () => this.shortlistCurrentPosting());
      navUI.querySelector('.azure-nav-back').addEventListener('click', () => this.goBackToList());
    }, 500);
  },

  /**
   * Announce selection for screen readers
   */
  announceSelection(row) {
    const titleCell = row.querySelector('a[href*="posting"]') || row.querySelector('td:nth-child(2)');
    const title = titleCell?.textContent?.trim() || `Job ${this.currentIndex + 1}`;
    
    let announcer = document.getElementById('azure-announcer');
    if (!announcer) {
      announcer = document.createElement('div');
      announcer.id = 'azure-announcer';
      announcer.setAttribute('aria-live', 'polite');
      announcer.setAttribute('aria-atomic', 'true');
      announcer.style.cssText = 'position:absolute;left:-9999px;';
      document.body.appendChild(announcer);
    }
    announcer.textContent = `Selected: ${title}`;
  },

  /**
   * Show a toast notification
   */
  showToast(message, duration = 2000) {
    const existing = document.getElementById('azure-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'azure-toast';
    toast.className = 'azure-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('azure-toast-visible');
    });

    setTimeout(() => {
      toast.classList.remove('azure-toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  /**
   * Show help toast
   */
  showHelpToast() {
    const url = window.location.href;
    const isDetail = url.includes('posting.htm') || url.includes('postingId=');
    
    const listHelp = `
      <div class="azure-help-toast">
        <strong>Job List Shortcuts</strong>
        <div class="azure-help-grid">
          <span>← / → or h/l</span><span>Navigate jobs</span>
          <span>↑ / ↓ or j/k</span><span>Prev/Next page*</span>
          <span>Enter or o</span><span>Open job</span>
          <span>s</span><span>Shortlist job</span>
          <span>Esc</span><span>Clear selection</span>
        </div>
        <small>*Page nav only when no job selected</small>
      </div>
    `;

    const detailHelp = `
      <div class="azure-help-toast">
        <strong>Job Detail Shortcuts</strong>
        <div class="azure-help-grid">
          <span>← or h</span><span>Previous job</span>
          <span>→ or l</span><span>Next job</span>
          <span>s</span><span>Shortlist</span>
          <span>Esc</span><span>Back to list</span>
        </div>
      </div>
    `;

    const existing = document.getElementById('azure-help');
    if (existing) existing.remove();

    const help = document.createElement('div');
    help.id = 'azure-help';
    help.className = 'azure-help';
    help.innerHTML = isDetail ? detailHelp : listHelp;
    document.body.appendChild(help);

    requestAnimationFrame(() => {
      help.classList.add('azure-help-visible');
    });

    setTimeout(() => {
      help.classList.remove('azure-help-visible');
      setTimeout(() => help.remove(), 300);
    }, 5000);
  }
};

// Export
if (typeof window !== 'undefined') {
  window.AzureKeyboardNav = KeyboardNav;
}
