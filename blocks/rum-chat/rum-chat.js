/* eslint-disable no-console */
let messageHistory = [];

// Function to convert a facet into a tool
function createFacetTool(facetName, facetType, attributes = {}) {
  console.log(`[Tool Creation] Creating tool for facet: ${facetName} (type: ${facetType})`);

  const baseTool = {
    name: facetName,
    description: `Analyze the ${facetName} data to provide insights`,
    parameters: {
      type: 'object',
      properties: {
        values: {
          type: 'array',
          items: { type: 'string' },
          description: `List of ${facetName} values to analyze`,
        },
      },
      required: ['values'],
    },
  };

  // Add type-specific properties
  switch (facetType) {
    case 'list-facet':
      baseTool.description += ' (categorized data with descriptions)';
      baseTool.parameters.properties.values.description = `List of categorized ${facetName} values with descriptions`;
      break;

    case 'link-facet':
      baseTool.description += ' (URL-related data)';
      baseTool.parameters.properties.values.description = `List of URLs and related ${facetName} data`;
      if (attributes.thumbnail) {
        baseTool.parameters.properties.thumbnail = {
          type: 'boolean',
          description: 'Include thumbnail previews',
        };
      }
      if (attributes.favicon) {
        baseTool.parameters.properties.favicon = {
          type: 'boolean',
          description: 'Include favicon information',
        };
      }
      break;

    case 'literal-facet':
      baseTool.description += ' (raw text/CSS selector data)';
      baseTool.parameters.properties.values.description = `List of raw ${facetName} values (e.g., CSS selectors, error lines)`;
      break;

    default:
      baseTool.description += ' (unknown facet type)';
      baseTool.parameters.properties.values.description = `List of ${facetName} values`;
      break;
  }

  // Add drilldown capability if present
  if (attributes.drilldown) {
    baseTool.parameters.properties.drilldown = {
      type: 'boolean',
      description: 'Enable detailed drilldown analysis',
    };
  }

  console.log('[Tool Creation] Created tool:', baseTool);
  return baseTool;
}

// Function to convert facet data into tools
function convertFacetsToTools(facetsData) {
  console.log('[Tool Conversion] Starting conversion of facets to tools');
  console.log('[Tool Conversion] Input facets data:', facetsData);

  const tools = [];
  const facetData = {};

  // Get all facet elements and their types
  const facets = document.querySelectorAll('list-facet, link-facet, literal-facet');
  const facetTypes = new Map();

  facets.forEach((facet) => {
    const facetName = facet.getAttribute('facet');
    if (facetName) {
      const type = facet.tagName.toLowerCase();
      const attributes = {
        drilldown: facet.getAttribute('drilldown'),
        thumbnail: facet.hasAttribute('thumbnail'),
        favicon: facet.hasAttribute('favicon'),
      };
      facetTypes.set(facetName, { type, attributes });
    }
  });

  Object.entries(facetsData).forEach(([facetName, values]) => {
    console.log(`[Tool Conversion] Processing facet: ${facetName}`);
    const facetInfo = facetTypes.get(facetName) || { type: 'unknown', attributes: {} };

    // Create tool with type-specific properties
    tools.push(createFacetTool(facetName, facetInfo.type, facetInfo.attributes));

    if (Array.isArray(values) && values.length > 0) {
      console.log(`[Tool Conversion] Found ${values.length} values for facet ${facetName}`);
      facetData[facetName] = values;
    } else {
      console.log(`[Tool Conversion] No values found for facet ${facetName}`);
      facetData[facetName] = []; // Store empty array for empty facets
    }
  });

  console.log('[Tool Conversion] Conversion complete');
  console.log('[Tool Conversion] Generated tools:', tools);
  console.log('[Tool Conversion] Processed facet data:', facetData);

  return { tools, facetData };
}

// Function to fetch RUM data
async function fetchRUMData() {
  console.log('[RUM Data] Fetching RUM data');
  try {
    const rumData = {};

    // Get key metrics from the separate div
    const keyMetricsDiv = document.querySelector('.key-metrics');
    if (keyMetricsDiv) {
      const metrics = Array.from(keyMetricsDiv.querySelectorAll('li')).map((item) => {
        const name = item.getAttribute('title') || item.querySelector('h2')?.textContent;
        const value = item.querySelector('p')?.textContent;
        return { name, value };
      }).filter((metric) => metric.name && metric.value);

      // Format metrics into a more readable structure
      const formattedMetrics = metrics.reduce((acc, metric) => {
        acc[metric.name] = metric.value;
        return acc;
      }, {});

      rumData.metrics = formattedMetrics;
      console.log('[RUM Data] Found key metrics:', formattedMetrics);
    }

    // Get all facet data
    const facetsData = {};
    const facets = document.querySelectorAll('list-facet, link-facet, literal-facet');

    facets.forEach((facet) => {
      const facetName = facet.getAttribute('facet');
      if (!facetName) return;

      console.log(`[RUM Data] Processing facet: ${facetName}`);

      // Handle different facet types
      if (facet.tagName.toLowerCase() === 'list-facet') {
        // Get all dt-dd pairs
        const items = Array.from(facet.querySelectorAll('dt')).map((dt) => {
          const value = dt.textContent.trim();
          const description = dt.nextElementSibling?.textContent.trim() || '';
          const count = dt.closest('div')?.querySelector('.count')?.textContent.trim() || '0';
          return { value, description, count };
        }).filter((item) => item.value);

        if (items.length > 0) {
          facetsData[facetName] = items;
        }
      } else if (facet.tagName.toLowerCase() === 'link-facet') {
        // Get all links with their attributes
        const items = Array.from(facet.querySelectorAll('a')).map((link) => ({
          url: link.href,
          text: link.textContent.trim(),
          count: link.closest('div')?.querySelector('.count')?.textContent.trim() || '0',
          thumbnail: link.getAttribute('data-thumbnail'),
          favicon: link.getAttribute('data-favicon'),
        })).filter((item) => item.url);

        if (items.length > 0) {
          facetsData[facetName] = items;
        }
      } else if (facet.tagName.toLowerCase() === 'literal-facet') {
        // Get all literal values
        const items = Array.from(facet.querySelectorAll('dt')).map((dt) => ({
          value: dt.textContent.trim(),
          count: dt.closest('div')?.querySelector('.count')?.textContent.trim() || '0',
        })).filter((item) => item.value);

        if (items.length > 0) {
          facetsData[facetName] = items;
        }
      }
    });

    console.log('[RUM Data] Collected facets data:', facetsData);

    // Convert facets to tools
    const { tools, facetData } = convertFacetsToTools(facetsData);
    rumData.tools = tools;
    rumData.facetData = facetData;

    console.log('[RUM Data] Complete fetched data with tools:', rumData);
    return rumData;
  } catch (error) {
    console.error('[RUM Data] Error fetching data:', error);
    throw error;
  }
}

// Function to send tool results back to Claude and get follow-up response
async function callAnthropicAPIWithToolResults(rumData) {
  console.log('[Tool Results API] Starting follow-up API call');
  try {
    // Prepare the system prompt with tool usage instructions
    const systemPrompt = `You are an AI assistant analyzing RUM data. You have access to specific tools for analyzing different types of data:

1. List Facets (categorized data):
   - Use these for analyzing device types, checkpoints, consent states, etc.
   - Values come with descriptions that provide context
   - Look for patterns in the categorized data

2. Link Facets (URL-related data):
   - Use these for analyzing page URLs, click targets, referrers
   - Can include thumbnails and favicons for visual context
   - Track navigation paths and user journeys

3. Literal Facets (raw text/CSS selectors):
   - Use these for analyzing error lines, CSS selectors, DOM elements
   - Look for patterns in error messages or selector usage
   - Identify common issues or frequently used elements

Analysis Guidelines:
- Start with key metrics to understand overall performance
- Use appropriate tools for each type of data
- Look for correlations between different facets
- Focus on actionable insights
- Keep explanations concise
- Use bullet points for clarity
- Highlight only the most important findings

When presenting metrics, format them in a clear, readable way using this structure:
• Metric Name (Abbreviation): Value
  Status: [Good/Fair/Poor] - [Why]
  Action: [Specific, actionable step]

For example:
• Largest Contentful Paint (LCP): 1.7s
  Status: Excellent - Well within Google's recommended 2.5s threshold
  Action: Maintain current performance

Group related metrics together under clear headings:
Performance Metrics:
[Formatted metrics as above]

User Engagement Metrics:
[Formatted metrics as above]

Technical Metrics:
[Formatted metrics as above]

For each section, provide:
1. Raw Data: Show the actual numbers and values
2. Analysis: Break down what these numbers mean
3. Key Insights: What patterns or trends do you see?
4. Actions: What specific steps should be taken?

Example format for other sections:
User Behavior Patterns:
• Raw Data: [Show actual numbers and percentages]
• Key Insights:
  - [Specific insight with supporting numbers]
• Actions:
  - [Specific, actionable step with expected impact]

Technical Issues:
• Raw Data: [Show actual error counts, types, etc.]
• Key Issues:
  - [Specific issue with supporting numbers]
• Actions:
  - [Technical solution with expected impact]

Key Performance Metrics:
${JSON.stringify(rumData.metrics, null, 2)}

Available Tools:
${JSON.stringify(rumData.tools, null, 2)}

Current Data:
${JSON.stringify(rumData.facetData, null, 2)}`;

    const requestBody = {
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 1000,
      messages: [
        ...messageHistory,
        {
          role: 'user',
          content: `Analyze this RUM data using the available tools. Focus on:
1. Key performance metrics:
   • Present each metric in this format:
     Metric Name (Abbreviation): Value
     Status: [Good/Fair/Poor] - [Why]
     Action: [Specific, actionable step]
   • Group metrics under clear headings:
     - Performance Metrics
     - User Engagement Metrics (not in long numbers)

2. User behavior patterns:
   • Raw Data: Show actual numbers and percentages
   • Key Insights: Specific patterns with supporting numbers
   • Actions: Specific, actionable steps with expected impact

3. Technical issues:
   • Raw Data: Show actual error counts and types including javascript errors
   • Key Issues: Specific problems with supporting numbers
   • Actions: Technical solutions with expected impact

4. Actionable recommendations:
   • Give top 5 prioritized list of specific actions

Provide your analysis in a structured format with clear sections, bullet points, and supporting numbers throughout. Keep recommendations specific and actionable.`,
        },
      ],
      system: systemPrompt,
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

// Function to get device metrics directly without clicking
/*
async function getDeviceMetrics(deviceType) {
  try {
    const metrics = {};

    // Get the facet element for userAgent
    const facetElement = document.querySelector('list-facet[facet="userAgent"]');
    if (!facetElement) {
      console.error('[Device Metrics] UserAgent facet not found');
      return null;
    }

    // Find the device's div using the data-value attribute
    const deviceDiv = facetElement.querySelector(`div[data-value="${deviceType}"]`);
    if (!deviceDiv) {
      console.error(`[Device Metrics] Device div not found for ${deviceType}`);
      return null;
    }

    // Get the count/weight of the device
    const countElement = deviceDiv.querySelector('.count');
    if (countElement) {
      metrics.pageViews = parseInt(countElement.textContent.replace(/,/g, ''), 10);
    }

    // Get CWV metrics from the ul with class cwv
    const cwvElement = deviceDiv.querySelector('ul.cwv');
    if (cwvElement) {
      const cwvItems = Array.from(cwvElement.querySelectorAll('li'));

      // Process each CWV metric item dynamically
      cwvItems.forEach(item => {
        const title = item.getAttribute('title') || '';
        const value = parseFloat(item.textContent.trim());

        // Store the metric with its original title as the key
        if (title && !Number.isNaN(value)) {
          metrics[title] = value;
        }
      });
    }

    console.log(`[Device Metrics] Retrieved metrics for ${deviceType}:`, metrics);
    return metrics;
  } catch (error) {
    console.error(`[Device Metrics] Error getting metrics for ${deviceType}:`, error);
    return null;
  }
}

// Function to analyze device types and gather insights
async function analyzeDeviceTypes() {
  console.log('[Device Analysis] Starting device type analysis');

  const deviceTypes = [
    'mobile:android',
    'mobile:ios',
    'desktop:windows',
    'desktop:mac',
    'desktop:linux'
  ];

  const insights = {
    devices: {}
  };

  // Get metrics for each device type directly
  const results = await Promise.all(
    deviceTypes.map(async (deviceType) => {
      console.log(`[Device Analysis] Analyzing device: ${deviceType}`);
      const metrics = await getDeviceMetrics(deviceType);
      return metrics ? { device: deviceType, metrics } : null;
    })
  );

  // Store all metrics for each device
  results.filter(Boolean).forEach(({ device, metrics }) => {
    insights.devices[device] = metrics;
  });

  console.log('[Device Analysis] Completed analysis:', insights);
  return insights;
}
*/

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
    <div id="api-key-section" class="api-key-section">
      <div class="api-key-input">
        <label for="api-key">Enter Anthropic API Key:</label>
        <input type="password" id="api-key" placeholder="sk-ant-...">
        <button id="save-api-key">Save Key</button>
      </div>
      <div class="analysis-section" style="display: none;">
        <button id="start-analysis" class="primary-button">Show Insights of This Site</button>
      </div>
    </div>
  `;

  block.textContent = '';
  block.appendChild(chatInterface);

  // Add click handler for close button
  const closeButton = block.querySelector('.close-button');
  closeButton.addEventListener('click', () => {
    console.log('[Close Button] Attempting to close chat window');

    // Try to find the parent container
    const chatContainer = block.closest('.rum-chat-container');
    if (chatContainer) {
      console.log('[Close Button] Found chat container, removing show class');
      chatContainer.classList.remove('show');
    } else {
      console.log('[Close Button] Chat container not found, hiding block directly');
      block.style.display = 'none';
    }

    // Clear messages and reset message history
    const messagesDiv = block.querySelector('#messages');
    messagesDiv.innerHTML = '';
    messageHistory = [];

    // Reset API key section visibility
    const apiKeySection = block.querySelector('#api-key-section');
    if (apiKeySection) {
      apiKeySection.style.display = 'block';

      // Reset analysis section
      const analysisSection = apiKeySection.querySelector('.analysis-section');
      if (analysisSection && localStorage.getItem('anthropicApiKey')) {
        analysisSection.style.display = 'block';
      }
    }

    console.log('[Close Button] Chat window closed and state reset');
  });

  const messagesDiv = block.querySelector('#messages');
  const apiKeySection = block.querySelector('#api-key-section');
  const apiKeyInput = block.querySelector('#api-key');
  const saveApiKeyButton = block.querySelector('#save-api-key');
  const analysisSection = block.querySelector('.analysis-section');
  const startAnalysisButton = block.querySelector('#start-analysis');

  const createMessageElement = (text, className) => {
    const div = document.createElement('div');
    div.className = `message ${className}`;
    // Format the message text to preserve line breaks and bullet points
    div.innerHTML = text.replace(/\n/g, '<br>').replace(/•/g, '• ');
    return div;
  };

  // Check if API key exists in localStorage
  const existingApiKey = localStorage.getItem('anthropicApiKey');
  if (existingApiKey) {
    apiKeyInput.value = existingApiKey;
    apiKeyInput.disabled = true;
    saveApiKeyButton.textContent = 'Key Saved';
    saveApiKeyButton.disabled = true;
    analysisSection.style.display = 'block';
  }

  // Handle API key saving
  saveApiKeyButton.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
      localStorage.setItem('anthropicApiKey', apiKey);
      apiKeyInput.disabled = true;
      saveApiKeyButton.textContent = 'Key Saved';
      saveApiKeyButton.disabled = true;
      analysisSection.style.display = 'block';
    } else {
      alert('Please enter a valid API key');
    }
  });

  // Handle start analysis button click
  startAnalysisButton.addEventListener('click', async () => {
    // Hide API key section
    apiKeySection.style.display = 'none';

    // Create a function to add progress messages
    const addProgressMessage = (message) => {
      messagesDiv.appendChild(createMessageElement(message, 'claude-message'));
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    };

    try {
      addProgressMessage('🔍 Starting RUM data analysis...');

      /* Commenting out device analysis section
      // Analyze different device types
      addProgressMessage('📱 Analyzing device types...');
      const deviceInsights = await analyzeDeviceTypes();

      // Show progress for each device type
      Object.entries(deviceInsights.devices).forEach(([device, metrics]) => {
        const metricsList = Object.entries(metrics)
          .map(([key, value]) => `  • ${key}: ${value}`)
          .join('\n');
        addProgressMessage(`📊 Metrics for ${device}:\n${metricsList}`);
      });
      */

      // Fetch RUM data
      addProgressMessage('📊 Fetching overall RUM data...');
      const rumData = await fetchRUMData();

      // Add empty device insights to maintain structure
      rumData.deviceInsights = { devices: {} };

      // Add the initial message to history
      messageHistory.push({
        role: 'user',
        content: 'Please analyze the RUM data to provide insights.',
      });

      // Call Claude API to get insights
      addProgressMessage('🤖 Calling Claude API for detailed analysis...');
      const claudeResponse = await callAnthropicAPIWithToolResults(rumData);

      // Display the final analysis
      addProgressMessage(`✨ Analysis complete! Here are the insights:\n\n${claudeResponse}`);

      // Scroll to bottom
      messagesDiv.scrollTop = messagesDiv.scrollHeight;

      // Keep API key section hidden after successful analysis
    } catch (error) {
      console.error('[Agent] Error during analysis:', error);
      addProgressMessage(`❌ Error during analysis: ${error.message}`);

      // Show API key section again only in case of error
      apiKeySection.style.display = 'block';
    }
  });
}
