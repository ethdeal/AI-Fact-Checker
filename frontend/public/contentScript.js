// chrome.runtime.sendMessage(
//   "hi",
//   response => {
//     console.log("Response from background script:", response);
//   }
// )


// Listen for selection changes
document.addEventListener('mouseup', handleTextSelection);
document.addEventListener('keyup', handleTextSelection);

let lastSentText = ''; // To avoid sending the same text multiple times

// updates highlighted text box
function handleTextSelection() {
  const selectedText = window.getSelection().toString().trim();
  if (selectedText !== lastSentText) { // unhighlight to stop spam
    lastSentText = selectedText;
    console.log("handling text selection") // logs on page
    // context invalidated error if old page
    try {
      chrome.runtime.sendMessage({ 
        action: "textSelected", 
        text: selectedText 
      })    // Sent every time text is highlighted
    } catch (error) {
      console.error('Error sending selected text:', error);
    }
    chrome.storage.local.set({ highlightedText: selectedText });
  }
}

// Listen for requests from popup/background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getSelectedText") {
    console.log("getting selected text"); // logs on page when button/hotkey pressed
    const selectedText = window.getSelection().toString().trim();
    sendResponse({ text: selectedText });
  }
}); //lowkey might not need this one