document.addEventListener('DOMContentLoaded', () => {
  const listenBtn = document.getElementById('listen');
  const status = document.getElementById('status');
  let isListening = false;

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
    }
  });
});
