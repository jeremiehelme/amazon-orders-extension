import { extractInvoiceData, extractPdfUrl, isInvoicePage } from './amazon-parser.js';
import { getOrCreateInvoiceFolder, uploadPdfToFolder, fetchPdfFromUrl } from './drive-api.js';
import { saveInvoice, getInvoices, getRecentInvoices } from './storage.js';

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
  try {
    // Generate the orders URL
    const ordersUrl = `https://www.${domain}/gp/css/order-history?orderFilter=year-2023`;
    
    // Fetch the orders page
    const response = await fetch(ordersUrl);
    const ordersPageText = await response.text();
    const parser = new DOMParser();
    const ordersDoc = parser.parseFromString(ordersPageText, 'text/html');
    
    // Extract order links
    const orderLinks = [];
    const orderElements = ordersDoc.querySelectorAll('a[href*="order-details"]');
    
    orderElements.forEach(element => {
      if (element.href) {
        orderLinks.push(element.href);
      }
    });
    
    const orders = [];
    
    // Process each order page
    for (const orderLink of orderLinks) {
      try {
        const orderResponse = await fetch(orderLink);
        const orderPageText = await orderResponse.text();
        const orderDoc = parser.parseFromString(orderPageText, 'text/html');
        
        if (isInvoicePage(orderDoc)) {
          const orderData = extractInvoiceData(orderDoc, domain);
          
          if (orderData) {
            orders.push(orderData);
          }
        }
      } catch (error) {
        console.error('Error processing order page:', error);
      }
    }
    
    return orders;
  } catch (error) {
    console.error('Error getting Amazon orders:', error);
    return [];
  }
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
