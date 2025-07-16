chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background script received message:", message);
//   console.log("Sender:", sender);
//   sendResponse ({ response: "Hi from bg" });
});


let lastSelectedText = '';

// Listen for text selections from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "textSelected") {
    lastSelectedText = message.text;
    // Logged when text is highlighted
    console.log("Text highlighted:", lastSelectedText);
    // Try send to popup
    try {
      chrome.runtime.sendMessage({
        action: "updateHighlightedText",
        text: message.text
      });
      } catch (e) {
        console.log('Popup closed, ignore');
      }
  }
});


// Listen for button click in popup
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "factCheckRequest") {
    console.log("Button pressed in popup");
    handleFactCheckRequest();
  }
});

// Listen for hotkey
chrome.commands.onCommand.addListener((command) => {
  if (command === "open-popup-hotkey") {
    console.log("Hotkey pressed");
    chrome.action.openPopup();
  }
});


// Unified handler for both button and hotkey
async function handleFactCheckRequest() {
  chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
    if (!tabs.length) return;
    
    // Try to get fresh selection from content script
    chrome.tabs.sendMessage(tabs[0].id, {action: "getSelectedText"}, async (response) => { //replace get straight from storage
      const text = (response && response.text) || lastSelectedText;

      if (!text) {
        const result = "No text selected! Highlight text first.";
        console.log('no text') // logs in console if button pressed with no text
        chrome.runtime.sendMessage({
          action: "showNotification",
          message: result
        });
        chrome.storage.local.set({lastFactCheckResult: result});
        return;
      }

      // const result = `${text}`;

      // Show checking notification immediately
      const checkingMsg = `Checking: ${text.substring(0, 100)}...`;
      console.log("checking message");
      // note: replace with separate notification
      chrome.runtime.sendMessage({
        action: "showResults",
        message: checkingMsg
      });
      chrome.storage.local.set({lastFactCheckResult: checkingMsg});
      
      
      // // Store result for popup when it opens later
      // chrome.storage.local.set({lastFactCheckResult: result});
      // console.log("Storing fact check result:", result);    // Sent when button is clicked

      try {
        // Call backend API
        const factCheck = await callFactCheckAPI(text);
        // const resultMsg = 'Fact check result: ' + factCheck;

        chrome.runtime.sendMessage({
          action: "showStructuredResult",
          message: factCheck
        });
        console.log("factCheck:", factCheck); // object
        chrome.storage.local.set({structuredFactCheckResult: factCheck});

      } catch (error) {
        console.error("Fact check failed:", error);
      }

    });
  });
}

async function callFactCheckAPI(text) {
  console.log("function ran")
  const response = await fetch('http://localhost:3001/fact-check', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ text })
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  console.log("RESPONSE:", response)  // some weird response object
  const data = await response.json();
  console.log("DATA", data) // result json
  return data.result; // returns text portion
}

// // Handle text results from content script, temporary notification
// function handleTextResult(text) {
//   if (text) {
//     showNotification(`"${text.substring(0, 30)}..."`);
//   } else {
//     showNotification("No text selected! Highlight text first.");
//   }
//   console.log("Handling text result:", text);
//     // Here you would typically send the text to your backend for processing
// }

// function showNotification(message) {
//   chrome.runtime.sendMessage({
//     action: "showNotification",
//     message: message
//   });
// }





// Inject content script into all tabs on install
chrome.runtime.onInstalled.addListener(async () => {
  // Re-inject the content script into all active tabs
  for (const cs of chrome.runtime.getManifest().content_scripts) {
    for (const tab of await chrome.tabs.query({url: cs.matches})) {
      chrome.scripting.executeScript({
        target: {tabId: tab.id},
        files: cs.js,
      });
    }
  }
});



