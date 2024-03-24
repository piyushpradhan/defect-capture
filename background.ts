// Chrome automatically creates a background.html page for this to execute.
// This can access the inspected page via executeScript
//
// Can use:
// chrome.tabs.*
// chrome.extension.*
let version = "1.0";

// When devtools opens, this gets connected
// @ts-ignore
chrome.extension.onConnect.addListener(function (port) {
    let extensionListener = function (message, sender, sendResponse) {
        if (message.action === "downloadHARlog") {
            console.log({ message, port });
            port.postMessage(message);
        } else {
            console.log("Not downloading HAR: ", message);
            sendResponse(message);
        }
    };

    // Listens to messages sent from the panel
    // @ts-ignore
    chrome.extension.onMessage.addListener(extensionListener);

    port.onDisconnect.addListener(function () {
        // @ts-ignore
        chrome.extension.onMessage.removeListener(extensionListener);
    });
});

let gTabId: number | undefined;
let logData: Array<Object> = [];

function onEvent(
    source: chrome.debugger.Debuggee,
    _method: string,
    params?: Object | undefined
) {
    if (gTabId != source.tabId) return;

    if (params) {
        logData.push(params);
    }
}

function onAttach(tabId: any) {
    gTabId = tabId;
    if (chrome.runtime.lastError) {
        return;
    }

    // use Log.enable and go from there
    chrome.debugger.sendCommand({ tabId: tabId }, "Log.enable");
    chrome.debugger.onEvent.addListener(onEvent);

    setTimeout(() => {
        let harBLOB = new Blob([JSON.stringify(logData)]);

        let url = URL.createObjectURL(harBLOB);

        chrome.downloads.download({
            url: url,
        });

        // cleanup after downloading file
        chrome.debugger.sendCommand({ tabId: tabId }, "Log.disable");
        chrome.debugger.detach({ tabId: tabId });
        gTabId = undefined;
        logData = [];
    }, 1000);
}

// is devtools open
let openCount = 0;
let isDevToolsOpen = false;

// Always return true for async connections for chrome.runtime.onConnect.addListener
chrome.runtime.onConnect.addListener(function (port) {
    if (port.name == "devtools-page") {
        if (openCount == 0) {
            isDevToolsOpen = true;
            // alert("DevTools window opening.");
        }
        openCount++;

        port.onDisconnect.addListener(function () {
            openCount--;
            if (openCount == 0) {
                isDevToolsOpen = false;
            }
        });
    }
    return true;
});

// messages from popup.js
// Always return true for async connections for chrome.runtime.onConnect.addListener
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    let info = {};
    // @ts-ignore
    info.request = JSON.stringify(request);
    // @ts-ignore
    info.sender = JSON.stringify(sender);
    // @ts-ignore
    info.sendResponse = JSON.stringify(sendResponse);

    if (request.action === "getDevToolsStatus") {
        // response needs to be in JSON format
        sendResponse({ data: isDevToolsOpen });
    } else if (request.action === "getConsoleLog") {
        chrome.debugger.attach(
            { tabId: request.tabId },
            version,
            onAttach.bind(null, request.tabId)
        );
    }
    return true;
});
