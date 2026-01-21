// Background service worker
// Handles: OpenAI API processing, TTS output, message coordination

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY || '';
let conversationContext = [];

// Consistent response schema for all AI responses
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: ["click", "scroll", "fill", "read", "list", "navigate"],
      description: "The action to perform"
    },
    selector: {
      type: "string",
      description: "CSS selector for the target element"
    },
    index: {
      type: "number",
      description: "Index of element if multiple matches"
    },
    value: {
      type: "string",
      description: "Value for fill actions"
    },
    direction: {
      type: "string",
      enum: ["up", "down"],
      description: "Scroll direction"
    },
    text: {
      type: "string",
      description: "Text content to read aloud"
    },
    response: {
      type: "string",
      description: "Human-friendly response to speak to the user"
    }
  },
  required: ["action", "response"]
};

async function callOpenAI(userCommand, pageStructure) {
  const systemPrompt = `You are an AI assistant helping visually impaired users navigate web pages using voice commands.

Your job is to:
1. Understand what the user wants to do
2. Analyze the page structure to find the right elements
3. Return a structured action response

Available actions:
- "click": Click on a link, button, or interactive element
- "scroll": Scroll the page up or down
- "fill": Fill in a form field
- "read": Read content aloud to the user
- "list": List available elements (links, buttons, headings)
- "navigate": Go to a URL, go back, or go forward

Always provide helpful, concise responses. If you can't find what the user is looking for, explain what you found instead.`;

  const userPrompt = `Page Information:
Title: ${pageStructure.title}
URL: ${pageStructure.url}

Page Content Summary:
${pageStructure.bodyText?.slice(0, 3000) || 'No content available'}

Available Elements:
- Headings: ${JSON.stringify(pageStructure.headings?.slice(0, 20) || [])}
- Links: ${JSON.stringify(pageStructure.links?.slice(0, 30) || [])}
- Buttons: ${JSON.stringify(pageStructure.buttons?.slice(0, 20) || [])}

Previous context: ${conversationContext.slice(-3).join(' | ')}

User command: "${userCommand}"

Respond with a JSON object matching the required schema.`;

  try {
    console.log('Making OpenAI API call...');
    
    if (!OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured. Add VITE_OPENAI_API_KEY to your .env file.');
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
          { role: 'user', content: userPrompt }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'navigation_action',
            strict: true,
            schema: RESPONSE_SCHEMA
          }
        },
        max_tokens: 500,
        temperature: 0.3
      })
    });

    console.log('OpenAI response status:', response.status);

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenAI API error response:', errorData);
      throw new Error(`API Error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    console.log('OpenAI response data:', data);

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid API response format');
    }

    const aiResponse = data.choices[0].message.content;
    console.log('AI response:', aiResponse);

    try {
      return JSON.parse(aiResponse);
    } catch (parseError) {
      console.log('Failed to parse JSON, using as text response');
      return {
        action: 'read',
        text: aiResponse,
        response: aiResponse
      };
    }
  } catch (error) {
    console.error('OpenAI API error:', error);
    
    return {
      action: 'read',
      text: `Sorry, I encountered an error: ${error.message}`,
      response: `Sorry, I encountered an error: ${error.message}`
    };
  }
}

// Speak text using Chrome TTS
function speak(text) {
  chrome.tts.speak(text, {
    rate: 1.0,
    pitch: 1.0,
    volume: 1.0
  });
}

// Execute action on the page
async function executeAction(tabId, action) {
  if (action.action === 'read' || action.action === 'list') {
    return; // No DOM action needed, just speak
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    function: (actionData) => {
      switch (actionData.action) {
        case 'click':
          if (actionData.selector) {
            const elements = document.querySelectorAll(actionData.selector);
            const element = elements[actionData.index || 0];
            if (element) {
              element.click();
              return { success: true };
            }
          }
          break;

        case 'scroll':
          if (actionData.selector) {
            const element = document.querySelector(actionData.selector);
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          } else if (actionData.direction === 'down') {
            window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
          } else if (actionData.direction === 'up') {
            window.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' });
          }
          break;

        case 'fill':
          if (actionData.selector && actionData.value) {
            const element = document.querySelector(actionData.selector);
            if (element) {
              element.value = actionData.value;
              element.dispatchEvent(new Event('input', { bubbles: true }));
              element.dispatchEvent(new Event('change', { bubbles: true }));
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
}

// Extract page structure from tab
async function getPageStructure(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    function: () => {
      const structure = {
        title: document.title,
        url: window.location.href,
        headings: [],
        links: [],
        buttons: [],
        forms: [],
        bodyText: document.body.innerText?.slice(0, 5000) || ''
      };

      // Extract headings
      document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading, index) => {
        structure.headings.push({
          index,
          level: parseInt(heading.tagName.charAt(1)),
          text: heading.textContent.trim().slice(0, 100),
          id: heading.id || null
        });
      });

      // Extract links
      document.querySelectorAll('a[href]').forEach((link, index) => {
        const text = link.textContent.trim();
        if (text && text.length > 0) {
          structure.links.push({
            index,
            text: text.slice(0, 80),
            href: link.href,
            id: link.id || null
          });
        }
      });

      // Extract buttons
      document.querySelectorAll('button, input[type="button"], input[type="submit"], [role="button"]').forEach((button, index) => {
        structure.buttons.push({
          index,
          text: (button.textContent.trim() || button.value || button.getAttribute('aria-label') || '').slice(0, 80),
          type: button.type || 'button',
          id: button.id || null
        });
      });

      return structure;
    }
  });

  return results[0]?.result || { title: '', url: '', headings: [], links: [], buttons: [], bodyText: '' };
}

// Main message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.type);

  if (message.type === 'VOICE_COMMAND') {
    console.log('Processing voice command:', message.command);
    conversationContext.push(message.command);

    // Keep context limited
    if (conversationContext.length > 10) {
      conversationContext = conversationContext.slice(-5);
    }

    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      try {
        if (!tabs[0]) {
          throw new Error('No active tab found');
        }

        const tabId = tabs[0].id;
        console.log('Getting page structure...');
        
        const pageStructure = await getPageStructure(tabId);
        console.log('Page structure extracted');

        const result = await callOpenAI(message.command, pageStructure);
        console.log('AI result:', result);

        // Execute action if needed
        await executeAction(tabId, result);

        // Speak response
        console.log('Speaking response:', result.response);
        speak(result.response);

        // Send response to popup/content script
        chrome.runtime.sendMessage({
          type: 'AI_RESPONSE',
          response: result.response,
          action: result.action
        });

      } catch (error) {
        console.error('Error processing command:', error);
        speak('Sorry, I encountered an error processing your request.');
        
        chrome.runtime.sendMessage({
          type: 'AI_RESPONSE',
          response: `Error: ${error.message}`,
          action: 'error'
        });
      }
    });

    return true; // Keep message channel open for async response
  }

  if (message.type === 'SPEAK') {
    speak(message.text);
  }

  if (message.type === 'GET_API_STATUS') {
    sendResponse({ hasKey: !!OPENAI_API_KEY });
    return true;
  }
});

console.log('Background script loaded, API key configured:', !!OPENAI_API_KEY);
