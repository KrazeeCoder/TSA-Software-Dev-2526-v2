// Voice Navigator Popup Script
// This runs when you click the extension icon in the toolbar

(function() {
  'use strict';

  // Get all the UI elements we need to work with
  const listenBtn = document.getElementById('listen-btn');
  const statusEl = document.getElementById('status');
  const responseEl = document.getElementById('response');
  const commandInput = document.getElementById('command-input');
  const sendBtn = document.getElementById('send-btn');
  const continuousToggle = document.getElementById('continuous-toggle');

  // Keep track of whether we're currently listening
  let isListening = false;

  // Load the last response so user can see what happened last time
  chrome.storage.local.get(['lastResponse'], function(result) {
    if (result.lastResponse) {
      responseEl.textContent = result.lastResponse;
    }
  });

  // Helper functions to update the UI
  function setStatus(text) {
    statusEl.textContent = text;
  }

  function setResponse(text) {
    responseEl.textContent = text;
    // Save the response so we can show it next time
    chrome.storage.local.set({ lastResponse: text });
  }

  // Update the listen button based on whether we're listening
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

  // Send a voice command to the background script
  function sendCommand(command) {
    if (!command.trim()) return;
    setStatus('Processing...');
    chrome.runtime.sendMessage({
      type: 'VOICE_COMMAND',
      command: command.trim()
    });
  }

  // Start or stop listening for voice commands
  async function toggleListening() {
    try {
      if (isListening) {
        // Stop listening
        await chrome.runtime.sendMessage({ type: 'STOP_LISTENING' });
        updateListenButton(false);
        setStatus('Ready to assist');
      } else {
        // Start listening
        const continuous = !!continuousToggle?.checked;
        await chrome.runtime.sendMessage({ type: 'START_LISTENING', continuous });
        updateListenButton(true);
        setStatus(continuous ? 'Listening (continuous)...' : 'Listening...');
      }
    } catch (err) {
      console.error('Error:', err);
      setStatus('Error: ' + err.message);
      updateListenButton(false);
    }
  }

  // Set up all the event listeners
  
  // Click the big listen button to toggle listening
  listenBtn.addEventListener('click', toggleListening);

  // Click send button or press Enter to send text command
  sendBtn.addEventListener('click', function() {
    sendCommand(commandInput.value);
    commandInput.value = '';
  });

  // Allow sending commands with Enter key
  commandInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      sendCommand(commandInput.value);
      commandInput.value = '';
    }
  });

  // Listen for messages from the background script
  chrome.runtime.onMessage.addListener(function(message) {
    if (message.type === 'AI_RESPONSE') {
      // Show what the AI said
      setResponse(message.response);
      setStatus('Ready to assist');
      if (!continuousToggle?.checked) updateListenButton(false);
    } else if (message.type === 'VOICE_STATUS') {
      // Update based on what's happening with voice recognition
      if (message.status === 'listening') {
        updateListenButton(true);
      } else if (message.status === 'stopped') {
        updateListenButton(false);
      } else if (message.status === 'processing') {
        setStatus('You said: "' + (message.transcript || '') + '"');
      }
    } else if (message.type === 'VOICE_ERROR') {
      // Show friendly error messages
      const errors = {
        'not-allowed': 'Microphone access denied for this site.',
        'audio-capture': 'No microphone found.',
        'no-speech': 'No speech detected.',
        'speech-not-supported': 'Speech recognition not supported.',
        'page-not-supported': 'This page does not allow mic access.',
        'no-tab': 'No active tab found.',
        'processing-failed': 'Error processing your request.'
      };
      setStatus(errors[message.error] || ('Error: ' + message.error));
      updateListenButton(false);
    }
  });

  // Check if we're already listening when the popup opens
  chrome.runtime.sendMessage({ type: 'GET_LISTENING_STATUS' }, function(response) {
    if (response?.status === 'listening') {
      updateListenButton(true);
      setStatus(continuousToggle?.checked ? 'Listening (continuous)...' : 'Listening...');
    }
  });

  // Focus on the input field so user can start typing right away
  commandInput.focus();
})();
