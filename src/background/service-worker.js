import { syncInvoices } from '../utils/sync.js';
import { loadConfig } from '../utils/storage.js';

// Initialize alarms when the service worker starts
chrome.runtime.onInstalled.addListener(() => {
  setupAlarms();
});

// Handle messages from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateSyncSettings') {
    handleSyncSettingsUpdate(message.autoSync);
    sendResponse({ success: true });
  }

  // Return true to indicate we'll respond asynchronously
  return true;
});

// Handle alarm events
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dailySync') {
    handleDailySync();
  }
});

/**
 * Sets up the alarm for daily synchronization
 */
async function setupAlarms() {
  try {
    const config = await loadConfig();

    if (config && config.isConfigured && config.autoSync) {
      // Create an alarm that triggers once per day
      chrome.alarms.create('dailySync', {
        periodInMinutes: 24 * 60 // 24 hours
      });
    } else {
      // Clear the alarm if auto-sync is disabled
      chrome.alarms.clear('dailySync');
    }
  } catch (error) {
    console.error('Error setting up alarms:', error);
  }
}

/**
 * Handles a change in sync settings
 * @param {boolean} autoSync Whether auto-sync is enabled
 */
function handleSyncSettingsUpdate(autoSync) {
  if (autoSync) {
    // Create/update the alarm
    chrome.alarms.create('dailySync', {
      periodInMinutes: 24 * 60 // 24 hours
    });
  } else {
    // Clear the alarm
    chrome.alarms.clear('dailySync');
  }
}

/**
 * Handles the daily sync alarm event
 */
async function handleDailySync() {
  try {
    const config = await loadConfig();

    if (config && config.isConfigured && config.driveFolder.id && config.autoSync) {
      await syncInvoices(config.amazonDomain, config.driveFolder.id);

      // Update last sync time
      config.lastSync = new Date().toISOString();
      chrome.storage.sync.set({ config });
    }
  } catch (error) {
    console.error('Error during daily sync:', error);

    // Create error notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: '/assets/icon128.png',
      title: 'Invoices+ for Amazon',
      message: `Erreur lors de la synchronisation automatique: ${error.message}`
    });
  }
}
