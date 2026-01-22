// Background service worker
// Handles: OpenAI API processing, TTS output, message coordination

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY || '';
let conversationHistory = [];

async function callOpenAI(userCommand, pageStructure) {
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
    
    if (!OPENAI_API_KEY) {
      return {
        action: 'none',
        response: "Oops! I don't have an API key configured yet. Please add your OpenAI key to the .env file."
      };
    }

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

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI error:', errorText);
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();
    const aiText = data.choices[0]?.message?.content || '';
    
    console.log('AI response:', aiText);

    // Save to conversation history
    conversationHistory.push({ role: 'user', content: userCommand });
    conversationHistory.push({ role: 'assistant', content: aiText });
    
    // Keep history manageable
    if (conversationHistory.length > 10) {
      conversationHistory = conversationHistory.slice(-6);
    }

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
    return {
      action: 'none',
      response: "Sorry, I ran into a problem connecting to my brain. Can you try again?"
    };
  }
}

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

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      function: (actionData) => {
        switch (actionData.action) {
          case 'click':
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
            if (actionData.direction === 'down') {
              window.scrollBy({ top: window.innerHeight * 0.75, behavior: 'smooth' });
            } else if (actionData.direction === 'up') {
              window.scrollBy({ top: -window.innerHeight * 0.75, behavior: 'smooth' });
            }
            break;

          case 'fill':
            if (actionData.selector && actionData.value) {
              const el = document.querySelector(actionData.selector);
              if (el) {
                el.value = actionData.value;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }
            break;

          case 'navigate':
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

async function getPageStructure(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      function: () => {
        return {
          title: document.title,
          url: window.location.href,
          headings: [...document.querySelectorAll('h1,h2,h3,h4')].slice(0, 20).map((h, i) => ({
            index: i,
            level: parseInt(h.tagName[1]),
            text: h.textContent.trim().slice(0, 100)
          })),
          links: [...document.querySelectorAll('a[href]')].filter(a => a.textContent.trim()).slice(0, 30).map((a, i) => ({
            index: i,
            text: a.textContent.trim().slice(0, 60),
            href: a.href
          })),
          buttons: [...document.querySelectorAll('button, [role="button"], input[type="submit"]')].slice(0, 15).map((b, i) => ({
            index: i,
            text: (b.textContent.trim() || b.value || b.getAttribute('aria-label') || '').slice(0, 50)
          })),
          bodyText: document.body.innerText?.slice(0, 4000) || ''
        };
      }
    });
    return results[0]?.result || {};
  } catch {
    return { title: '', url: '', headings: [], links: [], buttons: [], bodyText: '' };
  }
}

// Main message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received:', message.type);

  if (message.type === 'VOICE_COMMAND') {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
          speak("I can't see which page you're on.");
          return;
        }

        const pageStructure = await getPageStructure(tab.id);
        const result = await callOpenAI(message.command, pageStructure);
        
        await executeAction(tab.id, result);
        speak(result.response);

        chrome.runtime.sendMessage({
          type: 'AI_RESPONSE',
          response: result.response
        }).catch(() => {});

      } catch (error) {
        console.error('Error:', error);
        speak("Sorry, something went wrong. Please try again.");
      }
    })();
    return true;
  }

  if (message.type === 'SPEAK') {
    speak(message.text);
  }
});

console.log('Background loaded. API key:', OPENAI_API_KEY ? 'configured' : 'missing');
