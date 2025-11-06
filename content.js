// Content Script for Enhanced Tab Switcher
// Handles keyboard events and renders overlay UI

class TabSwitcherController {
  constructor() {
    this.isVisible = false;
    this.tabs = [];
    this.selectedIndex = 0;
    this.ctrlPressed = false;
    this.overlayUI = null;

    // Bind methods to maintain context
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
  }

  init() {
    // Set up document-level event listeners
    document.addEventListener('keydown', this.handleKeyDown, true);
    document.addEventListener('keyup', this.handleKeyUp, true);

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.command === 'TOGGLE_SWITCHER') {
        if (!this.isVisible) {
          this.show();
        } else {
          this.hide();
        }
      }
    });
  }

  cleanup() {
    // Remove event listeners
    document.removeEventListener('keydown', this.handleKeyDown, true);
    document.removeEventListener('keyup', this.handleKeyUp, true);

    // Clean up overlay if visible
    if (this.isVisible) {
      this.hide();
    }
  }

  handleKeyDown(event) {
    // Track Ctrl key state
    if (event.key === 'Control') {
      this.ctrlPressed = true;
    }

    // Handle keys only when overlay is visible
    if (!this.isVisible) {
      return;
    }

    // Handle Tab key for navigation when overlay is visible
    if (event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) {
        this.navigatePrevious();
      } else {
        this.navigateNext();
      }
      return;
    }

    // Handle arrow keys for navigation
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      event.stopPropagation();
      this.navigateNext();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      event.stopPropagation();
      this.navigatePrevious();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      this.navigateDown();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      this.navigateUp();
    }
    // Handle Delete key for closing selected tab
    else if (event.key === 'Delete') {
      event.preventDefault();
      event.stopPropagation();
      this.closeSelectedTab();
    }
    // Handle Enter key to switch to selected tab
    else if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      this.switchToSelectedTab();
    }
    // Handle Escape key to close overlay without switching
    else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.hide();
    }
  }

  handleKeyUp(event) {
    // Track Ctrl key state
    if (event.key === 'Control') {
      this.ctrlPressed = false;
    }
  }

  navigateNext() {
    // Prevent navigation errors with bounds checking
    if (this.tabs.length === 0) return;
    if (this.tabs.length === 1) {
      this.selectedIndex = 0;
      return;
    }

    // Move selection forward with wrap-around
    this.selectedIndex = (this.selectedIndex + 1) % this.tabs.length;
    this.updateUI();
  }

  navigatePrevious() {
    // Prevent navigation errors with bounds checking
    if (this.tabs.length === 0) return;
    if (this.tabs.length === 1) {
      this.selectedIndex = 0;
      return;
    }

    // Move selection backward with wrap-around
    this.selectedIndex = (this.selectedIndex - 1 + this.tabs.length) % this.tabs.length;
    this.updateUI();
  }

  navigateDown() {
    // Prevent navigation errors with bounds checking
    if (this.tabs.length === 0) return;
    if (this.tabs.length === 1) {
      this.selectedIndex = 0;
      return;
    }

    // Calculate grid columns based on viewport width
    const gridColumns = this.getGridColumns();

    // Move selection down by grid column count
    const newIndex = this.selectedIndex + gridColumns;

    // Wrap around if we go past the end
    if (newIndex >= this.tabs.length) {
      // Go to the same column in the first row, or first item if that doesn't exist
      const column = this.selectedIndex % gridColumns;
      this.selectedIndex = Math.min(column, this.tabs.length - 1);
    } else {
      this.selectedIndex = newIndex;
    }

    // Ensure selectedIndex is within bounds
    this.selectedIndex = Math.max(0, Math.min(this.selectedIndex, this.tabs.length - 1));
    this.updateUI();
  }

  navigateUp() {
    // Prevent navigation errors with bounds checking
    if (this.tabs.length === 0) return;
    if (this.tabs.length === 1) {
      this.selectedIndex = 0;
      return;
    }

    // Calculate grid columns based on viewport width
    const gridColumns = this.getGridColumns();

    // Move selection up by negative grid column count
    const newIndex = this.selectedIndex - gridColumns;

    // Wrap around if we go before the start
    if (newIndex < 0) {
      // Go to the same column in the last row
      const column = this.selectedIndex % gridColumns;
      const lastRowStart = Math.floor((this.tabs.length - 1) / gridColumns) * gridColumns;
      this.selectedIndex = Math.min(lastRowStart + column, this.tabs.length - 1);
    } else {
      this.selectedIndex = newIndex;
    }

    // Ensure selectedIndex is within bounds
    this.selectedIndex = Math.max(0, Math.min(this.selectedIndex, this.tabs.length - 1));
    this.updateUI();
  }

  getGridColumns() {
    // Calculate grid columns based on viewport width
    const width = window.innerWidth;

    if (width < 900) {
      return 3;
    } else if (width < 1200) {
      return 4;
    } else {
      return 5;
    }
  }

  updateUI() {
    // Update the overlay UI to reflect the new selection
    if (this.overlayUI) {
      this.overlayUI.render(this.tabs, this.selectedIndex);
    }
  }

  show() {
    if (this.isVisible) return;

    // Request tabs from service worker with timeout
    this.sendMessageWithTimeout({ command: 'GET_TABS' }, 2000)
      .then((response) => {
        if (!response || !response.success || !response.tabs) {
          console.error('Failed to get tabs from service worker');
          this.showErrorOverlay('Failed to load tabs. Please try again.', () => this.show());
          return;
        }

        this.tabs = response.tabs;

        console.log(`Loaded ${this.tabs.length} tabs`);

        // Handle empty tabs array
        if (this.tabs.length === 0) {
          console.warn('No tabs available');
          this.showErrorOverlay('No tabs available.', () => this.show());
          return;
        }

        // Handle single tab case - close overlay immediately
        if (this.tabs.length === 1) {
          console.log('Only one tab available, closing overlay');
          return;
        }

        // Initialize selectedIndex to current active tab
        const activeTabIndex = this.tabs.findIndex(tab => tab.active);
        this.selectedIndex = activeTabIndex >= 0 ? activeTabIndex : 0;

        // Create and render overlay UI
        this.overlayUI = new OverlayUI();

        // Set up callback for tab close from UI
        this.overlayUI.setCloseTabCallback((tabId) => {
          this.handleTabClosedFromUI(tabId);
        });

        // Set up callback for tab switch from UI
        this.overlayUI.setSwitchTabCallback((tabId) => {
          this.switchToTabById(tabId);
        });

        // Set up callback for hiding overlay
        this.overlayUI.setHideCallback(() => {
          this.hide();
        });

        this.overlayUI.render(this.tabs, this.selectedIndex);

        this.isVisible = true;
      })
      .catch((error) => {
        console.error('Error communicating with service worker:', error);
        this.showErrorOverlay('Connection timeout. Please try again.', () => this.show());
      });
  }

  sendMessageWithTimeout(message, timeout) {
    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        reject(new Error('Message timeout'));
      }, timeout);

      // Send message
      chrome.runtime.sendMessage(message, (response) => {
        clearTimeout(timeoutId);

        // Check for runtime errors
        if (chrome.runtime.lastError) {
          console.error('Runtime error:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        resolve(response);
      });
    });
  }

  showErrorOverlay(message, retryCallback) {
    // Create error overlay
    this.overlayUI = new OverlayUI();
    this.overlayUI.renderError(message, retryCallback);
    this.isVisible = true;
  }

  handleTabClosedFromUI(tabId) {
    // Find and remove the closed tab from our array
    const tabIndex = this.tabs.findIndex(tab => tab.id === tabId);
    if (tabIndex === -1) return;

    this.tabs.splice(tabIndex, 1);

    // Handle empty tabs array
    if (this.tabs.length === 0) {
      this.hide();
      return;
    }

    // Close overlay if only one tab remains
    if (this.tabs.length === 1) {
      this.hide();
      return;
    }

    // Adjust selectedIndex if needed with bounds checking
    if (this.selectedIndex >= this.tabs.length) {
      this.selectedIndex = this.tabs.length - 1;
    } else if (tabIndex <= this.selectedIndex && this.selectedIndex > 0) {
      this.selectedIndex--;
    }

    // Ensure selectedIndex is within bounds
    this.selectedIndex = Math.max(0, Math.min(this.selectedIndex, this.tabs.length - 1));

    // Update UI
    this.updateUI();
  }

  hide() {
    if (!this.isVisible) return;

    // Destroy overlay and clear state
    if (this.overlayUI) {
      this.overlayUI.destroy();
      this.overlayUI = null;
    }

    this.isVisible = false;
    this.tabs = [];
    this.selectedIndex = 0;
  }

  switchToSelectedTab() {
    if (!this.isVisible || this.tabs.length === 0) return;

    const selectedTab = this.tabs[this.selectedIndex];
    this.switchToTabById(selectedTab.id);
  }

  switchToTabById(tabId) {
    if (!this.isVisible) return;

    // Send SWITCH_TAB message to service worker with timeout
    this.sendMessageWithTimeout({
      command: 'SWITCH_TAB',
      tabId: tabId
    }, 2000)
      .then(() => {
        // Close overlay after switching
        this.hide();
      })
      .catch((error) => {
        console.error('Error switching tab:', error);
        // Close overlay anyway to avoid stuck state
        this.hide();
      });
  }

  closeSelectedTab() {
    if (!this.isVisible || this.tabs.length === 0) return;

    // Bounds checking
    if (this.selectedIndex < 0 || this.selectedIndex >= this.tabs.length) {
      console.error('Invalid selectedIndex:', this.selectedIndex);
      return;
    }

    const selectedTab = this.tabs[this.selectedIndex];

    // Send CLOSE_TAB message to service worker with timeout
    this.sendMessageWithTimeout({
      command: 'CLOSE_TAB',
      tabId: selectedTab.id
    }, 2000)
      .then((response) => {
        if (response && response.success) {
          // Remove the closed tab from our array
          this.tabs.splice(this.selectedIndex, 1);

          // Handle empty tabs array
          if (this.tabs.length === 0) {
            this.hide();
            return;
          }

          // Close overlay if only one tab remains
          if (this.tabs.length === 1) {
            this.hide();
            return;
          }

          // Adjust selectedIndex if needed with bounds checking
          if (this.selectedIndex >= this.tabs.length) {
            this.selectedIndex = this.tabs.length - 1;
          }

          // Ensure selectedIndex is within bounds
          this.selectedIndex = Math.max(0, Math.min(this.selectedIndex, this.tabs.length - 1));

          // Update UI
          this.updateUI();
        }
      })
      .catch((error) => {
        console.error('Error closing tab:', error);
        // Refresh tab list to reflect current state
        this.hide();
        this.show();
      });
  }
}

// OverlayUI class - Renders the tab switcher overlay
class OverlayUI {
  constructor() {
    // Create overlay container element
    this.container = document.createElement('div');
    this.container.id = 'tab-switcher-overlay';
    this.closeTabCallback = null;
    this.switchTabCallback = null;
    this.hideCallback = null;

    // Bind ESC key handler
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  handleKeyDown(event) {
    // Handle Escape key to close overlay
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (this.hideCallback) {
        this.hideCallback();
      }
    }
  }

  render(tabs, selectedIndex) {
    // Clear existing content
    this.container.innerHTML = '';

    // Create main container
    const switcherContainer = document.createElement('div');
    switcherContainer.className = 'tab-switcher-container';

    // Create tab grid container
    const tabGrid = document.createElement('div');
    tabGrid.className = 'tab-grid';

    // Render each tab card
    tabs.forEach((tab, index) => {
      const tabCard = this.createTabCard(tab, index === selectedIndex);
      tabGrid.appendChild(tabCard);
    });

    switcherContainer.appendChild(tabGrid);
    this.container.appendChild(switcherContainer);

    // Append to document.body if not already appended
    if (!this.container.parentNode) {
      document.body.appendChild(this.container);
      // Add ESC key listener when overlay is shown
      document.addEventListener('keydown', this.handleKeyDown, true);
    }
  }

  renderError(message, retryCallback) {
    // Clear existing content
    this.container.innerHTML = '';

    // Create main container
    const switcherContainer = document.createElement('div');
    switcherContainer.className = 'tab-switcher-container';

    // Create error message container
    const errorContainer = document.createElement('div');
    errorContainer.className = 'tab-switcher-error';
    errorContainer.style.cssText = 'text-align: center; padding: 40px; color: white;';

    // Error message
    const errorMessage = document.createElement('div');
    errorMessage.style.cssText = 'font-size: 18px; margin-bottom: 20px;';
    errorMessage.textContent = message;
    errorContainer.appendChild(errorMessage);

    // Retry button
    const retryButton = document.createElement('button');
    retryButton.textContent = 'Retry';
    retryButton.style.cssText = 'padding: 10px 20px; font-size: 16px; cursor: pointer; background: rgba(100, 150, 255, 0.8); border: none; border-radius: 6px; color: white;';
    retryButton.addEventListener('click', () => {
      this.destroy();
      retryCallback();
    });
    errorContainer.appendChild(retryButton);

    switcherContainer.appendChild(errorContainer);
    this.container.appendChild(switcherContainer);

    // Append to document.body if not already appended
    if (!this.container.parentNode) {
      document.body.appendChild(this.container);
    }
  }

  createTabCard(tab, isActive) {
    // Create tab card element
    const card = document.createElement('div');
    card.className = 'tab-card';
    if (isActive) {
      card.classList.add('active');
    }
    card.setAttribute('data-tab-id', tab.id);

    // Add click handler to switch to tab
    card.addEventListener('click', (e) => {
      // Don't trigger if clicking close button
      if (e.target.classList.contains('tab-close-btn')) {
        return;
      }
      if (this.switchTabCallback) {
        this.switchTabCallback(tab.id);
      }
    });

    // Add middle click handler to close tab
    card.addEventListener('mousedown', (e) => {
      // Middle mouse button (button 1)
      if (e.button === 1) {
        e.preventDefault();
        e.stopPropagation();
        this.handleCloseTab(tab.id);
      }
    });

    // Create close button
    const closeBtn = document.createElement('div');
    closeBtn.className = 'tab-close-btn';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleCloseTab(tab.id);
    });
    card.appendChild(closeBtn);

    // Create favicon element
    const faviconContainer = document.createElement('div');
    faviconContainer.className = 'tab-favicon';

    if (tab.favIconUrl) {
      const favicon = document.createElement('img');
      favicon.src = tab.favIconUrl;
      favicon.alt = 'Favicon';
      // Handle missing favicon with placeholder
      favicon.onerror = () => {
        favicon.src = chrome.runtime.getURL('icons/placeholder-favicon.png');
      };
      faviconContainer.appendChild(favicon);
    } else {
      // Use default placeholder icon
      const placeholder = document.createElement('img');
      placeholder.src = chrome.runtime.getURL('icons/placeholder-favicon.png');
      placeholder.alt = 'Default icon';
      faviconContainer.appendChild(placeholder);
    }
    card.appendChild(faviconContainer);

    // Create screenshot or enlarged favicon fallback
    const screenshotContainer = document.createElement('div');
    screenshotContainer.className = 'tab-screenshot';

    if (tab.screenshot) {
      // Render screenshot if available
      const screenshot = document.createElement('img');
      screenshot.src = tab.screenshot;
      screenshot.alt = 'Tab preview';
      screenshotContainer.appendChild(screenshot);
    } else {
      // Render enlarged favicon as fallback
      const enlargedFavicon = document.createElement('div');
      enlargedFavicon.className = 'tab-screenshot-fallback';

      if (tab.favIconUrl) {
        const faviconImg = document.createElement('img');
        faviconImg.src = tab.favIconUrl;
        faviconImg.alt = 'Tab icon';
        faviconImg.onerror = () => {
          faviconImg.src = chrome.runtime.getURL('icons/placeholder-favicon.png');
        };
        enlargedFavicon.appendChild(faviconImg);
      } else {
        const placeholder = document.createElement('img');
        placeholder.src = chrome.runtime.getURL('icons/placeholder-favicon.png');
        placeholder.alt = 'Default icon';
        enlargedFavicon.appendChild(placeholder);
      }

      screenshotContainer.appendChild(enlargedFavicon);
    }
    card.appendChild(screenshotContainer);

    // Create tab info container
    const tabInfo = document.createElement('div');
    tabInfo.className = 'tab-info';

    // Create and truncate title
    const title = document.createElement('div');
    title.className = 'tab-title';
    title.textContent = this.truncateText(tab.title || 'Untitled', 50);
    title.title = tab.title; // Full title on hover
    tabInfo.appendChild(title);

    // Create and truncate URL
    const url = document.createElement('div');
    url.className = 'tab-url';
    url.textContent = this.truncateText(tab.url || '', 60);
    url.title = tab.url; // Full URL on hover
    tabInfo.appendChild(url);

    card.appendChild(tabInfo);

    return card;
  }

  truncateText(text, maxLength) {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + '...';
  }

  handleCloseTab(tabId) {
    // Send CLOSE_TAB message to service worker with timeout
    const timeoutPromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Message timeout'));
      }, 2000);

      chrome.runtime.sendMessage({
        command: 'CLOSE_TAB',
        tabId: tabId
      }, (response) => {
        clearTimeout(timeoutId);

        if (chrome.runtime.lastError) {
          console.error('Runtime error:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        resolve(response);
      });
    });

    timeoutPromise
      .then((response) => {
        if (response && response.success && this.closeTabCallback) {
          this.closeTabCallback(tabId);
        }
      })
      .catch((error) => {
        console.error('Error closing tab:', error);
        // Notify callback anyway to refresh state
        if (this.closeTabCallback) {
          this.closeTabCallback(tabId);
        }
      });
  }

  setCloseTabCallback(callback) {
    this.closeTabCallback = callback;
  }

  setSwitchTabCallback(callback) {
    this.switchTabCallback = callback;
  }

  setHideCallback(callback) {
    this.hideCallback = callback;
  }

  getGridColumns() {
    // Calculate grid columns based on viewport width
    const width = window.innerWidth;

    if (width < 900) {
      return 3;
    } else if (width < 1200) {
      return 4;
    } else {
      return 5;
    }
  }

  destroy() {
    // Remove ESC key listener
    document.removeEventListener('keydown', this.handleKeyDown, true);

    // Remove overlay from DOM
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
    this.closeTabCallback = null;
    this.switchTabCallback = null;
    this.hideCallback = null;
  }
}

// Initialize the controller
const controller = new TabSwitcherController();
controller.init();

console.log('Enhanced Tab Switcher content script loaded');
