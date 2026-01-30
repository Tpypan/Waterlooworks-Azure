/**
 * Main Injection Script for WaterlooWorks Azure
 * Entry point for content script functionality
 */

const Azure = {
  version: '4.0.0',
  initialized: false,
  settings: null,

  /**
   * Main initialization
   */
  async init() {
    if (this.initialized) return;
    
    console.log(`[Azure] WaterlooWorks Azure v${this.version} initializing...`);

    try {
      // Load settings
      this.settings = await window.AzureStorage.getSettings();
      
      // Check if extension is globally enabled
      if (!this.settings.featuresEnabled) {
        console.log('[Azure] Extension disabled by user');
        return;
      }

      // Initialize feature flags
      await window.AzureFeatureFlags.init();

      // Initialize observers
      window.AzureObservers.init();

      // Apply initial state
      this.applyTheme();
      
      // Set up route change handler
      window.AzureObservers.onRouteChange((newUrl, oldUrl) => {
        this.onRouteChange(newUrl, oldUrl);
      });

      // Set up DOM ready handler
      window.AzureObservers.onReady(() => {
        this.onDOMReady();
      });

      // Also init when fully loaded for keyboard nav
      window.addEventListener('load', () => {
        this.initKeyboardNav();
      });

      // Listen for settings changes
      window.AzureStorage.onSettingsChanged((changes, area) => {
        this.onSettingsChanged(changes);
      });

      this.initialized = true;
      console.log('[Azure] Initialization complete');

    } catch (error) {
      console.error('[Azure] Initialization failed:', error);
    }
  },

  /**
   * Apply theme based on settings
   */
  applyTheme() {
    window.AzureFeatureFlags.withFeature('themes', () => {
      const themeId = this.settings.themeId || 'azure-light';
      const darkMode = this.shouldUseDarkMode();
      
      // Add theme class to body
      document.documentElement.classList.add('azure-themed');
      document.documentElement.setAttribute('data-azure-theme', themeId);
      
      if (darkMode) {
        document.documentElement.classList.add('azure-dark');
      } else {
        document.documentElement.classList.remove('azure-dark');
      }

      // Inject theme stylesheet
      const themeUrl = chrome.runtime.getURL(`ui/themes/${themeId}.css`);
      window.AzureDOMHooks.injectStylesheet(themeUrl, 'azure-theme-css');

      // Inject layout stylesheet
      const layoutUrl = chrome.runtime.getURL('ui/layout/layout.css');
      window.AzureDOMHooks.injectStylesheet(layoutUrl, 'azure-layout-css');

      console.log(`[Azure] Theme applied: ${themeId}, dark mode: ${darkMode}`);
    });
  },

  /**
   * Determine if dark mode should be used
   * @returns {boolean}
   */
  shouldUseDarkMode() {
    if (!this.settings.autoDarkMode) {
      return this.settings.darkMode;
    }

    // Auto dark mode based on time
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    const [startHour, startMin] = this.settings.darkModeStart.split(':').map(Number);
    const [endHour, endMin] = this.settings.darkModeEnd.split(':').map(Number);
    
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    if (startMinutes < endMinutes) {
      // Normal range (e.g., 22:00 to 07:00 doesn't apply here)
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      // Overnight range (e.g., 22:00 to 07:00)
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
  },

  /**
   * Handle DOM ready event
   */
  onDOMReady() {
    console.log('[Azure] DOM ready, applying enhancements');
    
    const pageType = window.AzureSelectors.getCurrentPageType();
    console.log(`[Azure] Page type: ${pageType}`);

    // Add body class for styling
    window.AzureDOMHooks.addBodyClass('azure-enhanced');
    window.AzureDOMHooks.addBodyClass(`azure-page-${pageType}`);

    // Apply page-specific enhancements
    this.applyPageEnhancements(pageType);
  },

  /**
   * Handle route changes (SPA navigation)
   * @param {string} newUrl - New URL
   * @param {string} oldUrl - Previous URL
   */
  onRouteChange(newUrl, oldUrl) {
    console.log('[Azure] Route changed, reapplying enhancements');
    
    // Clean up old page classes
    document.body?.classList.forEach(cls => {
      if (cls.startsWith('azure-page-')) {
        document.body.classList.remove(cls);
      }
    });

    // Reapply theme and enhancements
    this.applyTheme();
    
    const pageType = window.AzureSelectors.getCurrentPageType();
    window.AzureDOMHooks.addBodyClass(`azure-page-${pageType}`);
    
    // Small delay to let DOM update
    setTimeout(() => {
      this.applyPageEnhancements(pageType);
    }, 100);
  },

  /**
   * Handle settings changes
   * @param {object} changes - Changed settings
   */
  onSettingsChanged(changes) {
    console.log('[Azure] Settings changed:', Object.keys(changes));
    
    // Update local settings
    for (const [key, { newValue }] of Object.entries(changes)) {
      this.settings[key] = newValue;
    }

    // Reapply theme if theme settings changed
    if (changes.themeId || changes.darkMode || changes.autoDarkMode) {
      this.applyTheme();
    }

    // Handle feature toggle changes
    if (changes.featuresEnabled) {
      if (changes.featuresEnabled.newValue) {
        this.applyPageEnhancements(window.AzureSelectors.getCurrentPageType());
      } else {
        window.AzureDOMHooks.cleanup();
      }
    }
  },

  /**
   * Apply page-specific enhancements
   * @param {string} pageType - Type of page
   */
  applyPageEnhancements(pageType) {
    // Check if this is a posting detail page
    const url = window.location.href;
    if (url.includes('posting.htm') || url.includes('postingId=')) {
      this.enhancePostingDetail();
      return;
    }

    switch (pageType) {
      case 'home':
        this.enhanceHomePage();
        break;
      case 'dashboard':
        this.enhanceDashboard();
        break;
      case 'postings':
        this.enhancePostings();
        break;
      case 'applications':
        this.enhanceApplications();
        break;
      case 'interviews':
        this.enhanceInterviews();
        break;
      case 'messages':
        this.enhanceMessages();
        break;
      default:
        // Generic enhancements for unknown pages
        break;
    }
  },

  /**
   * Enhance posting detail page
   */
  enhancePostingDetail() {
    console.log('[Azure] Enhancing posting detail page');
    
    // Rearrange job information - with retry
    const tryRearrange = (attempts = 0) => {
      if (window.AzureJobInfoRearranger) {
        window.AzureJobInfoRearranger.init();
      } else if (attempts < 5) {
        setTimeout(() => tryRearrange(attempts + 1), 500);
      }
    };
    tryRearrange();
    
    // Initialize keyboard navigation for detail page
    if (window.AzureKeyboardNav) {
      window.AzureKeyboardNav.init();
    }
  },

  /**
   * Enhance home/login page
   */
  enhanceHomePage() {
    window.AzureFeatureFlags.withFeature('layout', () => {
      console.log('[Azure] Enhancing home page');
      // Home page enhancements will go here
    });
  },

  /**
   * Enhance dashboard page
   */
  enhanceDashboard() {
    window.AzureFeatureFlags.withFeature('layout', () => {
      console.log('[Azure] Enhancing dashboard');
      // Dashboard enhancements will go here
    });
  },

  /**
   * Enhance job postings page
   */
  enhancePostings() {
    window.AzureFeatureFlags.withFeature('postings', () => {
      console.log('[Azure] Enhancing postings');
      
      // Inject postings-specific CSS
      const postingsUrl = chrome.runtime.getURL('ui/layout/postings.css');
      window.AzureDOMHooks.injectStylesheet(postingsUrl, 'azure-postings-css');
      
      // Apply posting enhancements
      this.applyPostingEnhancements();
    });

    window.AzureFeatureFlags.withFeature('batch', () => {
      // Batch operations will go here
      this.applyBatchOperations();
    });

    // Initialize keyboard navigation
    window.AzureFeatureFlags.withFeature('shortcuts', () => {
      if (window.AzureKeyboardNav) {
        // Wait for DOM to be ready with job rows
        setTimeout(() => {
          window.AzureKeyboardNav.init();
        }, 500);
      }
    });
  },

  /**
   * Apply posting list enhancements
   */
  applyPostingEnhancements() {
    const { Selectors, querySelectorAll } = window.AzureSelectors;
    
    // Highlight new postings
    if (this.settings.highlightNew) {
      const newBadges = querySelectorAll(Selectors.postings.newBadge);
      newBadges.forEach(badge => {
        badge.closest('tr')?.classList.add('azure-new-posting');
      });
    }
  },

  /**
   * Apply batch operation controls
   */
  applyBatchOperations() {
    // Batch operations implementation will go here
    console.log('[Azure] Batch operations ready');
  },

  /**
   * Enhance applications page
   */
  enhanceApplications() {
    window.AzureFeatureFlags.withFeature('layout', () => {
      console.log('[Azure] Enhancing applications');
      // Applications enhancements will go here
    });
  },

  /**
   * Enhance interviews page
   */
  enhanceInterviews() {
    window.AzureFeatureFlags.withFeature('layout', () => {
      console.log('[Azure] Enhancing interviews');
      // Interviews enhancements will go here
    });
  },

  /**
   * Enhance messages page
   */
  enhanceMessages() {
    window.AzureFeatureFlags.withFeature('messages', () => {
      console.log('[Azure] Enhancing messages');
      
      // Inject messages-specific CSS
      const messagesUrl = chrome.runtime.getURL('ui/layout/messages.css');
      window.AzureDOMHooks.injectStylesheet(messagesUrl, 'azure-messages-css');
      
      // Highlight unread messages
      if (this.settings.highlightUnread) {
        const { Selectors, querySelectorAll } = window.AzureSelectors;
        const unreadRows = querySelectorAll(Selectors.messages.unread);
        unreadRows.forEach(row => {
          row.classList.add('azure-unread-message');
        });
      }
    });
  },

  /**
   * Initialize keyboard navigation
   */
  initKeyboardNav() {
    // Initialize keyboard nav on any page that might have job tables
    if (window.AzureKeyboardNav) {
      console.log('[Azure] Initializing keyboard navigation');
      window.AzureKeyboardNav.init();
    }
  }
};

// Initialize when script loads
Azure.init();

// Also initialize keyboard nav directly after a delay (backup)
setTimeout(() => {
  if (window.AzureKeyboardNav && !window.AzureKeyboardNav.initialized) {
    console.log('[Azure] Late init keyboard navigation');
    window.AzureKeyboardNav.init();
  }
}, 1500);

// Export for debugging
if (typeof window !== 'undefined') {
  window.Azure = Azure;
}
