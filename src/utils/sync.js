import { getOrCreateInvoiceFolder, uploadPdfToFolder, fetchPdfFromUrl } from './drive-api.js';
import { saveInvoice, getInvoices, getRecentInvoices, removeInvoices } from './storage.js';
import { parseDateFlexibly } from './date-parser.js';
import { format } from 'date-fns';

/**
 * Synchronizes invoices from Amazon to Google Drive
 * @param {string} amazonDomain The Amazon domain to sync from
 * @returns {Promise<Object>} Result of the sync operation
 */
export async function syncInvoices(amazonDomain, aFolderId, year) {
  try {
    // Create notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: '/assets/icon128.png',
      title: 'Invoices+ for Amazon',
      message: 'Synchronisation des factures en cours...'
    });

    // Get the Google Drive folder
    const folderId = await getOrCreateInvoiceFolder(aFolderId);

    //await removeInvoices();

    // Get list of order IDs already synchronized
    const existingInvoices = await getInvoices();
    const existingOrderIds = new Set(existingInvoices.map(invoice => invoice.id));
    // Get Amazon orders from the past 90 days
    const orders = await getAmazonOrders(amazonDomain, year);
    let syncCount = 0;

    // Process each order
    for (const order of orders) {
      if (existingOrderIds.has(order.id)) {
        continue // Skip if already synchronized
      }
      // Get the PDF URL if available
      if (order.invoiceUrl) {
        try {

          if (!order.invoiceUrl) {
            // No PDF URL found, save the invoice with error status
            await saveInvoice({
              ...order,
              status: 'Error',
              error: 'PDF non trouvé'
            });
          }

          // Download the PDF
          const pdfBlob = await fetchPdfFromUrl(order.invoiceUrl);

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

    // Create success notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: '/assets/icon128.png',
      title: 'Invoices+ for Amazon',
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
      title: 'Invoices+ for Amazon',
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
async function getAmazonOrders(domain, year = null) {

  if (!year) {
    const currentDate = new Date();
    year = currentDate.getFullYear();
  }

  return new Promise(async (resolve, reject) => {
    try {
      // Generate the orders URL
      const ordersUrl = `https://www.${domain}/your-orders/orders?timeFilter=year-${year}&ref_=ppx_yo2ov_dt_b_filter_all_y${year}`;
      let tabId = 0;

      // Listen for navigation events
      chrome.webNavigation.onCompleted.addListener(async (details) => {
        if (details.url.startsWith('https://www.amazon.fr/ap/signin')) {
          chrome.runtime.onMessage.removeListener();
          try {
            chrome.tabs.update(tabId, { active: true })
          } catch (error) { }

          return resolve([]);
        }
        // Listen for invoice updates from background script
        chrome.runtime.onMessage.addListener((message) => {
          if (message.type === 'FOUND_INVOICES') {

            try {
              chrome.tabs.remove(tabId); // Close the tab after processing
            } catch (error) { }


            const orders = message.invoices.map(order => {
              let orderDate = parseDateFlexibly(order.date);
              if (orderDate === null) {
                orderDate = new Date();
              }
              return {
                id: order.invoiceId,
                date: format(orderDate, 'dd/MM/yyyy'),
                amount: order.amount || 'N/A',
                status: order.status || 'Pending',
                invoiceUrl: order.url || null,
                items: order.items || []
              }
            });

            return resolve(orders);
          }
        });
      });

      const tab = await chrome.tabs.create({ url: ordersUrl, active: false });
      tabId = tab.id;

    } catch (error) {
      console.error('Error getting Amazon orders:', error);
      return resolve([]);
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
    status: invoice.status,
    link: invoice.driveViewLink || null,
  }));
}
