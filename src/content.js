let recognition = null;
let isListening = false;

function createPersistentPanel() {
  // Check if panel already exists
  if (document.getElementById('voice-navigator-panel')) {
    return;
  }

  const panel = document.createElement('div');
  panel.id = 'voice-navigator-panel';
  panel.innerHTML = `
    <div class="vn-header">
      <div class="vn-title">
        <span class="vn-icon">🎯</span>
        <span>Voice Navigator</span>
      </div>
      <div class="vn-controls">
        <button id="vn-minimize" class="vn-control-btn">−</button>
        <button id="vn-close" class="vn-control-btn">×</button>
      </div>
    </div>
    <div class="vn-content">
      <div class="vn-input-section">
        <div class="vn-input-wrapper">
          <input type="text" id="vn-command-input" placeholder="Ask me anything about this page...">
          <button id="vn-send" class="vn-send-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
          </button>
        </div>
      </div>
      
      <div class="vn-voice-section">
        <button id="vn-voice-btn" class="vn-voice-btn">
          <span class="vn-voice-icon">🎤</span>
          <span class="vn-voice-text">Start Voice</span>
        </button>
      </div>
      
      <div class="vn-response-section">
        <div class="vn-response-header">
          <span class="vn-response-label">AI Response</span>
          <button id="vn-clear" class="vn-clear-btn">Clear</button>
        </div>
        <div class="vn-response" id="vn-response">
          <div class="vn-placeholder">AI responses will appear here...</div>
        </div>
      </div>
    </div>
  `;

  // Add modern styles
  const style = document.createElement('style');
  style.textContent = `
    #voice-navigator-panel {
      position: fixed;
      top: 20px;
      right: 20px;
      width: 360px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 16px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.1);
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      backdrop-filter: blur(10px);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    
    #voice-navigator-panel:hover {
      box-shadow: 0 25px 50px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.15);
    }
    
    #voice-navigator-panel.minimized {
      height: 60px;
      overflow: hidden;
    }
    
    .vn-header {
      background: rgba(255,255,255,0.1);
      backdrop-filter: blur(10px);
      border-radius: 16px 16px 0 0;
      padding: 16px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: move;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    
    .vn-title {
      display: flex;
      align-items: center;
      gap: 8px;
      color: white;
      font-weight: 600;
      font-size: 15px;
    }
    
    .vn-icon {
      font-size: 18px;
    }
    
    .vn-controls {
      display: flex;
      gap: 8px;
    }
    
    .vn-control-btn {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: none;
      background: rgba(255,255,255,0.2);
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      transition: all 0.2s;
    }
    
    .vn-control-btn:hover {
      background: rgba(255,255,255,0.3);
      transform: scale(1.1);
    }
    
    .vn-content {
      padding: 20px;
      background: rgba(255,255,255,0.95);
      border-radius: 0 0 16px 16px;
    }
    
    .vn-input-section {
      margin-bottom: 16px;
    }
    
    .vn-input-wrapper {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    
    #vn-command-input {
      flex: 1;
      padding: 12px 16px;
      border: 2px solid #e5e7eb;
      border-radius: 12px;
      font-size: 14px;
      background: white;
      transition: all 0.2s;
      outline: none;
    }
    
    #vn-command-input:focus {
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }
    
    #vn-command-input::placeholder {
      color: #9ca3af;
    }
    
    .vn-send-btn {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      border: none;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }
    
    .vn-send-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 16px rgba(102, 126, 234, 0.3);
    }
    
    .vn-voice-section {
      margin-bottom: 16px;
    }
    
    #vn-voice-btn {
      width: 100%;
      padding: 14px;
      border: none;
      border-radius: 12px;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.2s;
    }
    
    #vn-voice-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 16px rgba(16, 185, 129, 0.3);
    }
    
    #vn-voice-btn.listening {
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      animation: pulse 2s infinite;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.8; }
    }
    
    .vn-voice-icon {
      font-size: 16px;
    }
    
    .vn-response-section {
      margin-top: 16px;
    }
    
    .vn-response-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    
    .vn-response-label {
      font-size: 12px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .vn-clear-btn {
      font-size: 12px;
      color: #6b7280;
      background: none;
      border: none;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 6px;
      transition: all 0.2s;
    }
    
    .vn-clear-btn:hover {
      background: #f3f4f6;
      color: #374151;
    }
    
    .vn-response {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 16px;
      min-height: 80px;
      max-height: 200px;
      overflow-y: auto;
      font-size: 14px;
      line-height: 1.5;
      color: #374151;
    }
    
    .vn-response::-webkit-scrollbar {
      width: 6px;
    }
    
    .vn-response::-webkit-scrollbar-track {
      background: #f1f1f1;
      border-radius: 3px;
    }
    
    .vn-response::-webkit-scrollbar-thumb {
      background: #c1c1c1;
      border-radius: 3px;
    }
    
    .vn-placeholder {
      color: #9ca3af;
      font-style: italic;
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(panel);

  // Make panel draggable
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  
  const header = panel.querySelector('.vn-header');
  
  header.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('vn-control-btn')) return;
    isDragging = true;
    dragOffset.x = e.clientX - panel.offsetLeft;
    dragOffset.y = e.clientY - panel.offsetTop;
    panel.style.transition = 'none';
  });
  
  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      panel.style.left = (e.clientX - dragOffset.x) + 'px';
      panel.style.top = (e.clientY - dragOffset.y) + 'px';
      panel.style.right = 'auto';
    }
  });
  
  document.addEventListener('mouseup', () => {
    isDragging = false;
    panel.style.transition = '';
  });

  // Control buttons
  const minimizeBtn = document.getElementById('vn-minimize');
  const closeBtn = document.getElementById('vn-close');
  
  minimizeBtn.addEventListener('click', () => {
    panel.classList.toggle('minimized');
    minimizeBtn.textContent = panel.classList.contains('minimized') ? '+' : '−';
  });
  
  closeBtn.addEventListener('click', () => {
    panel.remove();
  });

  // Clear button
  document.getElementById('vn-clear').addEventListener('click', () => {
    const responseDiv = document.getElementById('vn-response');
    responseDiv.innerHTML = '<div class="vn-placeholder">AI responses will appear here...</div>';
    chrome.storage.local.remove('lastResponse');
  });

  // Load saved data
  loadPanelData();
}

function loadPanelData() {
  chrome.storage.local.get(['lastCommand', 'lastResponse'], (result) => {
    if (result.lastResponse) {
      document.getElementById('vn-response').textContent = result.lastResponse;
    }
    if (result.lastCommand) {
      document.getElementById('vn-command-input').value = result.lastCommand;
    }
  });
}

function sendPanelCommand(command) {
  chrome.storage.local.set({ lastCommand: command });
  document.getElementById('vn-response').textContent = 'Processing...';
  
  chrome.runtime.sendMessage({
    type: 'VOICE_COMMAND',
    command: command
  });
}

// Initialize panel when page loads
createPersistentPanel();

// Panel event listeners
document.addEventListener('click', (e) => {
  if (e.target.id === 'vn-send' || e.target.closest('#vn-send')) {
    const input = document.getElementById('vn-command-input');
    const command = input.value.trim();
    if (command) {
      sendPanelCommand(command);
      input.value = '';
    }
  } else if (e.target.id === 'vn-voice-btn' || e.target.closest('#vn-voice-btn')) {
    const voiceBtn = document.getElementById('vn-voice-btn');
    const voiceText = voiceBtn.querySelector('.vn-voice-text');
    const voiceIcon = voiceBtn.querySelector('.vn-voice-icon');
    
    if (isListening) {
      chrome.runtime.sendMessage({ type: 'STOP_LISTENING' });
      voiceText.textContent = 'Start Voice';
      voiceIcon.textContent = '🎤';
      voiceBtn.classList.remove('listening');
      isListening = false;
    } else {
      chrome.runtime.sendMessage({ type: 'START_LISTENING' });
      voiceText.textContent = 'Stop Voice';
      voiceIcon.textContent = '🔴';
      voiceBtn.classList.add('listening');
      isListening = true;
    }
  }
});

document.addEventListener('keypress', (e) => {
  if (e.target.id === 'vn-command-input' && e.key === 'Enter') {
    const command = e.target.value.trim();
    if (command) {
      sendPanelCommand(command);
      e.target.value = '';
    }
  }
});

// Save input as user types
document.addEventListener('input', (e) => {
  if (e.target.id === 'vn-command-input') {
    chrome.storage.local.set({ lastCommand: e.target.value });
  }
});

// Listen for AI responses and voice events
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'AI_RESPONSE') {
    const responseDiv = document.getElementById('vn-response');
    responseDiv.textContent = message.response;
    chrome.storage.local.set({ lastResponse: message.response });
  } else if (message.type === 'VOICE_RESULT') {
    const voiceBtn = document.getElementById('vn-voice-btn');
    const voiceText = voiceBtn.querySelector('.vn-voice-text');
    const voiceIcon = voiceBtn.querySelector('.vn-voice-icon');
    voiceText.textContent = 'Start Voice';
    voiceIcon.textContent = '🎤';
    voiceBtn.classList.remove('listening');
    isListening = false;
  } else if (message.type === 'VOICE_ERROR') {
    const voiceBtn = document.getElementById('vn-voice-btn');
    const voiceText = voiceBtn.querySelector('.vn-voice-text');
    const voiceIcon = voiceBtn.querySelector('.vn-voice-icon');
    voiceText.textContent = 'Start Voice';
    voiceIcon.textContent = '🎤';
    voiceBtn.classList.remove('listening');
    isListening = false;
  }
});

function initSpeechRecognition() {
  if ('webkitSpeechRecognition' in window) {
    recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      isListening = true;
      console.log('Speech recognition started');
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      isListening = false;
      console.log('Speech result:', transcript);
      
      chrome.runtime.sendMessage({
        type: 'VOICE_COMMAND',
        command: transcript
      });
      
      chrome.runtime.sendMessage({
        type: 'VOICE_RESULT',
        transcript: transcript
      });
    };

    recognition.onerror = (event) => {
      isListening = false;
      console.error('Speech recognition error:', event.error);
      chrome.runtime.sendMessage({
        type: 'VOICE_ERROR',
        error: event.error
      });
    };

    recognition.onend = () => {
      isListening = false;
      console.log('Speech recognition ended');
    };
  } else {
    console.error('Speech recognition not supported');
  }
}

function extractPageStructure() {
  const structure = {
    title: document.title,
    url: window.location.href,
    headings: [],
    links: [],
    buttons: [],
    forms: [],
    landmarks: []
  };

  document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading, index) => {
    structure.headings.push({
      index,
      level: parseInt(heading.tagName.charAt(1)),
      text: heading.textContent.trim(),
      id: heading.id || null
    });
  });

  document.querySelectorAll('a[href]').forEach((link, index) => {
    structure.links.push({
      index,
      text: link.textContent.trim(),
      href: link.href,
      id: link.id || null
    });
  });

  document.querySelectorAll('button, input[type="button"], input[type="submit"]').forEach((button, index) => {
    structure.buttons.push({
      index,
      text: button.textContent.trim() || button.value || '',
      type: button.type || 'button',
      id: button.id || null
    });
  });

  document.querySelectorAll('form').forEach((form, index) => {
    const inputs = Array.from(form.querySelectorAll('input, textarea, select')).map(input => ({
      type: input.type || input.tagName.toLowerCase(),
      name: input.name || '',
      placeholder: input.placeholder || '',
      id: input.id || null
    }));
    
    structure.forms.push({
      index,
      action: form.action || '',
      method: form.method || 'get',
      inputs
    });
  });

  document.querySelectorAll('header, nav, main, footer, aside, section').forEach((landmark, index) => {
    structure.landmarks.push({
      index,
      tag: landmark.tagName.toLowerCase(),
      id: landmark.id || null,
      role: landmark.getAttribute('role') || null
    });
  });

  return structure;
}

function executeAction(action) {
  switch (action.type) {
    case 'click':
      if (action.selector) {
        const element = document.querySelector(action.selector);
        if (element) element.click();
      }
      break;
    
    case 'scroll':
      if (action.direction === 'down') {
        window.scrollBy(0, window.innerHeight * 0.8);
      } else if (action.direction === 'up') {
        window.scrollBy(0, -window.innerHeight * 0.8);
      }
      break;
    
    case 'fill':
      if (action.selector && action.value) {
        const element = document.querySelector(action.selector);
        if (element) {
          element.value = action.value;
          element.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
      break;
    
    case 'read':
      if (action.text) {
        chrome.runtime.sendMessage({
          type: 'SPEAK',
          text: action.text
        });
      }
      break;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message.type);
  
  if (message.type === 'PING') {
    sendResponse({ success: true });
    return true;
  } else if (message.type === 'START_LISTENING') {
    console.log('Starting speech recognition...');
    
    if (!recognition) {
      initSpeechRecognition();
    }
    
    if (recognition) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(() => {
          console.log('Microphone access granted');
          recognition.start();
          sendResponse({ success: true });
        })
        .catch((error) => {
          console.error('Microphone access denied:', error);
          sendResponse({ error: 'Microphone access denied' });
        });
    } else {
      console.error('Speech recognition not available');
      sendResponse({ error: 'Speech recognition not supported' });
    }
    return true;
  } else if (message.type === 'STOP_LISTENING') {
    console.log('Stopping speech recognition...');
    if (recognition && isListening) {
      recognition.stop();
    }
    sendResponse({ success: true });
  } else if (message.type === 'GET_PAGE_STRUCTURE') {
    sendResponse(extractPageStructure());
  } else if (message.type === 'EXECUTE_ACTION') {
    executeAction(message.action);
    sendResponse({ success: true });
  }
});

console.log('Content script loaded, initializing speech recognition...');
initSpeechRecognition();
