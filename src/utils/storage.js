/**
 * Saves the configuration to Chrome storage
 * @param {Object} config The configuration to save
 * @returns {Promise<void>}
 */
export async function saveConfig(config) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ config }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Loads the configuration from Chrome storage
 * @returns {Promise<Object|null>} The configuration or null if not found
 */
export async function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get('config', (data) => {
      if (data.config) {
        resolve(data.config);
      } else {
        // Default configuration
        resolve({
          isConfigured: false,
          amazonDomain: 'amazon.fr',
          autoSync: true,
          lastSync: null,
          driveFolder: {
            id: null,
            name: null
          }
        });
      }
    });
  });
}

/**
 * Saves an invoice to Chrome storage
 * @param {Object} invoice The invoice to save
 * @returns {Promise<void>}
 */
export async function saveInvoice(invoice) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get('invoices', (data) => {
      let invoices = data.invoices || [];
      
      // Check if invoice already exists
      const existingIndex = invoices.findIndex(i => i.id === invoice.id);
      if (existingIndex !== -1) {
        // Update existing invoice
        invoices[existingIndex] = {
          ...invoices[existingIndex],
          ...invoice,
          updatedAt: new Date().toISOString()
        };
      } else {
        // Add new invoice
        invoices.push({
          ...invoice,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      
      // Sort by date, newest first
      invoices.sort((a, b) => new Date(b.date) - new Date(a.date));
      
      // Save to storage
      chrome.storage.local.set({ invoices }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  });
}

/**
 * Gets all invoices from Chrome storage
 * @returns {Promise<Array>} The array of invoices
 */
export async function getInvoices() {
  return new Promise((resolve) => {
    chrome.storage.local.get('invoices', (data) => {
      resolve(data.invoices || []);
    });
  });
}

/**
 * Gets the N most recent invoices
 * @param {number} count The number of invoices to get
 * @returns {Promise<Array>} The array of invoices
 */
export async function getRecentInvoices(count) {
  const invoices = await getInvoices();
  return invoices.slice(0, count);
}
