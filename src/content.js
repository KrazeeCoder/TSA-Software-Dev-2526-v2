// Voice Navigator - Content Script

// Immediately invoked function expression (IIFE) to encapsulate the script
(function() {
  'use strict';

  // Flag to prevent the script from running more than once on the same page
  if (window.__voiceNavigatorContent) return;
  window.__voiceNavigatorContent = true;

  // Speech recognition stuff
  let recognition = null;
  let isListening = false;
  let continuousMode = false;
  let permissionChecked = false;

  function initRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      // Browser doesn't support speech recognition
      chrome.runtime.sendMessage({ type: 'VOICE_ERROR', error: 'speech-not-supported' });
      return false;
    }

    recognition = new SpeechRecognition();
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = function() {
      isListening = true;
      chrome.runtime.sendMessage({ type: 'VOICE_STATUS', status: 'listening' });
    };

    // When hear something, send it to background script
    recognition.onresult = function(event) {
      const transcript = event.results[event.results.length - 1][0].transcript;
      chrome.runtime.sendMessage({ type: 'VOICE_STATUS', status: 'processing', transcript });
      chrome.runtime.sendMessage({ type: 'VOICE_COMMAND', command: transcript });
    };

    // Handle errors
    recognition.onerror = function(event) {
      if (event.error === 'no-speech' && continuousMode) return;
      if (event.error === 'aborted') return;
      chrome.runtime.sendMessage({ type: 'VOICE_ERROR', error: event.error });
    };

    // When listening stops, decide whether to start again
    recognition.onend = function() {
      if (continuousMode && isListening) {
        setTimeout(function() {
          if (continuousMode && isListening) {
            try { recognition.start(); } catch (e) {}
          }
        }, 300);
      } else {
        isListening = false;
        chrome.runtime.sendMessage({ type: 'VOICE_STATUS', status: 'stopped' });
      }
    };

    return true;
  }

  // Ask for microphone permission
  async function requestMicPermission() {
    if (permissionChecked) return true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      chrome.runtime.sendMessage({ type: 'VOICE_ERROR', error: 'audio-capture' });
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      permissionChecked = true;
      return true;
    } catch (e) {
      chrome.runtime.sendMessage({ type: 'VOICE_ERROR', error: 'not-allowed' });
      return false;
    }
  }

  // Start listening for voice commands
  async function startListening(continuous) {
    if (!recognition && !initRecognition()) return;
    if (isListening) return;

    continuousMode = !!continuous;
    recognition.continuous = continuousMode;

    const allowed = await requestMicPermission();
    if (!allowed) return;

    isListening = true;
    try {
      recognition.start();
    } catch (e) {
      try { recognition.stop(); } catch (err) {}
      setTimeout(function() {
        try { recognition.start(); } catch (err) {}
      }, 100);
    }
  }

  // Stop listening for voice commands
  function stopListening() {
    continuousMode = false;
    isListening = false;
    if (recognition) {
      try { recognition.stop(); } catch (e) {}
    }
    chrome.runtime.sendMessage({ type: 'VOICE_STATUS', status: 'stopped' });
  }

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.type === 'START_LISTENING') {
      startListening(message.continuous);
      sendResponse({ success: true });
    } else if (message.type === 'STOP_LISTENING') {
      stopListening();
      sendResponse({ success: true });
    }
    return true;
  });

  initRecognition();
})();


(function() {
  'use strict';

  if (window.__voiceNavigatorInitialized) return;
  window.__voiceNavigatorInitialized = true;

  let recognition = null;
  let isListening = false;
  let continuousMode = false;

  // SOUND EFFECTS 
  
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
      // Audio not available
    }
  }

  // Different sounds for different actions
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

  // SPEECH RECOGNITION

  // Set up speech recognition with browser's built-in stuff
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

    // When we start listening, update the UI
    recognition.onstart = function() {
      isListening = true;
      updateUI('listening');
    };

    // When hear something, send it to background script
    recognition.onresult = function(event) {
      const transcript = event.results[event.results.length - 1][0].transcript;
      console.log('Heard:', transcript);
      updateUI('processing', transcript);
      
      chrome.runtime.sendMessage({
        type: 'VOICE_COMMAND',
        command: transcript
      });
    };

    // Handle speech recognition errors
    recognition.onerror = function(event) {
      console.error('Speech error:', event.error);
      
      if (event.error === 'no-speech' && continuousMode) {
        return;
      }
      
      if (event.error === 'aborted') {
        return; 
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

  // Start listening for voice commands
  function startListening() {
    if (!recognition && !initSpeechRecognition()) {
      updateUI('error', 'Speech recognition not supported in this browser.');
      return;
    }

    if (isListening) return;

    const toggle = document.getElementById('vn-continuous');
    continuousMode = toggle ? toggle.checked : false;
    recognition.continuous = continuousMode;

    try {
      recognition.start();
      playListeningStart();
    } catch (e) {
      console.error('Start failed:', e);
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

  // Stop listening for voice commands
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

  // UI MANAGEMENT=

  // Update the button and status text based on what's happening
  function updateUI(state, message) {
    const button = document.getElementById('vn-btn');
    const status = document.getElementById('vn-status');
    
    if (!button || !status) return;

    switch (state) {
      case 'listening':
        button.textContent = 'Stop';
        button.classList.add('vn-listening');
        button.setAttribute('aria-label', 'Stop listening');
        status.textContent = continuousMode ? 'Listening (continuous)...' : 'Listening...';
        break;
        
      case 'processing':
        button.classList.add('vn-listening');
        status.textContent = message ? 'You said: "' + message + '"' : 'Processing...';
        break;
        
      case 'error':
        button.textContent = 'Listen';
        button.classList.remove('vn-listening');
        button.setAttribute('aria-label', 'Start voice input');
        status.textContent = message || 'Error occurred.';
        break;
        
      case 'ready':
      default:
        button.textContent = 'Listen';
        button.classList.remove('vn-listening');
        button.setAttribute('aria-label', 'Start voice input');
        break;
    }
  }

  function setResponse(text) {
    const status = document.getElementById('vn-status');
    if (status && text) {
      status.textContent = text;
    }
  }

  // PANEL CREATION

  async function loadTemplate() {
    try {
      const response = await fetch(chrome.runtime.getURL('src/template.html'));
      return await response.text();
    } catch (e) {
      console.error('Failed to load template:', e);
      return '';
    }
  }

  async function loadStyles() {
    try {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.type = 'text/css';
      link.href = chrome.runtime.getURL('src/styles.css');
      document.head.appendChild(link);
    } catch (e) {
      console.error('Failed to load styles:', e);
    }
  }

  // Create and show the voice control panel
  async function createPanel() {
    if (document.getElementById('voice-navigator-panel')) return;

    await loadStyles();
    const template = await loadTemplate();
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = template;
    const panel = tempDiv.firstElementChild;
    
    document.body.appendChild(panel);

    document.getElementById('vn-toggle').addEventListener('click', function() {
      panel.classList.toggle('collapsed');
      this.setAttribute('aria-expanded', !panel.classList.contains('collapsed'));
    });

    document.getElementById('vn-btn').addEventListener('click', toggleListening);

    document.getElementById('vn-close').addEventListener('click', function() {
      stopListening();
      panel.remove();
      const styles = document.querySelector('link[href*="styles.css"]');
      if (styles) styles.remove();
    });

    // Stop continuous mode when unchecked while listening
    document.getElementById('vn-continuous').addEventListener('change', function() {
      if (!this.checked && isListening) {
        continuousMode = false;
        recognition.continuous = false;
      }
    });
  }

  // KEYBOARD SHORTCUTS 

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

  // MESSAGE HANDLING

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.type === 'AI_RESPONSE') {
      setResponse(message.response);
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

  // INITIALIZATION

  // Set everything up when the page loads
  async function init() {
    await createPanel();
    initSpeechRecognition();
    document.addEventListener('keydown', handleKeyboard);
    console.log('Voice Navigator loaded');
  }

  // Wait for DOM to be ready before starting
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
