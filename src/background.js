// Background service scrupt

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY || '';

let conversationHistory = [];

let listeningState = 'stopped';

// Send updates to the popup so it knows what's happening
function broadcastToPopup(payload) {
  chrome.runtime.sendMessage(payload).catch(() => {});
}

async function callOpenAI(userCommand, pageStructure) {
  // Behavior of OpenAI
  const systemPrompt = `You are a friendly, conversational voice assistant helping users navigate web pages. You speak naturally like a helpful friend, not a robot.

Your personality:
- Warm and encouraging
- Concise but friendly
- You celebrate when you help successfully
- You apologize genuinely if you can't help

When responding, always return valid JSON with these fields:
{
  "action": "click" | "scroll" | "fill" | "read" | "list" | "navigate" | "none",
  "selector": "CSS selector if clicking/filling",
  "index": number (if multiple elements match),
  "value": "text to type or URL to go to",
  "direction": "up" | "down" (for scrolling),
  "response": "What you'll say out loud to the user - make this conversational!"
}

Examples of good conversational responses:
- "Sure thing! I'll click that link for you."
- "Scrolling down so you can see more of the page."
- "I found 5 links on this page. The first one is About Us, then Contact..."
- "Hmm, I couldn't find a search button, but I did see a menu icon you might want to try."
- "Great question! This page is about..."`;

  // Give OpenAI all the info about the current page so it can help
  const userPrompt = `Current page: "${pageStructure.title}"
URL: ${pageStructure.url}

What's on this page:
${pageStructure.headings?.length > 0 ? `Headings: ${pageStructure.headings.slice(0, 10).map(h => h.text).join(', ')}` : 'No headings found'}
${pageStructure.links?.length > 0 ? `Links (first 15): ${pageStructure.links.slice(0, 15).map((l, i) => `${i + 1}. "${l.text}"`).join(', ')}` : 'No links found'}
${pageStructure.buttons?.length > 0 ? `Buttons: ${pageStructure.buttons.slice(0, 10).map(b => b.text).join(', ')}` : 'No buttons found'}

Page content preview:
${pageStructure.bodyText?.slice(0, 2000) || 'No content available'}

User says: "${userCommand}"

Remember: Respond with valid JSON only. Make the "response" field sound natural and friendly!`;

  try {
    console.log('Calling OpenAI...');
    
    // Checking for API key
    if (!OPENAI_API_KEY) {
      return {
        action: 'none',
        response: "Oops! I don't have an API key configured yet. Please add your OpenAI key to the .env file."
      };
    }

    // Make API call to OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...conversationHistory.slice(-4),
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 500,
        temperature: 0.7
      })
    });

    // Check if the API call worked
    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI error:', errorText);
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();
    const aiText = data.choices[0]?.message?.content || '';
    
    console.log('AI response:', aiText);

    // Save this conversation so we can remember it later
    conversationHistory.push({ role: 'user', content: userCommand });
    conversationHistory.push({ role: 'assistant', content: aiText });
    
    // Keep the conversation short
    if (conversationHistory.length > 10) {
      conversationHistory = conversationHistory.slice(-6);
    }

    // Try to parse the response as JSON - if it fails, just use the text
    try {
      return JSON.parse(aiText);
    } catch {
      // If JSON parsing fails, treat as conversational response
      return {
        action: 'none',
        response: aiText.replace(/[{}"]/g, '').trim() || "I'm not sure how to help with that."
      };
    }
  } catch (error) {
    console.error('OpenAI error:', error);
    // Something went wrong, let user know
    return {
      action: 'none',
      response: "Sorry, I ran into a problem connecting to my brain. Can you try again?"
    };
  }
}

// Use text-to-speech to read the response out loud
function speak(text) {
  if (!text) return;
  chrome.tts.speak(text, {
    rate: 1.0,
    pitch: 1.0,
    volume: 1.0
  });
}

async function executeAction(tabId, action) {
  if (!action.action || action.action === 'none' || action.action === 'read' || action.action === 'list') {
    return;
  }

  // Inject script into page to perform action
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      function: (actionData) => {
        switch (actionData.action) {
          case 'click':
            // Try to click by CSS selector first
            if (actionData.selector) {
              const elements = document.querySelectorAll(actionData.selector);
              const el = elements[actionData.index || 0];
              if (el) {
                el.click();
                return true;
              }
            }
            // Try clicking by link text
            if (actionData.value) {
              const links = document.querySelectorAll('a, button');
              for (const link of links) {
                if (link.textContent.toLowerCase().includes(actionData.value.toLowerCase())) {
                  link.click();
                  return true;
                }
              }
            }
            break;

          case 'scroll':
            // Scroll the page up or down
            if (actionData.direction === 'down') {
              window.scrollBy({ top: window.innerHeight * 0.75, behavior: 'smooth' });
            } else if (actionData.direction === 'up') {
              window.scrollBy({ top: -window.innerHeight * 0.75, behavior: 'smooth' });
            }
            break;

          case 'fill':
            // Type text into a form field
            if (actionData.selector && actionData.value) {
              const el = document.querySelector(actionData.selector);
              if (el) {
                el.value = actionData.value;
                // Let the page know we changed something
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }
            break;

          case 'navigate':
            // Go to a different page or back/forward in history
            if (actionData.value === 'back') {
              window.history.back();
            } else if (actionData.value === 'forward') {
              window.history.forward();
            } else if (actionData.value) {
              window.location.href = actionData.value;
            }
            break;
        }
      },
      args: [action]
    });
  } catch (err) {
    console.error('Execute action error:', err);
  }
}

// Get information about the current page so OpenAI knows what's there
async function getPageStructure(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      function: () => {
        return {
          title: document.title,
          url: window.location.href,
          // Get the main headings on the page
          headings: [...document.querySelectorAll('h1,h2,h3,h4')].slice(0, 20).map((h, i) => ({
            index: i,
            level: parseInt(h.tagName[1]),
            text: h.textContent.trim().slice(0, 100)
          })),
          // Get all the links on the page
          links: [...document.querySelectorAll('a[href]')].filter(a => a.textContent.trim()).slice(0, 30).map((a, i) => ({
            index: i,
            text: a.textContent.trim().slice(0, 60),
            href: a.href
          })),
          // Get all the buttons on the page
          buttons: [...document.querySelectorAll('button, [role="button"], input[type="submit"]')].slice(0, 15).map((b, i) => ({
            index: i,
            text: (b.textContent.trim() || b.value || b.getAttribute('aria-label') || '').slice(0, 50)
          })),
          // Get some of the page text
          bodyText: document.body.innerText?.slice(0, 4000) || ''
        };
      }
    });
    return results[0]?.result || {};
  } catch {
    // If something goes wrong, return empty data
    return { title: '', url: '', headings: [], links: [], buttons: [], bodyText: '' };
  }
}

// Messages from other parts of the extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type) return;
  console.log('Background received:', message.type);

  //Voice command handler
  if (message.type === 'VOICE_COMMAND') {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
          speak("I can't see which page you're on.");
          return;
        }

        // Let the popup know its processing
        broadcastToPopup({
          type: 'VOICE_STATUS',
          status: 'processing',
          transcript: message.command
        });

        const pageStructure = await getPageStructure(tab.id);
        const result = await callOpenAI(message.command, pageStructure);
        
        await executeAction(tab.id, result);
        speak(result.response);

        broadcastToPopup({
          type: 'AI_RESPONSE',
          response: result.response
        });

      } catch (error) {
        console.error('Error:', error);
        speak("Sorry, something went wrong. Please try again.");
        broadcastToPopup({ type: 'VOICE_ERROR', error: 'processing-failed' });
      }
    })();
    return true;
  }

  // Update listening status
  if (message.type === 'VOICE_STATUS') {
    listeningState = message.status;
    broadcastToPopup(message);
    return true;
  }

  // Handle voice errors
  if (message.type === 'VOICE_ERROR') {
    listeningState = 'stopped';
    broadcastToPopup(message);
    return true;
  }

  // Start listening for voice commands
  if (message.type === 'START_LISTENING') {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) {
          broadcastToPopup({ type: 'VOICE_ERROR', error: 'no-tab' });
          sendResponse({ success: false });
          return;
        }

        // Tell content script to start listening
        await chrome.tabs.sendMessage(tab.id, {
          type: 'START_LISTENING',
          continuous: !!message.continuous
        });

        listeningState = 'listening';
        sendResponse({ success: true });
      } catch (err) {
        console.error('Start listening failed:', err);
        broadcastToPopup({ type: 'VOICE_ERROR', error: 'page-not-supported' });
        sendResponse({ success: false });
      }
    })();
    return true;
  }

  // Stop listening for voice commands
  if (message.type === 'STOP_LISTENING') {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          // Tell the content script to stop listening
          await chrome.tabs.sendMessage(tab.id, { type: 'STOP_LISTENING' });
        }
      } catch (err) {
        console.error('Stop listening failed:', err);
      } finally {
        listeningState = 'stopped';
        sendResponse({ success: true });
      }
    })();
    return true;
  }

  if (message.type === 'GET_LISTENING_STATUS') {
    sendResponse({ status: listeningState });
    return true;
  }

  if (message.type === 'SPEAK') {
    speak(message.text);
  }
});

// Let devs know when the background script is ready
console.log('Background loaded. API key:', OPENAI_API_KEY ? 'configured' : 'missing');
