import './Popup.css';
import React, { useState, useEffect } from 'react';

function Popup() {

  const [notification, setNotification] = useState('');
  const [highlightedText, setHighlightedText] = useState('');
  const [factCheckResult, setFactCheckResult] = useState('');

  // Listen for notifications from background
  useEffect(() => {
    // Check if chrome.storage exists
    if (!chrome.storage?.local) {
      console.error('chrome.storage.local is not available');
      return;
    }

    // 1. Load stored highlighted text on popup open
    const loadStoredText = async () => {
      try {
        const result = await new Promise(resolve => 
          chrome.storage.local.get(['highlightedText'], resolve)
        );
        if (result.highlightedText) {
          setHighlightedText(result.highlightedText);
          console.log("storage - Loading stored result: ", result.highlightedText) // If text highlighted and popup not open
        }
      } catch (error) {
        console.error('Error loading highlighted text:', error);
      }
    };

    // 2. Load stored fact-check results
    const loadStoredResult = async () => {
      try {
        const result = await new Promise(resolve => 
          chrome.storage.local.get(['structuredFactCheckResult'], resolve)
        );
        if (result.structuredFactCheckResult) {
          setFactCheckResult(result.structuredFactCheckResult);
          console.log("storage - Loading stored fact check result: ", result.structuredFactCheckResult)
        }
      } catch (error) {
        console.error('Error loading structured fact check result:', error);
      }
    };

    loadStoredText();
    loadStoredResult();



    // Listen for real time messages from background script
    const messageListener = (message) => {
      if (message.action === "updateHighlightedText") {
        setHighlightedText(message.text);
        console.log("notif - Updated highlighted text:", message.text);
        chrome.storage.local.set({ highlightedText: message.text });
      }
      else if (message.action === "showStructuredResult") {
        setFactCheckResult(message.message);
        console.log("notif - Fact check result received:", message.message);
      }
      else if (message.action === "showNotification") {
        console.log("notif - show notification: ", message.message) // If button clicked
        setNotification(message.message);
      }
    }

    
    chrome.runtime.onMessage.addListener(messageListener);
    
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  // Handle button click to request fact check
  const handleFactCheck = () => {
    // Sent when button is clicked
    chrome.runtime.sendMessage({ action: "factCheckRequest" });
  };


  // Popup component ----------------------------------------
  return (
    <div className="Popup">
      <header className="popup-header">
        <h1>AI Fact Checker</h1>
      </header>

      <hr className="line" />

      <div className="content">
        <div className="highlighted-text-container">
          <h3>Highlighted Text:</h3>
          <div className={`highlighted-text-box ${highlightedText ? 'active-border' : ''}`}>
            {highlightedText || <span className="no-text-message">No text highlighted</span>}
          </div>
        </div>

        <button className="fact-check-button" onClick={handleFactCheck}>Fact Check</button>
        
        {notification && <div className="notification">{notification}</div>}

        <div className="accuracy-container">
          <div className="verdict-container">
            <label>VERDICT</label>
            <div className={`verdict-box ${factCheckResult.verdict ? `verdict-${factCheckResult.verdict.toLowerCase()}` : ''}`}>
              {factCheckResult.verdict}
            </div>
          </div>
          <div className="confidence-container">
            <label>CONFIDENCE</label>
            <div className="confidence-bar">
              {factCheckResult.confidence !== undefined ? 
                `${(factCheckResult.confidence * 100).toFixed(2)}%` : 
                ''}
            </div>
          </div>
        </div>

        <div className="explanation-container">
          <label>Explanation</label>
          <div className='explanation-box'>
            {factCheckResult.explanation || <span className="no-explanation">No explanation available</span>}
          </div>
        </div>

        <div className="sources-container">
          <label>SOURCES</label>
            <div className='sources-box'>
              {factCheckResult.sources && factCheckResult.sources.length > 0 ? (
                <ul>
                  {factCheckResult.sources.map((source, index) => (
                    <li key={index}>{source}</li>
                  ))}
                </ul>
              ) : (
                <span className="no-sources">No sources available</span>
              )}
            </div>
        </div>
      </div>
    </div>
  );
}

export default Popup;
