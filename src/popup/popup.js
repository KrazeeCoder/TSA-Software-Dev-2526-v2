// Voice Navigator Popup Script

(function() {
  'use strict';

  const listenBtn = document.getElementById('listen-btn');
  const statusEl = document.getElementById('status');
  const responseEl = document.getElementById('response');
  const commandInput = document.getElementById('command-input');
  const sendBtn = document.getElementById('send-btn');

  let isListening = false;

  // Load saved response on open
  chrome.storage.local.get(['lastResponse'], function(result) {
    if (result.lastResponse) {
      responseEl.textContent = result.lastResponse;
    }
  });

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function setResponse(text) {
    responseEl.textContent = text;
    chrome.storage.local.set({ lastResponse: text });
  }

  function updateListenButton(listening) {
    isListening = listening;
    if (listening) {
      listenBtn.textContent = '⏹ Stop Listening';
      listenBtn.classList.add('listening');
      listenBtn.setAttribute('aria-label', 'Stop listening');
    } else {
      listenBtn.textContent = '🎤 Start Listening';
      listenBtn.classList.remove('listening');
      listenBtn.setAttribute('aria-label', 'Start voice input');
    }
  }

  function sendCommand(command) {
    if (!command.trim()) return;
    
    setStatus('Processing...');
    chrome.runtime.sendMessage({
      type: 'VOICE_COMMAND',
      command: command.trim()
    });
  }

  // Start/stop listening via content script
  async function toggleListening() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      setStatus('No active tab found');
      return;
    }

    // Check if we can access the tab
    if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
      setStatus('Cannot run on browser pages');
      return;
    }

    try {
      if (isListening) {
        await chrome.tabs.sendMessage(tab.id, { type: 'STOP_LISTENING' });
        updateListenButton(false);
        setStatus('Ready to assist');
      } else {
        // Inject content script if needed and start listening
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            if (window.__voiceNavigatorInitialized && window.toggleListening) {
              window.toggleListening();
            }
          }
        });
        updateListenButton(true);
        setStatus('Listening...');
      }
    } catch (err) {
      console.error('Error:', err);
      setStatus('Error: ' + err.message);
      updateListenButton(false);
    }
  }

  // Event listeners
  listenBtn.addEventListener('click', toggleListening);

  sendBtn.addEventListener('click', function() {
    sendCommand(commandInput.value);
    commandInput.value = '';
  });

  commandInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      sendCommand(commandInput.value);
      commandInput.value = '';
    }
  });

  // Listen for messages from background
  chrome.runtime.onMessage.addListener(function(message) {
    if (message.type === 'AI_RESPONSE') {
      setResponse(message.response);
      setStatus('Ready to assist');
      updateListenButton(false);
    } else if (message.type === 'VOICE_RESULT') {
      setStatus('You said: "' + message.transcript + '"');
      updateListenButton(false);
    } else if (message.type === 'VOICE_ERROR') {
      setStatus('Error: ' + message.error);
      updateListenButton(false);
    }
  });

  // Focus input on open
  commandInput.focus();

})();
