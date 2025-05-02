/**
 * Parser for Amazon invoice pages
 */

/**
 * Extracts invoice data from an Amazon order page
 * @param {Document} document The document object of the page
 * @param {string} amazonDomain The Amazon domain being used
 * @returns {Object|null} The extracted invoice data or null if no invoice found
 */
export function extractInvoiceData(document, amazonDomain) {
  try {
    // Different selectors based on the domain/page layout
    const selectors = {
      orderId: [
        '.order-date-invoice-item .value',
        '#orderDetails .order-number-top .value',
        '.order-number .value',
        '[data-test-id="order-id"] .value'
      ],
      orderDate: [
        '.order-date-invoice-item .value',
        '.order-date .value',
        '[data-test-id="order-date"] .value'
      ],
      total: [
        '.grand-total-price',
        '.order-summary-grand-total .a-color-price',
        '[data-test-id="grand-total-amount"]',
        '.grand-total-amount'
      ],
      invoiceLink: [
        'a[href*="invoice"]',
        '.invoice-popover-trigger',
        '.invoice-link'
      ]
    };
    
    // Helper function to try multiple selectors
    const findElement = (selectorList) => {
      for (const selector of selectorList) {
        const element = document.querySelector(selector);
        if (element) return element;
      }
      return null;
    };
    
    // Extract order ID
    const orderIdElement = findElement(selectors.orderId);
    if (!orderIdElement) return null;
    const orderId = orderIdElement.textContent.trim();
    
    // Extract order date
    const orderDateElement = findElement(selectors.orderDate);
    let orderDate = null;
    if (orderDateElement) {
      orderDate = parseDate(orderDateElement.textContent.trim(), amazonDomain);
    }
    
    // Extract total
    const totalElement = findElement(selectors.total);
    let total = null;
    if (totalElement) {
      total = totalElement.textContent.trim();
    }
    
    // Find invoice link
    const invoiceLinkElement = findElement(selectors.invoiceLink);
    let invoiceUrl = null;
    if (invoiceLinkElement && invoiceLinkElement.href) {
      invoiceUrl = invoiceLinkElement.href;
    }
    
    // Extract items
    const items = extractOrderItems(document);
    
    return {
      id: orderId,
      date: orderDate ? orderDate.toISOString() : new Date().toISOString(),
      amount: total,
      domain: amazonDomain,
      invoiceUrl: invoiceUrl,
      items: items,
      status: 'Pending'
    };
  } catch (error) {
    console.error('Error extracting invoice data:', error);
    return null;
  }
}

/**
 * Extracts order items from the page
 * @param {Document} document The document object
 * @returns {Array} The order items
 */
function extractOrderItems(document) {
  const items = [];
  
  try {
    // Different selectors based on the page layout
    const itemContainers = document.querySelectorAll([
      '.order-item',
      '.a-box-group > .a-box',
      '.shipment .a-box',
      '[data-test-id="item-row"]'
    ].join(', '));
    
    itemContainers.forEach(container => {
      // Try different selectors for item name
      const nameElement = container.querySelector([
        '.product-name',
        '.a-link-normal[href*="product"]',
        '.item-title',
        '[data-test-id="item-name"]'
      ].join(', '));
      
      if (!nameElement) return;
      
      const name = nameElement.textContent.trim();
      
      // Try different selectors for item price
      const priceElement = container.querySelector([
        '.item-price',
        '.a-color-price',
        '[data-test-id="item-price"]'
      ].join(', '));
      
      const price = priceElement ? priceElement.textContent.trim() : 'N/A';
      
      items.push({
        name: name,
        price: price
      });
    });
  } catch (error) {
    console.error('Error extracting order items:', error);
  }
  
  return items;
}

/**
 * Parses a date string based on the Amazon domain locale
 * @param {string} dateString The date string to parse
 * @param {string} domain The Amazon domain (for locale hints)
 * @returns {Date} The parsed date
 */
function parseDate(dateString, domain) {
  // Default to current date if parsing fails
  if (!dateString) return new Date();
  
  try {
    // Remove any extra text around the date
    dateString = dateString.replace(/commandée le/i, '')
                          .replace(/command[ée]e/i, '')
                          .replace(/order placed/i, '')
                          .replace(/on/i, '')
                          .trim();
    
    // Determine locale based on domain
    let locale = 'en-US';
    if (domain.includes('.fr')) locale = 'fr-FR';
    else if (domain.includes('.de')) locale = 'de-DE';
    else if (domain.includes('.it')) locale = 'it-IT';
    else if (domain.includes('.es')) locale = 'es-ES';
    else if (domain.includes('.co.uk')) locale = 'en-GB';
    
    // Use the browser's date parsing with locale hints
    const date = new Date(dateString);
    
    // If that fails, try some manual parsing patterns
    if (isNaN(date.getTime())) {
      // Common date formats by locale
      if (locale === 'fr-FR') {
        // French format: DD Month YYYY
        const parts = dateString.split(/\s+/);
        if (parts.length >= 3) {
          const day = parseInt(parts[0], 10);
          const monthStr = parts[1].toLowerCase();
          const year = parseInt(parts[2], 10);
          
          const frenchMonths = [
            'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
            'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
          ];
          
          const month = frenchMonths.findIndex(m => monthStr.includes(m));
          
          if (!isNaN(day) && month !== -1 && !isNaN(year)) {
            return new Date(year, month, day);
          }
        }
      }
      
      // Add more locale-specific parsing as needed
      
      // Last resort: just return current date
      return new Date();
    }
    
    return date;
  } catch (error) {
    console.error('Error parsing date:', error);
    return new Date();
  }
}

/**
 * Determines if a page contains an Amazon invoice/order
 * @param {Document} document The document object
 * @returns {boolean} True if the page contains an invoice
 */
export function isInvoicePage(document) {
  // Check for common elements that appear on order/invoice pages
  const orderElements = [
    // Order confirmation page
    document.querySelector('.order-date-invoice-item'),
    document.querySelector('#orderDetails'),
    document.querySelector('.order-summary'),
    // Invoice page
    document.querySelector('.printable-invoice-summary'),
    document.querySelector('[data-test-id="order-summary"]')
  ];
  
  return orderElements.some(element => element !== null);
}

/**
 * Extracts the PDF download URL from an invoice page
 * @param {Document} document The document object
 * @returns {string|null} The PDF URL or null if not found
 */
export function extractPdfUrl(document) {
  try {
    // Try different selectors for PDF download links
    const pdfLinkSelectors = [
      'a[href*="pdf"][href*="invoice"]',
      'a[href*="generateInvoicePdf"]',
      '.a-link-normal[href*="pdf"]',
      '[data-test-id="invoice-pdf-link"]'
    ];
    
    for (const selector of pdfLinkSelectors) {
      const element = document.querySelector(selector);
      if (element && element.href) {
        return element.href;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting PDF URL:', error);
    return null;
  }
}
