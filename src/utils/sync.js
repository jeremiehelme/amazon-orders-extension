import { extractInvoiceData, extractPdfUrl, isInvoicePage } from './amazon-parser.js';
import { getOrCreateInvoiceFolder, uploadPdfToFolder, fetchPdfFromUrl } from './drive-api.js';
import { saveInvoice, getInvoices, getRecentInvoices, removeInvoices } from './storage.js';

/**
 * Synchronizes invoices from Amazon to Google Drive
 * @param {string} amazonDomain The Amazon domain to sync from
 * @returns {Promise<Object>} Result of the sync operation
 */
export async function syncInvoices(amazonDomain, aFolderId) {
  try {
    // Create notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: '/assets/icon128.png',
      title: 'Amazon Factures+',
      message: 'Synchronisation des factures en cours...'
    });

    // Get the Google Drive folder
    const folderId = await getOrCreateInvoiceFolder(aFolderId);

    // Get list of order IDs already synchronized
    const existingInvoices = await getInvoices();
    const existingOrderIds = new Set(existingInvoices.map(invoice => invoice.id));
    // Get Amazon orders from the past 90 days
    const orders = await getAmazonOrders(amazonDomain);
    let syncCount = 0;

    // Process each order
    for (const order of orders) {
      if (!existingOrderIds.has(order.id)) {
        // Get the PDF URL if available
        if (order.invoiceUrl) {
          try {
            // Fetch the invoice page to get the PDF URL
            const invoicePageResponse = await fetch(order.invoiceUrl);
            const invoicePageText = await invoicePageResponse.text();
            const parser = new DOMParser();
            const invoiceDoc = parser.parseFromString(invoicePageText, 'text/html');

            const pdfUrl = extractPdfUrl(invoiceDoc);

            if (pdfUrl) {
              // Download the PDF
              const pdfBlob = await fetchPdfFromUrl(pdfUrl);

              // Generate a filename
              const fileName = `Facture_Amazon_${order.id}.pdf`;

              // Upload to Google Drive
              const uploadedFile = await uploadPdfToFolder(fileName, pdfBlob, folderId);

              // Save the invoice with success status
              await saveInvoice({
                ...order,
                driveFileId: uploadedFile.id,
                driveViewLink: uploadedFile.webViewLink,
                status: 'Success'
              });

              syncCount++;
            } else {
              // No PDF URL found, save the invoice with error status
              await saveInvoice({
                ...order,
                status: 'Error',
                error: 'PDF non trouvé'
              });
            }
          } catch (error) {
            console.error('Error processing invoice:', error);

            // Save with error status
            await saveInvoice({
              ...order,
              status: 'Error',
              error: error.message
            });
          }
        } else {
          // No invoice URL, save with error status
          await saveInvoice({
            ...order,
            status: 'Error',
            error: 'URL de facture non trouvée'
          });
        }
      }
    }

    // Create success notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: '/assets/icon128.png',
      title: 'Amazon Factures+',
      message: `Synchronisation terminée. ${syncCount} nouvelles factures ont été synchronisées.`
    });

    return {
      success: true,
      count: syncCount
    };
  } catch (error) {
    console.error('Error syncing invoices:', error);

    // Create error notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: '/assets/icon128.png',
      title: 'Amazon Factures+',
      message: `Erreur lors de la synchronisation: ${error.message}`
    });

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Gets Amazon orders from the order history page
 * @param {string} domain The Amazon domain
 * @returns {Promise<Array>} The list of orders
 */
async function getAmazonOrders(domain) {

  return new Promise(async (resolve, reject) => {
    try {
      // Generate the orders URL
      const ordersUrl = `https://www.${domain}/your-orders/orders?timeFilter=year-2021&ref_=ppx_yo2ov_dt_b_filter_all_y2021`;
      let tabId = 0;

      // Listen for invoice updates from background script
      chrome.runtime.onMessage.addListener((message) => {
        console.log('Message received:', message);
        if (message.type === 'FOUND_INVOICES') {
          console.log('Invoices found:', message.invoices);

          const orders = message.invoices.map(order => ({
            id: order.invoiceId,
            date: order.date ? order.date.toISOString() : new Date().toISOString(),
            amount: order.amount || 'N/A',
            status: order.status || 'Pending',
            invoiceUrl: order.url || null,
            items: order.items || []
          }));

          chrome.tabs.remove(tabId); // Close the tab after processing
          return resolve(orders);
        }
      });

      //open chrome tab instead of fetch
      const tab = await chrome.tabs.create({ url: ordersUrl, active: false });
      tabId = tab.id; console.log('Tab opened:', tabId);

    } catch (error) {
      console.error('Error getting Amazon orders:', error);
      return resolve([]);
      return [];
    }
  });

}

/**
 * Gets the most recent invoices with their sync status
 * @param {number} count The number of invoices to get
 * @returns {Promise<Array>} The list of invoices
 */
export async function getMostRecentInvoices(count) {
  const invoices = await getRecentInvoices(count);

  // Format them for display
  return invoices.map(invoice => ({
    id: invoice.id,
    date: invoice.date,
    amount: invoice.amount || 'N/A',
    status: invoice.status
  }));
}
