const GEMINI_API_KEY = '';
let conversationContext = [];

async function callGemini(userCommand, pageStructure) {
  const prompt = `You are an AI assistant helping visually impaired users navigate web pages. 

Page Information:
Title: ${pageStructure.title}
URL: ${pageStructure.url}

Full HTML Content (for complete page analysis):
${pageStructure.fullHTML}

Extracted Text Content:
${pageStructure.bodyText}

User command: "${userCommand}"

Previous context: ${conversationContext.slice(-3).join(' | ')}

IMPORTANT: Analyze the full HTML content and text to provide accurate responses. Look at the actual page structure, content, and elements to give helpful navigation assistance.

Respond with a JSON object containing:
1. "action": one of ["click", "scroll", "fill", "read", "list"]
2. "selector": CSS selector if needed
3. "value": value for fill actions if needed
4. "text": text to read for read actions if needed
5. "response": what to tell the user

For "read" actions, provide comprehensive information about the page content based on your analysis.
For "click" actions, provide specific CSS selectors to target the correct elements.
For "list" actions, provide organized lists of available elements.

Keep responses concise but thorough and actionable.`;

  try {
    console.log('Making Gemini API call...');
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ]
      })
    });

    console.log('Gemini response status:', response.status);
    
    if (!response.ok) {
      const errorData = await response.text();
      console.error('Gemini API error response:', errorData);
      throw new Error(`API Error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    console.log('Gemini response data:', data);
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
      throw new Error('Invalid API response format');
    }
    
    const aiResponse = data.candidates[0].content.parts[0].text;
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
    console.error('Gemini API error:', error);
    
    return {
      action: 'read',
      text: 'Sorry, I encountered an error processing your request.',
      response: 'Sorry, I encountered an error processing your request.'
    };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background script received message:', message.type, message);
  
  if (message.type === 'VOICE_COMMAND') {
    console.log('Processing voice command:', message.command);
    conversationContext.push(message.command);
    
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      try {
        console.log('Getting page structure...');
        const pageStructure = await chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          function: () => {
            const structure = {
              title: document.title,
              url: window.location.href,
              fullHTML: document.documentElement.outerHTML,
              headings: [],
              links: [],
              buttons: [],
              forms: [],
              landmarks: [],
              bodyText: document.body.innerText || document.body.textContent || ''
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

            return structure;
          }
        });

        console.log('Page structure extracted:', pageStructure[0].result);
        const result = await callGemini(message.command, pageStructure[0].result);
        console.log('AI result:', result);
        
        if (result.action !== 'read' && result.action !== 'list') {
          console.log('Executing action:', result);
          await chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            function: (action) => {
              switch (action.action) {
                case 'click':
                  if (action.selector) {
                    const element = document.querySelector(action.selector);
                    if (element) element.click();
                  }
                  break;
                
                case 'scroll':
                  if (action.selector) {
                    const element = document.querySelector(action.selector);
                    if (element) {
                      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                  } else if (action.direction === 'down') {
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
              }
            },
            args: [result]
          });
        }

        console.log('Speaking response:', result.response);
        chrome.tts.speak(result.response, {
          rate: 1.0,
          pitch: 1.0,
          volume: 1.0
        });

        // Send AI response to popup
        chrome.runtime.sendMessage({
          type: 'AI_RESPONSE',
          response: result.response
        });

      } catch (error) {
        console.error('Error processing command:', error);
        chrome.tts.speak('Sorry, I encountered an error.', {
          rate: 1.0,
          pitch: 1.0,
          volume: 1.0
        });
      }
    });
  } else if (message.type === 'SPEAK') {
    chrome.tts.speak(message.text, {
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0
    });
  }
});
