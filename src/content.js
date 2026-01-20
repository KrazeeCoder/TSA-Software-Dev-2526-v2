let recognition = null;
let isListening = false;

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
