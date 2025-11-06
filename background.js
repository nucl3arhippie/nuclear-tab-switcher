// Service Worker for Enhanced Tab Switcher
// Handles tab management, screenshot capture, and message passing

console.log('Enhanced Tab Switcher service worker loaded');

// Command handler for keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-tab-switcher') {
    // Send message to active tab to toggle the switcher
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { command: 'TOGGLE_SWITCHER' }, (response) => {
          // Ignore errors if content script is not loaded
          if (chrome.runtime.lastError) {
            console.log('Content script not ready on this tab:', chrome.runtime.lastError.message);
          }
        });
      }
    });
  }
});

// Message handler infrastructure
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Wrap all handlers in error handling
  handleMessage(message, sender, sendResponse);
  // Return true to indicate async response
  return true;
});

/**
 * Main message router with error handling wrapper
 */
async function handleMessage(message, sender, sendResponse) {
  try {
    const { command } = message;

    switch (command) {
      case 'GET_TABS':
        const tabs = await getAllTabsWithScreenshots();
        sendResponse({ success: true, tabs });
        break;

      case 'SWITCH_TAB':
        await switchToTab(message.tabId);
        sendResponse({ success: true });
        break;

      case 'CLOSE_TAB':
        await closeTab(message.tabId);
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown command' });
    }
  } catch (error) {
    console.error('Error handling message:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Query all tabs in current window without switching tabs
 */
async function getAllTabsWithScreenshots() {
  try {
    // Get current window
    const currentWindow = await chrome.windows.getCurrent();

    // Query all tabs in current window
    const tabs = await chrome.tabs.query({ windowId: currentWindow.id });

    // Find the currently active tab
    const activeTab = tabs.find(tab => tab.active);
    const originalActiveTabId = activeTab ? activeTab.id : null;

    // Return tabs without screenshots to avoid switching
    const tabsData = tabs.map(tab => ({
      id: tab.id,
      title: tab.title,
      url: tab.url,
      favIconUrl: tab.favIconUrl,
      screenshot: null, // No screenshots to avoid tab switching
      active: tab.id === originalActiveTabId,
      index: tab.index
    }));

    console.log(`Returning ${tabsData.length} tabs to content script`);
    return tabsData;
  } catch (error) {
    console.error('Error getting tabs:', error);
    return [];
  }
}

/**
 * Capture screenshot of a specific tab
 * Returns base64 data URL or null on failure
 */
async function captureTabScreenshot(tabId) {
  try {
    // Capture visible tab with JPEG format at 50% quality for performance
    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'jpeg',
      quality: 50
    });

    return dataUrl;
  } catch (error) {
    console.error(`Error capturing screenshot for tab ${tabId}:`, error);
    // Return null on failure - content script will use favicon fallback
    return null;
  }
}

/**
 * Switch to a specific tab
 */
async function switchToTab(tabId) {
  try {
    await chrome.tabs.update(tabId, { active: true });

    // Also bring the window to front
    const tab = await chrome.tabs.get(tabId);
    await chrome.windows.update(tab.windowId, { focused: true });
  } catch (error) {
    console.error(`Error switching to tab ${tabId}:`, error);
    throw error;
  }
}

/**
 * Close a specific tab
 */
async function closeTab(tabId) {
  try {
    await chrome.tabs.remove(tabId);
  } catch (error) {
    console.error(`Error closing tab ${tabId}:`, error);
    throw error;
  }
}
