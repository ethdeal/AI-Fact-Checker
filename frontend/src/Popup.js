import './Popup.css';
import React, { useState, useEffect, useRef } from 'react';

const ENABLE_NEW_HIGHLIGHT_BORDER_ANIMATION = true;

const normalizeText = (text) => (
  typeof text === 'string' ? text.trim().replace(/\s+/g, ' ') : ''
);

function Popup() {

  const [notification, setNotification] = useState('');
  const [highlightedText, setHighlightedText] = useState('');
  const [factCheckResult, setFactCheckResult] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [shouldAnimateConfidence, setShouldAnimateConfidence] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isClaimTruncated, setIsClaimTruncated] = useState(false);
  const [isClaimTooltipVisible, setIsClaimTooltipVisible] = useState(false);
  const infoButtonWrapperRef = useRef(null);
  const claimTextRef = useRef(null);

  const getConfidenceFillWidth = (confidence) => {
    if (typeof confidence !== 'number') return 0;
    if (confidence < 0.2) return 20;
    if (confidence < 0.4) return 40;
    if (confidence < 0.6) return 60;
    if (confidence < 0.8) return 80;
    return 100;
  };
  const confidenceFillWidth = getConfidenceFillWidth(factCheckResult.confidence);
  const normalizedHighlightedText = normalizeText(highlightedText);
  const normalizedClaim = normalizeText(factCheckResult?.claim);
  const hasNewHighlightedText = Boolean(normalizedHighlightedText) && normalizedHighlightedText !== normalizedClaim;
  const shouldAnimateHighlightedText = ENABLE_NEW_HIGHLIGHT_BORDER_ANIMATION && hasNewHighlightedText;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!infoButtonWrapperRef.current?.contains(event.target)) {
        setIsInfoOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    let frameId;

    const checkClaimOverflow = () => {
      if (!claimTextRef.current) {
        setIsClaimTruncated(false);
        setIsClaimTooltipVisible(false);
        return;
      }

      const truncated = claimTextRef.current.scrollWidth > claimTextRef.current.clientWidth;
      setIsClaimTruncated(truncated);

      if (!truncated) {
        setIsClaimTooltipVisible(false);
      }
    };

    frameId = window.requestAnimationFrame(checkClaimOverflow);
    window.addEventListener('resize', checkClaimOverflow);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', checkClaimOverflow);
    };
  }, [factCheckResult.claim]);

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
          setShouldAnimateConfidence(false);
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
        setShouldAnimateConfidence(true);
        setIsChecking(false);
        console.log("notif - Fact check result received:", message.message);
      }
      else if (message.action === "showNotification") {
        console.log("notif - show notification: ", message.message) // If button clicked
        setIsChecking(false);
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
    setIsChecking(true);
    chrome.runtime.sendMessage({ action: "factCheckRequest" });
  };


  // Popup component ----------------------------------------
  return (
    <div className="Popup">
      <header className="popup-header">
        <h1>AI Fact Checker</h1>
        <div className="header-actions">
          <div className="info-button-wrapper" ref={infoButtonWrapperRef}>
            <button
              type="button"
              className={`info-button ${isInfoOpen ? 'info-button-open' : ''}`}
              onClick={() => setIsInfoOpen((previous) => !previous)}
              aria-label="Quick guide"
              aria-expanded={isInfoOpen}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 10v6" />
                <circle cx="12" cy="7.25" r="0.75" className="info-button-dot" />
              </svg>
            </button>
            {!isInfoOpen && <div className="info-button-tooltip">Quick guide</div>}
            {isInfoOpen && (
              <div className="floating-panel info-popover">
                <p>Highlight text on any page.</p>
                <p>Open the popup or press Ctrl+Shift+L.</p>
                <p>Click Fact Check to verify.</p>
              </div>
            )}
          </div>
        </div>
      </header>

      <hr className="line" />

      <div className="content">
        <div className="highlighted-text-container">
          {/* <h3>Highlighted Text:</h3> */}
          <div className={`highlighted-text-box ${shouldAnimateHighlightedText ? 'highlighted-text-box-animated' : ''}`}>
            {highlightedText || <span className="no-text-message">Highlight text to begin</span>}
          </div>
        </div>

        <button
          className="fact-check-button"
          onClick={handleFactCheck}
          disabled={isChecking}
        >
          {isChecking ? 'Checking...' : 'Fact Check'}
        </button>
        
        {notification && <div className="notification">{notification}</div>}

        <div className="claim-container">
          <label>CLAIM</label>
          <div className='claim-box'>
            {factCheckResult.claim ? (
              <div
                className="claim-tooltip-wrapper"
                onMouseEnter={() => {
                  if (isClaimTruncated) {
                    setIsClaimTooltipVisible(true);
                  }
                }}
                onMouseLeave={() => setIsClaimTooltipVisible(false)}
              >
                <span ref={claimTextRef} className="claim-text">
                  {factCheckResult.claim}
                </span>
                {isClaimTruncated && isClaimTooltipVisible && (
                  <div className="floating-panel claim-tooltip">
                    {factCheckResult.claim}
                  </div>
                )}
              </div>
            ) : (
              <span className="no-claim">No claim available</span>
            )}
            {/* {"this is a test claim"} */}
          </div>
        </div>

        <div className="accuracy-container">
          <div className="verdict-container">
            <label>VERDICT</label>
            <div className={`verdict-box ${factCheckResult.verdict ? `verdict-${factCheckResult.verdict.toLowerCase()}` : ''}`}>
              {factCheckResult.verdict}
            </div>
            {/* <div className={'verdict-box verdict-unknown'}>
              {"Unknown"}
            </div> */}
          </div>
          <div className="confidence-container">
            <label>CONFIDENCE</label>
            <div
              className="confidence-bar"
              style={{ '--confidence-fill-width': `${confidenceFillWidth}%` }}
            >
              <div className={`confidence-fill ${shouldAnimateConfidence ? 'animate-confidence' : ''}`} />
            </div>
            {/* <div
              className="confidence-bar"
              style={{ '--confidence-fill-width': `20%` }}
            >
              <div className="confidence-fill" />
            </div> */}
          </div>
        </div>

        <div className="explanation-container">
          <label>Explanation</label>
          <div className='explanation-box'>
            {factCheckResult.explanation || <span className="no-explanation">No explanation available</span>}
            {/* {"test explanation "} */}
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
