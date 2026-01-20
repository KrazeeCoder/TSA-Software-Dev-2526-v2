document.addEventListener('DOMContentLoaded', () => {
  const listenBtn = document.getElementById('listen');
  const status = document.getElementById('status');
  const aiText = document.getElementById('ai-text');
  const commandInput = document.getElementById('command-input');
  const sendCommandBtn = document.getElementById('send-command');
  let isListening = false;

  // Prevent popup from closing when clicking outside
  document.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Keep popup focused
  commandInput.focus();
  
  // Prevent popup from losing focus
  window.addEventListener('blur', () => {
    setTimeout(() => {
      window.focus();
      commandInput.focus();
    }, 100);
  });

  // Load saved data on startup
  function loadSavedData() {
    chrome.storage.local.get(['lastCommand', 'lastResponse', 'commandHistory'], (result) => {
      if (result.lastResponse) {
        aiText.textContent = result.lastResponse;
      }
      if (result.lastCommand) {
        commandInput.value = result.lastCommand;
        commandInput.focus();
      }
    });
  }

  // Save data to storage
  function saveResponse(response) {
    chrome.storage.local.set({ lastResponse: response });
  }

  function saveCommand(command) {
    chrome.storage.local.set({ lastCommand: command });
  }

  // Load saved data when popup opens
  loadSavedData();

  // Fallback: ensure panel is created when popup opens
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        function: () => {
          // This will trigger the content script to create the panel
          if (typeof createPersistentPanel === 'function') {
            createPersistentPanel();
          }
        }
      });
    }
  });

  async function ensureContentScript(tabId) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'PING' });
      return true;
    } catch {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['assets/content.js-CbLx4GXE.js']
        });
        return true;
      } catch (error) {
        console.error('Failed to inject content script:', error);
        return false;
      }
    }
  }

  function sendCommand(command) {
    saveCommand(command);
    status.textContent = `Sending: "${command}"`;
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.runtime.sendMessage({
          type: 'VOICE_COMMAND',
          command: command
        });
      }
    });
  }

  // Text input event listeners
  sendCommandBtn.addEventListener('click', () => {
    const command = commandInput.value.trim();
    if (command) {
      sendCommand(command);
      commandInput.value = '';
    }
  });

  commandInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const command = commandInput.value.trim();
      if (command) {
        sendCommand(command);
        commandInput.value = '';
      }
    }
  });

  // Save input as user types
  commandInput.addEventListener('input', (e) => {
    saveCommand(e.target.value);
  });

  // Panel injection button
  document.getElementById('inject-panel').addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          files: ['assets/content.js-cFtuki2b.js']
        }).then(() => {
          // Wait a bit then try to create panel
          setTimeout(() => {
            chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              function: () => {
                if (typeof createPersistentPanel === 'function') {
                  createPersistentPanel();
                }
              }
            });
          }, 100);
        });
      }
    });
  });

  listenBtn.addEventListener('click', async () => {
    if (isListening) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'STOP_LISTENING' });
        }
      });
      isListening = false;
      listenBtn.textContent = 'Start Listening';
      status.textContent = 'Click to speak a command';
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (!tabs[0]) {
          status.textContent = 'No active tab found';
          return;
        }
        
        const tabId = tabs[0].id;
        const scriptReady = await ensureContentScript(tabId);
        
        if (!scriptReady) {
          status.textContent = 'Cannot load content script on this page';
          return;
        }
        
        chrome.tabs.sendMessage(tabId, { type: 'START_LISTENING' }, (response) => {
          if (chrome.runtime.lastError) {
            status.textContent = `Error: ${chrome.runtime.lastError.message}`;
            return;
          }
          
          if (response && response.success) {
            isListening = true;
            listenBtn.textContent = 'Stop Listening';
            status.textContent = 'Listening...';
          } else {
            status.textContent = response ? response.error : 'Failed to start listening';
          }
        });
      });
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'VOICE_RESULT') {
      status.textContent = `You said: "${message.transcript}"`;
      isListening = false;
      listenBtn.textContent = 'Start Listening';
    } else if (message.type === 'VOICE_ERROR') {
      status.textContent = `Error: ${message.error}`;
      isListening = false;
      listenBtn.textContent = 'Start Listening';
    } else if (message.type === 'AI_RESPONSE') {
      aiText.textContent = message.response;
      saveResponse(message.response);
    }
  });
});
