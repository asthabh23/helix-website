let messageHistory = [];

async function callAnthropicAPI(message) {
  console.log('[Anthropic API] Starting API call with message:', message);
  try {
    // Add the user message to history
    messageHistory.push({ role: 'user', content: message });
    console.log('[Anthropic API] Updated message history:', messageHistory);

    const requestBody = {
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 1000,
      messages: messageHistory,
      tools: [
        {
          name: "userAgentFacet",
          description: "Handle userAgent facet operations - click device type and get its Core Web Vitals values",
          input_schema: {
            type: "object",
            properties: {
              deviceType: {
                type: "string",
                enum: ["android", "ios", "desktop", "mobile"],
                description: "The type of device/OS to analyze"
              }
            },
            required: ["deviceType"]
          }
        }
      ],
      system: "You are a data analyst in charge of the AEM RUM Dashboard. Keep responses brief and structured:\n- Use bullet points for key metrics\n- Highlight only the most important insights\n- Format numbers and percentages clearly\n- Keep explanations under 2-3 sentences"
    };

    const apiKey = localStorage.getItem('anthropicApiKey') || '';
    console.log('[Anthropic API] API key present:', !!apiKey);

    if (!apiKey) {
      console.error('[Anthropic API] No API key found');
      throw new Error('API key not found');
    }
    
    console.log('[Anthropic API] Sending request to proxy server');
    const response = await fetch('https://chat-bot-test.asthabhargava001.workers.dev/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[Anthropic API] API request failed:', errorData);
      throw new Error(errorData.error || `API request failed (${response.status})`);
    }

    // Process the response with potential tool calls
    const data = await response.json();
    console.log('[Anthropic API] Received response:', data);
    
    if (data.content && data.content.length > 0) {
      // Process all content items in response
      let assistantMessage = '';
      const toolCalls = [];

      for (const item of data.content) {
        if (item.type === 'text') {
          assistantMessage += item.text;
          console.log('[Anthropic API] Processing text content:', item.text);
        }
        else if (item.type === 'tool_use') {
          console.log('[Anthropic API] Processing tool call:', item);
          toolCalls.push(item);
        }
      }
      
      // Execute any tool calls and send results back
      if (toolCalls.length > 0) {
        console.log('[Anthropic API] Executing tool calls:', toolCalls.length);
        for (const toolCall of toolCalls) {
          try {
            console.log('[Anthropic API] Executing tool:', toolCall.name);
            const result = await executeUserAgentFacet(toolCall.input);

            // Format tool results as a user message
            const resultText = `[Tool result for ${toolCall.name}]: ${JSON.stringify(result)}`;
            messageHistory.push({
              role: 'user',
              content: resultText
            });

            console.log('[Anthropic API] Getting follow-up response for tool result');
            // Get follow-up response from Claude with the tool results
            const followUpResponse = await callAnthropicAPIWithToolResults();
            assistantMessage += followUpResponse;
          } catch (error) {
            console.error('[Anthropic API] Error executing browser action:', error);
            assistantMessage += `\n[Error: ${error.message}]\n`;
          }
        }
      }
      
      // Add the complete message to history only after all processing is done
      messageHistory.push({ role: 'assistant', content: assistantMessage });
      console.log('[Anthropic API] Updated message history with assistant response');

      console.log('[Anthropic API] Returning complete response');
      return assistantMessage;
    } else {
      console.error('[Anthropic API] Unexpected API response format:', data);
      throw new Error('Unexpected API response format');
    }
  } catch (error) {
    console.error('[Anthropic API] Error in API call:', error);
    throw error;
  }
}

// Function to send tool results back to Claude and get follow-up response
async function callAnthropicAPIWithToolResults() {
  console.log('[Tool Results API] Starting follow-up API call');
  try {
    const requestBody = {
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 1000,
      messages: messageHistory,
      system: "You are an AI assistant analyzing tool results. Keep responses brief and structured:\n- Present key metrics in bullet points\n- Focus on actionable insights\n- Use clear formatting for numbers\n- Keep explanations concise\n- Highlight only the most important findings"
    };

    const apiKey = localStorage.getItem('anthropicApiKey') || '';
    console.log('[Tool Results API] API key present:', !!apiKey);

    const response = await fetch('https://chat-bot-test.asthabhargava001.workers.dev/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      console.error('[Tool Results API] API request failed:', response.status);
      throw new Error(`API request failed (${response.status})`);
    }

    const data = await response.json();
    console.log('[Tool Results API] Received response:', data);

    if (data.content && data.content.length > 0) {
      const followupMessage = data.content[0].text;
      messageHistory.push({ role: 'assistant', content: followupMessage });
      console.log('[Tool Results API] Added follow-up message to history');
      return followupMessage;
    }

    console.warn('[Tool Results API] No content in response');
    return '';
  } catch (error) {
    console.error('[Tool Results API] Error:', error);
    return `[Error getting follow-up response: ${error.message}]`;
  }
}

// Add this new function to handle userAgent facet operations
async function executeUserAgentFacet(input) {
  console.log(`[UserAgent Facet] Starting execution for device type:`, input.deviceType);
  const { deviceType } = input;
  
  try {
    // Step 1: Click the device type checkbox
    const selector = `[id='userAgent=mobile:${deviceType}']`;
    const element = document.querySelector(selector);

    if (!element) {
      return {
        success: false,
        message: `Device type checkbox not found: ${deviceType}`
      };
    }

    // Click the checkbox
    element.click();

    // Wait for UI to update
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 2: Extract CWV values from the ul.cwv structure
    const cwvSelector = `div[aria-selected="true"] ul.cwv`;
    const cwvElement = document.querySelector(cwvSelector);

    if (!cwvElement) {
      return {
        success: false,
        message: `CWV values not found for device type: ${deviceType}`
      };
    }

    // Get all li elements and extract values based on their order
    const items = cwvElement.querySelectorAll('li');
    if (items.length !== 3) {
      return {
        success: false,
        message: `Expected 3 CWV values, found ${items.length}`
      };
    }

    // Extract values based on order: LCP, CLS, INP
    const lcp = items[0].textContent.trim();
    const cls = items[1].textContent.trim();
    const inp = items[2].textContent.trim();

    console.log(`[UserAgent Facet] Extracted values:`, { lcp, cls, inp });

    return {
      success: true,
      deviceType,
      cwvValues: {
        lcp,
        cls,
        inp
      }
    };
  } catch (error) {
    console.error("[UserAgent Facet] Error:", error);
    return {
      success: false,
      message: `Error processing ${deviceType} device type: ${error.message}` 
    };
  }
}

export default async function decorate(block) {
  messageHistory = [];

  const chatInterface = document.createElement('div');
  chatInterface.className = 'chat-interface';

  chatInterface.innerHTML = `
    <div class="chat-header">
      <h2>RUM Insights</h2>
      <button class="close-button" title="Close chat">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z" fill="currentColor"/>
        </svg>
      </button>
    </div>
    <div id="messages" class="messages"></div>
    <div class="suggestions-area">
      <h3>Quick Insights</h3>
      <div class="suggestion-buttons">
        <button class="suggestion-btn" data-suggestion="Show Android performance metrics" data-action="android-performance">
          📱 Android Performance
        </button>
        <button class="suggestion-btn" data-suggestion="Show Core Web Vitals for homepage" data-action="core-web-vitals">
          📊 Core Web Vitals
        </button>
        <button class="suggestion-btn" data-suggestion="Show weekly engagement metrics" data-action="engagement-metrics">
          📈 Weekly Engagement
        </button>
      </div>
    </div>
  `;

  block.textContent = '';
  block.appendChild(chatInterface);

  // Add click handler for close button
  const closeButton = block.querySelector('.close-button');
  closeButton.addEventListener('click', () => {
    // Hide the chat container
    block.closest('.rum-chat-container').classList.remove('show');

    // Clear messages and reset message history
    const messagesDiv = block.querySelector('#messages');
    messagesDiv.innerHTML = '';
    messageHistory = [];
  });

  // Add click handlers for suggestion buttons
  const suggestionButtons = block.querySelectorAll('.suggestion-btn');
  suggestionButtons.forEach(button => {
    button.addEventListener('click', async () => {
      const suggestion = button.getAttribute('data-suggestion');
      const action = button.getAttribute('data-action');
      const messagesDiv = block.querySelector('#messages');

      const createMessageElement = (text, className) => {
        const div = document.createElement('div');
        div.className = `message ${className}`;
        // Format the message text to preserve line breaks and bullet points
        div.innerHTML = text.replace(/\n/g, '<br>').replace(/•/g, '• ');
        return div;
      };

      // Add user's selected suggestion as a message
      messagesDiv.appendChild(createMessageElement(suggestion, 'user-message'));

      // Handle different actions based on the button clicked
      let response = '';
      switch(action) {
        case 'android-performance':
          try {
            const result = await callAnthropicAPI(
              "Analyze Android performance metrics. Focus on key metrics and highlight any issues."
            );
            response = result;
          } catch (error) {
            console.error("[Android Performance] Error:", error);
            response = `❌ Error analyzing Android performance: ${error.message}`;
          }
          break;
        case 'core-web-vitals':
          try {
            const result = await callAnthropicAPI(
              "Show Core Web Vitals for homepage. Present metrics in a clear, structured format."
            );
            response = result;
          } catch (error) {
            console.error("[Core Web Vitals] Error:", error);
            response = `❌ Error fetching Core Web Vitals: ${error.message}`;
          }
          break;
        case 'engagement-metrics':
          try {
            const result = await callAnthropicAPI(
              "Show weekly engagement metrics. Focus on key trends and changes."
            );
            response = result;
          } catch (error) {
            console.error("[Engagement Metrics] Error:", error);
            response = `❌ Error calculating engagement metrics: ${error.message}`;
          }
          break;
        default:
          response = 'Processing your request...';
      }

      // Add response message
      const claudeDiv = createMessageElement(response, 'claude-message');
      messagesDiv.appendChild(claudeDiv);

      // Scroll to bottom
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });
  });
}
