// Voice Navigator Popup Script

(function() {
  'use strict';

  const listenBtn = document.getElementById('listen-btn');
  const statusEl = document.getElementById('status');
  const responseEl = document.getElementById('response');
  const commandInput = document.getElementById('command-input');
  const sendBtn = document.getElementById('send-btn');
  const continuousToggle = document.getElementById('continuous-toggle');

  let isListening = false;

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

  async function toggleListening() {
    try {
      if (isListening) {
        await chrome.runtime.sendMessage({ type: 'STOP_LISTENING' });
        updateListenButton(false);
        setStatus('Ready to assist');
      } else {
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

  chrome.runtime.onMessage.addListener(function(message) {
    if (message.type === 'AI_RESPONSE') {
      setResponse(message.response);
      setStatus('Ready to assist');
      if (!continuousToggle?.checked) updateListenButton(false);
    } else if (message.type === 'VOICE_STATUS') {
      if (message.status === 'listening') {
        updateListenButton(true);
      } else if (message.status === 'stopped') {
        updateListenButton(false);
      } else if (message.status === 'processing') {
        setStatus('You said: "' + (message.transcript || '') + '"');
      }
    } else if (message.type === 'VOICE_ERROR') {
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

  chrome.runtime.sendMessage({ type: 'GET_LISTENING_STATUS' }, function(response) {
    if (response?.status === 'listening') {
      updateListenButton(true);
      setStatus(continuousToggle?.checked ? 'Listening (continuous)...' : 'Listening...');
    }
  });

  commandInput.focus();
})();
