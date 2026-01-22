// Voice Navigator - Content Script
// Accessibility-first design for blind and low-vision users

(function() {
  'use strict';

  // Prevent multiple initializations
  if (window.__voiceNavigatorInitialized) return;
  window.__voiceNavigatorInitialized = true;

  // ============ STATE ============
  let recognition = null;
  let isListening = false;
  let continuousMode = false;

  // ============ AUDIO FEEDBACK ============
  
  function playTone(frequency, duration) {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.3;
      
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration / 1000);
    } catch (e) {
      // Audio not available, continue silently
    }
  }

  function playListeningStart() {
    playTone(800, 150);
    setTimeout(function() { playTone(1000, 150); }, 160);
  }

  function playListeningStop() {
    playTone(600, 200);
  }

  function playError() {
    playTone(300, 300);
  }

  function playReady() {
    playTone(500, 100);
  }

  // ============ SPEECH RECOGNITION ============

  function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error('Speech recognition not supported');
      return false;
    }

    recognition = new SpeechRecognition();
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = function() {
      isListening = true;
      updateUI('listening');
    };

    recognition.onresult = function(event) {
      const transcript = event.results[event.results.length - 1][0].transcript;
      console.log('Heard:', transcript);
      updateUI('processing', transcript);
      
      chrome.runtime.sendMessage({
        type: 'VOICE_COMMAND',
        command: transcript
      });
    };

    recognition.onerror = function(event) {
      console.error('Speech error:', event.error);
      
      // Don't stop on no-speech in continuous mode, just restart
      if (event.error === 'no-speech' && continuousMode) {
        return;
      }
      
      if (event.error === 'aborted') {
        return; // User stopped, don't show error
      }
      
      const errorMessages = {
        'not-allowed': 'Microphone access denied. Please allow microphone access in browser settings.',
        'no-speech': 'No speech detected. Try again.',
        'network': 'Network error. Check your connection.',
        'audio-capture': 'No microphone found. Please connect a microphone.'
      };
      
      playError();
      updateUI('error', errorMessages[event.error] || 'Voice error: ' + event.error);
    };

    recognition.onend = function() {
      console.log('Recognition ended, continuous:', continuousMode, 'listening:', isListening);
      
      // In continuous mode, restart listening after processing
      if (continuousMode && isListening) {
        setTimeout(function() {
          if (continuousMode && isListening) {
            try {
              recognition.start();
              playReady();
            } catch (e) {
              console.log('Restart failed:', e);
            }
          }
        }, 500);
      } else {
        isListening = false;
        updateUI('ready');
      }
    };

    return true;
  }

  function startListening() {
    if (!recognition && !initSpeechRecognition()) {
      updateUI('error', 'Speech recognition not supported in this browser.');
      return;
    }

    if (isListening) return;

    // Set continuous mode based on toggle
    const toggle = document.getElementById('vn-continuous');
    continuousMode = toggle ? toggle.checked : false;
    recognition.continuous = continuousMode;

    try {
      recognition.start();
      playListeningStart();
    } catch (e) {
      console.error('Start failed:', e);
      // Try to restart
      try {
        recognition.stop();
      } catch (stopErr) { /* ignore */ }
      
      setTimeout(function() {
        try {
          recognition.start();
          playListeningStart();
        } catch (retryErr) {
          updateUI('error', 'Could not start listening. Please refresh the page.');
        }
      }, 200);
    }
  }

  function stopListening() {
    continuousMode = false;
    isListening = false;
    
    if (recognition) {
      try {
        recognition.stop();
      } catch (e) { /* ignore */ }
    }
    
    playListeningStop();
    updateUI('ready');
  }

  function toggleListening() {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }

  // ============ UI MANAGEMENT ============

  function updateUI(state, message) {
    const button = document.getElementById('vn-btn');
    const status = document.getElementById('vn-status');
    
    if (!button || !status) return;

    switch (state) {
      case 'listening':
        button.textContent = '⏹ Stop';
        button.classList.add('vn-listening');
        button.setAttribute('aria-label', 'Stop listening');
        status.textContent = continuousMode ? 'Listening (continuous)...' : 'Listening...';
        break;
        
      case 'processing':
        button.classList.add('vn-listening');
        status.textContent = message ? 'You said: "' + message + '"' : 'Processing...';
        break;
        
      case 'error':
        button.textContent = '🎤 Listen';
        button.classList.remove('vn-listening');
        button.setAttribute('aria-label', 'Start voice input');
        status.textContent = message || 'Error occurred.';
        break;
        
      case 'ready':
      default:
        button.textContent = '🎤 Listen';
        button.classList.remove('vn-listening');
        button.setAttribute('aria-label', 'Start voice input');
        // Don't overwrite response text
        break;
    }
  }

  function setResponse(text) {
    const status = document.getElementById('vn-status');
    if (status && text) {
      status.textContent = text;
    }
  }

  // ============ PANEL CREATION ============

  function createPanel() {
    if (document.getElementById('voice-navigator-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'voice-navigator-panel';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Voice Navigator assistant');

    panel.innerHTML = `
      <button id="vn-toggle" class="vn-toggle" aria-expanded="true" aria-controls="vn-content">
        Voice Navigator
        <span class="vn-toggle-icon">▼</span>
      </button>
      <div id="vn-content" class="vn-content">
        <button id="vn-btn" class="vn-btn" aria-label="Start voice input">
          🎤 Listen
        </button>
        
        <div class="vn-option">
          <input type="checkbox" id="vn-continuous" class="vn-checkbox">
          <label for="vn-continuous" class="vn-label">Continuous conversation</label>
        </div>
        
        <div id="vn-status" class="vn-status" role="status" aria-live="polite">
          Ready. Click Listen or press Alt+V.
        </div>
        
        <button id="vn-close" class="vn-close" aria-label="Close Voice Navigator">
          Close
        </button>
      </div>
    `;

    const style = document.createElement('style');
    style.id = 'vn-styles';
    style.textContent = `
      #voice-navigator-panel {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 999999;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 16px;
      }

      .vn-toggle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: 12px 16px;
        background: #000;
        color: #fff;
        border: 3px solid #fff;
        border-radius: 8px 8px 0 0;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
      }

      .vn-toggle:hover,
      .vn-toggle:focus {
        background: #222;
      }

      .vn-toggle:focus {
        outline: 4px solid #ffff00;
        outline-offset: 2px;
      }

      .vn-toggle-icon {
        transition: transform 0.2s;
      }

      #voice-navigator-panel.collapsed .vn-toggle {
        border-radius: 8px;
      }

      #voice-navigator-panel.collapsed .vn-toggle-icon {
        transform: rotate(-90deg);
      }

      #voice-navigator-panel.collapsed .vn-content {
        display: none;
      }

      .vn-content {
        background: #000;
        border: 3px solid #fff;
        border-top: none;
        border-radius: 0 0 8px 8px;
        padding: 16px;
        min-width: 280px;
      }

      .vn-btn {
        display: block;
        width: 100%;
        padding: 20px;
        background: #006600;
        color: #fff;
        border: 3px solid #fff;
        border-radius: 8px;
        font-size: 20px;
        font-weight: 700;
        cursor: pointer;
        margin-bottom: 12px;
      }

      .vn-btn:hover,
      .vn-btn:focus {
        background: #008800;
      }

      .vn-btn:focus {
        outline: 4px solid #ffff00;
        outline-offset: 2px;
      }

      .vn-btn.vn-listening {
        background: #cc0000;
        animation: vn-pulse 1s infinite;
      }

      @keyframes vn-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }

      .vn-option {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 12px;
        padding: 10px;
        background: #111;
        border-radius: 6px;
      }

      .vn-checkbox {
        width: 22px;
        height: 22px;
        cursor: pointer;
        accent-color: #00aa00;
      }

      .vn-label {
        color: #fff;
        font-size: 15px;
        cursor: pointer;
      }

      .vn-status {
        background: #222;
        color: #fff;
        padding: 12px;
        border-radius: 6px;
        font-size: 16px;
        line-height: 1.4;
        margin-bottom: 12px;
        min-height: 60px;
        max-height: 150px;
        overflow-y: auto;
      }

      .vn-close {
        display: block;
        width: 100%;
        padding: 10px;
        background: transparent;
        color: #aaa;
        border: 2px solid #444;
        border-radius: 6px;
        font-size: 14px;
        cursor: pointer;
      }

      .vn-close:hover,
      .vn-close:focus {
        color: #fff;
        border-color: #666;
      }

      .vn-close:focus {
        outline: 4px solid #ffff00;
        outline-offset: 2px;
      }

      @media (prefers-reduced-motion: reduce) {
        .vn-btn.vn-listening {
          animation: none;
        }
        .vn-toggle-icon {
          transition: none;
        }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(panel);

    // Event listeners
    document.getElementById('vn-toggle').addEventListener('click', function() {
      panel.classList.toggle('collapsed');
      this.setAttribute('aria-expanded', !panel.classList.contains('collapsed'));
    });

    document.getElementById('vn-btn').addEventListener('click', toggleListening);

    document.getElementById('vn-close').addEventListener('click', function() {
      stopListening();
      panel.remove();
      document.getElementById('vn-styles').remove();
    });

    // Stop continuous mode when unchecked while listening
    document.getElementById('vn-continuous').addEventListener('change', function() {
      if (!this.checked && isListening) {
        continuousMode = false;
        recognition.continuous = false;
      }
    });
  }

  // ============ KEYBOARD SHORTCUTS ============

  function handleKeyboard(event) {
    // Alt+V to toggle listening
    if (event.altKey && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      toggleListening();
    }
    
    // Escape to stop listening
    if (event.key === 'Escape' && isListening) {
      event.preventDefault();
      stopListening();
    }
  }

  // ============ MESSAGE HANDLING ============

  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.type === 'AI_RESPONSE') {
      setResponse(message.response);
      // In continuous mode, keep listening state
      if (!continuousMode) {
        updateUI('ready');
      }
    } else if (message.type === 'PING') {
      sendResponse({ success: true });
    } else if (message.type === 'START_LISTENING') {
      startListening();
      sendResponse({ success: true });
    } else if (message.type === 'STOP_LISTENING') {
      stopListening();
      sendResponse({ success: true });
    }
    return true;
  });

  // ============ INITIALIZATION ============

  function init() {
    createPanel();
    initSpeechRecognition();
    document.addEventListener('keydown', handleKeyboard);
    console.log('Voice Navigator loaded');
  }

  // Wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
