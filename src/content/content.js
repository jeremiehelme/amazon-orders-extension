console.log('Amazon Factures+ content script loaded');

// Function to extract invoice URLs from the page
async function extractInvoiceUrls() {



    // Find all invoice buttons
    const invoiceButtons = document.querySelectorAll(".order-header__header-link-list-item span[data-action='a-popover'] a");
    const invoices = [];
    console.log(invoiceButtons);
    // Click each button and extract invoice links
    for (const button of invoiceButtons) {
        // Create a promise that resolves when the popup appears
        const popupPromise = new Promise(resolve => {
            const popupObserver = new MutationObserver((mutations, observer) => {
                for (const mutation of mutations) {
                    for (const node of mutation.addedNodes) {
                        console.log("found node", node);
                        if (node.nodeType === 1 && node.classList.contains('a-popover')) {
                            console.log("found popup", node);
                            observer.disconnect();
                            resolve(node);
                            return;
                        }
                    }
                }
            });

            popupObserver.observe(document.body, {
                childList: true,
                subtree: true
            });
        });

        // Click the button to open popup
        const intervalId = setInterval(button.click(), 1000);
        const popoverList = await popupPromise;
        clearInterval(intervalId);
        if (popoverList) {
            const invoiceListPromise = new Promise(resolve => {
                const popupObserver = new MutationObserver((mutations, observer) => {
                    for (const mutation of mutations) {
                        for (const node of mutation.addedNodes) {
                            if (node.nodeType === 1 && node.classList.contains('invoice-list')) {
                                observer.disconnect();
                                resolve(node);
                                return;
                            }
                        }
                    }
                });

                popupObserver.observe(popoverList, {
                    childList: true,
                    subtree: true
                });
            });

            const invoiceList = await invoiceListPromise;
            // Find all links in the invoice list

            console.log('invoiceList', invoiceList);
            for (const link of invoiceList.querySelectorAll('a')) {
                if (link.innerHTML.includes('Facture')) {

                    const invoiceId = getInvoiceIdFromUrl(link.href);
                    const orderDate = button.closest('.order-header')?.querySelector('.order-date')?.textContent.trim() || '';

                    invoices.push({
                        url: link.href,
                        text: `Invoice ${invoiceId} - ${orderDate}`,
                        invoiceId: invoiceId
                    });
                    console.log('invoices', invoices);
                    // Close popup by clicking outside
                    document.body.click();
                    break;
                }
            }
        }

        // Small delay to ensure popup is fully closed
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (invoices.length > 0) {
        chrome.runtime.sendMessage({
            type: 'FOUND_INVOICES',
            invoices: invoices
        });
    }
}


// Run when page loads
window.addEventListener('load', () => {
    let orders = document.querySelectorAll(".order-card__list");
    if (orders.length > 0) {
        extractInvoiceUrls();
    }
});


// Observe DOM changes for dynamically loaded content
const observer = new MutationObserver((mutations) => {
    let hasNewOrders = false;
    mutations.forEach((mutation) => {
        if (mutation.addedNodes.length) {
            const newOrders = Array.from(mutation.addedNodes).filter(node => node.nodeType === 1 && node.classList.contains(".order-card__list"));
            if (newOrders.length > 0) {
                hasNewOrders = true;
                console.log('New orders detected:', newOrders);
            }
        }
    });

    if (hasNewOrders) {
        extractInvoiceUrls();
    }
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});


function getInvoiceIdFromUrl(url) {
    const urlParts = url.split('/');

    if (!urlParts || urlParts.length < 3) {
        return null;
    }
    const invoiceIdPart = urlParts[urlParts.length - 2];
    console.log('invoiceIdPart', invoiceIdPart);

    return invoiceIdPart || null;

}