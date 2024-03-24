// Chrome automatically creates a background.html page for this to execute.
// This can access the inspected page via executeScript
//
// Can use:
// chrome.tabs.*
// chrome.extension.*
var version = "1.0";
// When devtools opens, this gets connected
chrome.runtime.onMessage.addListener(function (port) {
    var extensionListener = function (message, sender, sendResponse) {
        if (message.action === "downloadHARlog") {
            console.log({ message: message, port: port });
            port.postMessage(message);
        }
        else {
            console.log("Not downloading HAR: ", message);
            sendResponse(message);
        }
    };
    // Listens to messages sent from the panel
    chrome.extension.onRequest.addListener(extensionListener);
    port.onDisconnect.addListener(function () {
        chrome.extension.onRequest.removeListener(extensionListener);
    });
});
var gTabId;
var logData = [];
function onEvent(source, _method, params) {
    if (gTabId != source.tabId)
        return;
    if (params) {
        logData.push(params);
    }
}
function onAttach(tabId) {
    gTabId = tabId;
    if (chrome.runtime.lastError) {
        return;
    }
    // use Log.enable and go from there
    chrome.debugger.sendCommand({ tabId: tabId }, "Log.enable");
    chrome.debugger.onEvent.addListener(onEvent);
    setTimeout(function () {
        var harBLOB = new Blob([JSON.stringify(logData)]);
        var url = URL.createObjectURL(harBLOB);
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
var openCount = 0;
var isDevToolsOpen = false;
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
    var info = {};
    // @ts-ignore
    info.request = JSON.stringify(request);
    // @ts-ignore
    info.sender = JSON.stringify(sender);
    // @ts-ignore
    info.sendResponse = JSON.stringify(sendResponse);
    if (request.action === "getDevToolsStatus") {
        // response needs to be in JSON format
        sendResponse({ data: isDevToolsOpen });
    }
    else if (request.action === "getConsoleLog") {
        chrome.debugger.attach({ tabId: request.tabId }, version, onAttach.bind(null, request.tabId));
    }
    return true;
});
