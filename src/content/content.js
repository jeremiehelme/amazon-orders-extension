console.log('Amazon Factures+ content script loaded');

// Function to extract invoice URLs from the page
async function extractInvoiceUrls() {


    const orderBlocks = document.querySelectorAll(".order-card__list");

    const invoices = [];
    for (const orderBlock of orderBlocks) {
        const orderDate = orderBlock.querySelector(".order-header .a-fixed-right-grid-col.a-col-left .a-column.a-span4 .a-size-base.a-color-secondary.aok-break-word")?.innerHTML;
        const invoiceId = orderBlock.querySelector(".order-header .yohtmlc-order-id .a-color-secondary:last-child")?.innerHTML;

        // Find the invoice button
        const invoiceButton = orderBlock.querySelector(".order-header__header-link-list-item span[data-action='a-popover'] a");
        // Create a promise that resolves when the popup appears
        const popupPromise = new Promise(resolve => {
            const popupObserver = new MutationObserver((mutations, observer) => {
                for (const mutation of mutations) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === 1 && node.classList.contains('a-popover')) {
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



        // Click each button and extract invoice links
        const intervalId = setInterval(() => {
            const clickEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true
            });
            invoiceButton.dispatchEvent(clickEvent);
        }, 1000);

        const popoverList = await popupPromise;
        clearInterval(intervalId);

        if (!popoverList) {
            resolve(null);
        }

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
                resolve(null);
            });

            popupObserver.observe(popoverList, {
                childList: true,
                subtree: true
            });
        });

        const invoiceList = await invoiceListPromise;
        if (!invoiceList) {
            console.error('Invoice list not found');
            resolve(null);
        }
        // Find all links in the invoice list
        for (const link of invoiceList.querySelectorAll('a')) {
            if (link.innerHTML.includes('Facture')) {

                invoices.push({
                    url: link.href,
                    text: `Invoice ${invoiceId} - ${orderDate}`,
                    invoiceId: invoiceId,
                    date: orderDate
                });
                // Close popup by clicking outside
                document.body.click();
                break;
            }
        }


        // Small delay to ensure popup is fully closed
        await new Promise(resolve => setTimeout(resolve, 100));
    }


    chrome.runtime.sendMessage({
        type: 'FOUND_INVOICES',
        invoices: invoices
    });

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

    return invoiceIdPart || null;

}