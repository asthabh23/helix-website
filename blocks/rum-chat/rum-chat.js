/* eslint-disable no-console */
let messageHistory = [];
let cachedFacetTools = null;

// Cache for loaded templates
let systemPromptCache = null;
let finalAnalysisTemplateCache = null;
let fallbackSystemPromptCache = null;

// Cache for analysis results - now using localStorage for persistence
const CACHE_KEY = 'rumAnalysisCache';
const CACHE_DURATION = 20 * 60 * 1000; // 10 minute in milliseconds

// Function to get cache from localStorage
function getAnalysisCache() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.warn('[Cache] Error reading cache from localStorage:', error);
    return null;
  }
}

// Function to set cache in localStorage
function setAnalysisCache(cacheData) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
  } catch (error) {
    console.warn('[Cache] Error saving cache to localStorage:', error);
  }
}

// Function to generate a simple hash of dashboard data for cache validation
function generateDashboardHash(dashboardData) {
  const dataString = JSON.stringify({
    metricsCount: Object.keys(dashboardData.metrics).length,
    segmentsCount: Object.keys(dashboardData.segments).length,
    segmentSizes: Object.entries(dashboardData.segments).map(([key, items]) => ({
      key,
      count: items.length,
      totalItems: items.reduce((sum, item) => sum + item.count, 0),
    })),
  });

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < dataString.length; i += 1) {
    const char = dataString.charCodeAt(i);
    // eslint-disable-next-line no-bitwise
    hash = ((hash << 5) - hash) + char;
    // eslint-disable-next-line no-bitwise
    hash &= hash; // Convert to 32-bit integer
  }
  return hash.toString();
}

// Function to check if cached analysis is still valid
function isCacheValid(currentDashboardHash) {
  const analysisCache = getAnalysisCache();

  if (!analysisCache || !analysisCache.result || !analysisCache.timestamp
      || !analysisCache.dashboardDataHash) {
    console.log('[Cache] No cached analysis found');
    return false;
  }

  const now = Date.now();
  const timeDiff = now - analysisCache.timestamp;
  const isTimeValid = timeDiff < CACHE_DURATION;
  const isDataValid = analysisCache.dashboardDataHash === currentDashboardHash;

  console.log(`[Cache] Time valid: ${isTimeValid} (${Math.round(timeDiff / 1000)}s ago), Data valid: ${isDataValid}`);

  return isTimeValid && isDataValid;
}

// Function to cache analysis result
function cacheAnalysisResult(result, dashboardDataHash) {
  const cacheData = {
    result,
    timestamp: Date.now(),
    dashboardDataHash,
  };
  setAnalysisCache(cacheData);
  console.log('[Cache] Analysis result cached for 5 minutes');
}

// Function to clear analysis cache
function clearAnalysisCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
    console.log('[Cache] Analysis cache cleared');
  } catch (error) {
    console.warn('[Cache] Error clearing cache:', error);
  }
}

// Function to get cache status for UI display
function getCacheStatus() {
  const analysisCache = getAnalysisCache();

  if (!analysisCache || !analysisCache.timestamp) {
    return null;
  }

  const now = Date.now();
  const timeDiff = now - analysisCache.timestamp;
  const remainingTime = CACHE_DURATION - timeDiff;

  if (remainingTime <= 0) {
    // Cache expired, clean it up
    clearAnalysisCache();
    return null;
  }

  const remainingMinutes = Math.ceil(remainingTime / (60 * 1000));
  return `Cached result (expires in ${remainingMinutes} min)`;
}

// Function to load text file content
async function loadTextFile(filename) {
  try {
    const response = await fetch(`/blocks/rum-chat/${filename}`);
    if (!response.ok) {
      throw new Error(`Failed to load ${filename}: ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    console.error(`[Template Loader] Error loading ${filename}:`, error);
    return null;
  }
}

// Function to get system prompt
async function getSystemPrompt() {
  if (!systemPromptCache) {
    systemPromptCache = await loadTextFile('system-prompt.txt');
  }
  return systemPromptCache || 'You are a RUM data detective specializing in USER ENGAGEMENT and TRAFFIC ACQUISITION analysis.';
}

// Function to get fallback system prompt
async function getFallbackSystemPrompt() {
  if (!fallbackSystemPromptCache) {
    fallbackSystemPromptCache = await loadTextFile('fallback-system-prompt.txt');
  }
  return fallbackSystemPromptCache || 'You are a RUM data analyst focused on identifying performance patterns and issues.';
}

// Function to get final analysis template
async function getFinalAnalysisTemplate(analysisData) {
  if (!finalAnalysisTemplateCache) {
    finalAnalysisTemplateCache = await loadTextFile('final-analysis-template.txt');
  }

  const template = finalAnalysisTemplateCache || 'Based on your comprehensive analysis, provide detailed findings and recommendations.';
  return template.replace('{ANALYSIS_DATA}', analysisData);
}

// Function to create tool definition based on facet type
function createToolDefinition(facetName, description) {
  // Sanitize the facet name to match the required pattern ^[a-zA-Z0-9_-]{1,64}$
  const sanitizedName = facetName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);

  console.log(`[Tool Creation] Creating tool for facet "${facetName}":
    - Original name: ${facetName}
    - Sanitized name: ${sanitizedName}
    - Description: ${description}`);

  const inputSchema = {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['filter', 'analyze', 'summarize'],
        description: 'The operation to perform on the facet',
      },
      value: {
        type: 'string',
        description: 'The value to use for the operation (required for filter)',
      },
    },
    required: ['operation'],
  };

  return {
    name: sanitizedName,
    description: `${description}. Use this tool to analyze data based on the ${facetName} facet.`,
    input_schema: inputSchema,
  };
}

// Function to extract facets from explorer.html and convert them to tool definitions
function extractFacetsFromExplorer() {
  if (cachedFacetTools) {
    console.log('[Facet Extraction] Using cached facet tools');
    return cachedFacetTools;
  }

  console.log('[Facet Extraction] Starting facet extraction');
  const facetSidebar = document.querySelector('facet-sidebar');
  if (!facetSidebar) {
    console.error('[Facet Extraction] Facet sidebar not found');
    return [];
  }

  const facetElements = facetSidebar.querySelectorAll('list-facet, link-facet, literal-facet, file-facet, thumbnail-facet');
  console.log(`[Facet Extraction] Found ${facetElements.length} facet elements`);

  const tools = [];
  facetElements.forEach((facetElement, index) => {
    const facetName = facetElement.getAttribute('facet');
    if (!facetName) {
      console.log(`[Facet Extraction] Skipping facet #${index + 1} - no facet name`);
      return;
    }

    const legendElement = facetElement.querySelector('legend');
    const description = legendElement ? legendElement.textContent : `Analyze data based on ${facetName}`;

    console.log(`[Facet Extraction] Processing facet #${index + 1}:
      - Name: ${facetName}
      - Type: ${facetElement.tagName.toLowerCase()}
      - Description: ${description}`);

    const tool = createToolDefinition(facetName, description);
    if (tool) tools.push(tool);
  });

  console.log('[Facet Extraction] Created tools:', tools.map((t, i) => `
    Tool #${i + 1}:
    - Name: ${t.name}
    - Description: ${t.description}
  `).join('\n'));

  cachedFacetTools = tools;
  return tools;
}

// Function to handle dynamic facet tool calls
async function handleDynamicFacetToolCall(toolName, input) {
  const facetName = toolName.replace(/Facet$/, '').replace(/_/g, '.');
  const facetElement = document.querySelector(`[facet="${facetName}"]`);

  if (!facetElement) {
    return {
      success: false,
      message: `Facet element not found for ${facetName}`,
    };
  }

  const { operation, value } = input;

  try {
    let result;
    switch (operation) {
      case 'filter': {
        if (!value) {
          result = {
            success: false,
            message: 'Filter operation requires a value',
          };
          break;
        }
        // Look for checkbox input with the specified value
        const filterInput = facetElement.querySelector(`input[value="${value}"]`);
        if (filterInput) {
          // Instead of clicking (which triggers heavy operations),
          // just check the checkbox and dispatch a lightweight event
          filterInput.checked = !filterInput.checked;

          // Dispatch event after a small delay to avoid performance issues
          setTimeout(() => {
            const changeEvent = new Event('change', { bubbles: true });
            filterInput.dispatchEvent(changeEvent);
          }, 0);

          result = {
            success: true,
            message: `Applied filter: ${value}`,
          };
        } else {
          result = {
            success: false,
            message: `Filter value ${value} not found in facet ${facetName}`,
          };
        }
        break;
      }
      case 'analyze': {
        // Use more efficient DOM querying with performance optimization
        const labelElements = facetElement.querySelectorAll('label');
        const items = [];

        // Process elements in batches to avoid blocking the main thread
        const batchSize = 10;
        for (let i = 0; i < labelElements.length; i += batchSize) {
          const batch = Array.from(labelElements).slice(i, i + batchSize);

          batch.forEach((label) => {
            const labelText = label.querySelector('.label')?.textContent?.trim() || '';
            const valueText = label.querySelector('.value')?.textContent?.trim() || '';
            const countElement = label.querySelector('number-format.count');
            const countText = countElement?.textContent?.trim() || '0';
            const countTitle = countElement?.getAttribute('title') || '0';

            // Extract numeric value from title (e.g., "250354800 ±5252663" -> "250354800")
            const numericCount = countTitle.split(' ')[0].replace(/[^\d]/g, '');

            // Get performance metrics from cwv list (optimized)
            const cwvList = label.nextElementSibling?.querySelector?.('ul.cwv');
            const metrics = {};
            if (cwvList) {
              const metricItems = cwvList.querySelectorAll('li');
              metricItems.forEach((item) => {
                const title = item.getAttribute('title') || '';
                const metricValue = item.querySelector('number-format')?.textContent?.trim() || '';
                if (title && metricValue) {
                  // Extract metric name from title (e.g., "LCP - based on 2921 samples" -> "LCP")
                  const metricName = title.split(' - ')[0];
                  metrics[metricName] = metricValue;
                }
              });
            }

            const text = labelText || valueText;
            if (text) {
              items.push({
                text,
                displayCount: countText,
                count: parseInt(numericCount, 10) || 0,
                metrics,
              });
            }
          });
        }

        result = {
          success: true,
          facetName,
          totalItems: items.length,
          items: items.slice(0, 5), // Return first 5 items
          summary: `Found ${items.length} items in ${facetName}`,
        };
        break;
      }
      case 'summarize': {
        // Optimized summarize operation
        const labelElements = facetElement.querySelectorAll('label');
        const allItems = [];

        // Process in smaller batches for better performance
        const batchSize = 15;
        for (let i = 0; i < labelElements.length; i += batchSize) {
          const batch = Array.from(labelElements).slice(i, i + batchSize);

          batch.forEach((label) => {
            const labelText = label.querySelector('.label')?.textContent?.trim() || '';
            const valueText = label.querySelector('.value')?.textContent?.trim() || '';
            const countElement = label.querySelector('number-format.count');
            const countTitle = countElement?.getAttribute('title') || '0';

            // Extract numeric value from title
            const numericCount = countTitle.split(' ')[0].replace(/[^\d]/g, '');
            const text = labelText || valueText;

            if (text) {
              allItems.push({
                text,
                count: parseInt(numericCount, 10) || 0,
              });
            }
          });
        }

        const total = allItems.reduce((sum, item) => sum + item.count, 0);

        result = {
          success: true,
          facetName,
          totalItems: allItems.length,
          totalCount: total,
          topItems: allItems.slice(0, 3),
          summary: `${facetName} has ${allItems.length} unique values with ${total} total occurrences`,
        };
        break;
      }
      default:
        result = {
          success: false,
          message: `Unknown operation: ${operation}`,
        };
    }
    return result;
  } catch (error) {
    console.error('[Dynamic Facet] Error:', error);
    return {
      success: false,
      message: `Error processing ${facetName}: ${error.message}`,
    };
  }
}

// Function to initialize dynamic facets
function initializeDynamicFacets() {
  console.log('[Dynamic Facets] Initializing dynamic facets');

  const extractFacets = () => {
    console.log('[Dynamic Facets] DOM ready, extracting facets');
    const tools = extractFacetsFromExplorer();
    console.log(`[Dynamic Facets] Extracted ${tools.length} tools`);
    return tools;
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', extractFacets);
  } else {
    // Add a small delay to ensure DOM is fully rendered
    setTimeout(extractFacets, 100);
  }

  // Debounce function to prevent excessive observer calls
  let observerTimeout;
  const debouncedExtractFacets = () => {
    clearTimeout(observerTimeout);
    observerTimeout = setTimeout(extractFacets, 250);
  };

  const observer = new MutationObserver((mutations) => {
    // Only process if we haven't already scheduled an extraction
    if (observerTimeout) return;

    const hasFacetElements = mutations.some((mutation) => {
      if (mutation.addedNodes.length) {
        return Array.from(mutation.addedNodes).some((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            return node.tagName && (
              node.tagName.toLowerCase().includes('facet')
              || node.querySelector('list-facet, link-facet, literal-facet, file-facet, thumbnail-facet')
            );
          }
          return false;
        });
      }
      return false;
    });

    if (hasFacetElements) {
      console.log('[Dynamic Facets] Facet elements detected in DOM changes, scheduling re-extraction');
      debouncedExtractFacets();
    }
  });

  // Observe only the facet sidebar instead of the entire body for better performance
  const facetSidebar = document.querySelector('facet-sidebar');
  if (facetSidebar) {
    observer.observe(facetSidebar, { childList: true, subtree: true });
  } else {
    // Fallback to body observation if facet sidebar not found yet
    observer.observe(document.body, { childList: true, subtree: false });
  }
}

// Note: Dynamic facets will be initialized only when insights are requested

// Function to extract RUM data from dashboard
function extractDashboardData() {
  return new Promise((resolve) => {
    const getData = async () => {
      console.log('[Dashboard Data] Starting data extraction...');

      const dashboardData = {
        metrics: {},
        segments: {},
      };

      console.log('[Dashboard Data] Starting DOM traversal');

      // Find all metric blocks in the dashboard
      const metricElements = document.querySelectorAll('.metric-block, [data-metric-type]');
      console.log('[Dashboard Data] Found metric elements:', metricElements.length);

      metricElements.forEach((metric) => {
        const metricName = metric.getAttribute('data-metric-name') || metric.querySelector('.metric-name')?.textContent;
        const metricValue = metric.getAttribute('data-metric-value') || metric.querySelector('.metric-value')?.textContent;
        if (metricName && metricValue) {
          dashboardData.metrics[metricName.trim()] = metricValue.trim();
        }
      });

      // Get facet data from the explorer
      const facetSidebar = document.querySelector('facet-sidebar');
      if (facetSidebar) {
        console.log('[Dashboard Data] Found facet sidebar');
        const facets = facetSidebar.querySelectorAll('list-facet, link-facet, literal-facet');
        console.log('[Dashboard Data] Found facets:', facets.length);

        facets.forEach((facet) => {
          const facetName = facet.getAttribute('facet');
          if (!facetName) return;

          console.log(`[Dashboard Data] Processing facet: ${facetName}`);

          // Extract data from label elements with number-format counts
          const labelElements = Array.from(facet.querySelectorAll('label'));
          const items = labelElements.map((label) => {
            const labelText = label.querySelector('.label')?.textContent?.trim() || '';
            const valueText = label.querySelector('.value')?.textContent?.trim() || '';
            const countElement = label.querySelector('number-format.count');
            const countText = countElement?.textContent?.trim() || '0';
            const countTitle = countElement?.getAttribute('title') || '0';

            // Extract numeric value from title (e.g., "250354800 ±5252663" -> "250354800")
            const numericCount = countTitle.split(' ')[0].replace(/[^\d]/g, '');

            // Get performance metrics from cwv list
            const cwvList = label.nextElementSibling?.querySelector?.('ul.cwv');
            const metrics = {};
            if (cwvList) {
              const metricItems = cwvList.querySelectorAll('li');
              metricItems.forEach((item) => {
                const title = item.getAttribute('title') || '';
                const metricValue = item.querySelector('number-format')?.textContent?.trim() || '';
                if (title && metricValue) {
                  // Extract metric name from title
                  const metricName = title.split(' - ')[0];
                  metrics[metricName] = metricValue;
                }
              });
            }

            return {
              value: labelText || valueText,
              displayCount: countText,
              count: parseInt(numericCount, 10) || 0,
              metrics,
            };
          }).filter((item) => item.value); // Filter out empty items

          dashboardData.segments[facetName] = items;
        });
      } else {
        console.log('[Dashboard Data] No facet sidebar found');
      }

      console.log('[Dashboard Data] Extraction complete:', dashboardData);
      resolve(dashboardData);
    };

    // Ensure DOM is fully loaded before traversing
    if (document.readyState === 'loading') {
      console.log('[Dashboard Data] DOM still loading, waiting for DOMContentLoaded');
      document.addEventListener('DOMContentLoaded', getData);
    } else {
      console.log('[Dashboard Data] DOM already loaded, processing immediately');
      getData();
    }
  });
}

/* eslint-disable no-await-in-loop */
async function callAnthropicAPI(message, isFollowUp = false) {
  console.log('[Anthropic API] Starting API call with message:', message);
  try {
    // Extract dashboard data after DOM is loaded
    console.log('[Dashboard Data] Waiting for dashboard data extraction...');
    const dashboardData = await extractDashboardData();
    console.log('[Dashboard] Extracted data:', dashboardData);

    // Generate hash of current dashboard data for cache validation
    const currentDashboardHash = generateDashboardHash(dashboardData);

    // Check if we have a valid cached result
    if (!isFollowUp && isCacheValid(currentDashboardHash)) {
      console.log('[Cache] Returning cached analysis result');
      return getAnalysisCache().result;
    }

    // Get the current facet tools
    const facetTools = extractFacetsFromExplorer();
    console.log('[Anthropic API] Available facet tools:', facetTools);

    // If this is the initial call, analyze data first to identify problematic segments
    if (!isFollowUp && facetTools.length > 0) {
      console.log('[Anthropic API] Starting intelligent analysis workflow');

      // Start with iterative tool analysis
      const maxToolsPerBatch = 5;
      let currentBatch = 0;
      const remainingTools = [...facetTools];
      const allToolResults = [];
      let cumulativeAnalysis = '';

      // Create initial enhanced message with all dashboard data
      const initialMessage = `${message}

DASHBOARD DATA:
${Object.entries(dashboardData.metrics)
    .map(([metric, value]) => `- ${metric}: ${value}`)
    .join('\n')}

SEGMENTS (top 3 per category):
${Object.entries(dashboardData.segments)
    .map(([segment, items]) => `
${segment}: ${items.slice(0, 3).map((item) => `${item.value} (${item.count.toLocaleString()})`).join(', ')}`)
    .join('\n')}

ANALYSIS PRIORITIES:
1. ENGAGEMENT ANALYSIS: Identify user interaction patterns, click behaviors, and content engagement
2. BOUNCE RATE INVESTIGATION: Find high-exit pages, single-session patterns, and retention issues  
3. TRAFFIC ACQUISITION DEEP-DIVE: Analyze traffic sources, referrer quality, and channel performance
4. CONVERSION OPTIMIZATION: Discover friction points and optimization opportunities

SPECIFIC FOCUS AREAS:
- Click patterns and user interaction quality across different traffic sources
- Bounce rate correlation with traffic acquisition channels
- Content engagement effectiveness by referrer type
- Geographic and device-specific acquisition performance
- User journey analysis from entry to conversion/exit

TASK: Use available facet tools to extract detailed engagement and acquisition insights. Prioritize analysis of click, enter, navigate, acquisition, and viewblock facets.`;

      const systemPrompt = await getSystemPrompt();

      // Iterative tool analysis loop
      // Max 4 batches to prevent infinite loops
      while (remainingTools.length > 0 && currentBatch < 4) {
        currentBatch += 1;

        const allAvailableTools = extractFacetsFromExplorer();
        console.log(`[Batch ${currentBatch}] Found ${allAvailableTools.length} total tools available`);

        // Update remaining tools with any newly discovered tools
        // eslint-disable-next-line max-len
        const existingToolNames = new Set([...facetTools.map((t) => t.name), ...allToolResults.map((r) => r.tool)]);
        const newTools = allAvailableTools.filter((tool) => !existingToolNames.has(tool.name));

        if (newTools.length > 0) {
          console.log(`[Batch ${currentBatch}] Found ${newTools.length} new dynamic tools:`, newTools.map((t) => t.name));
          remainingTools.push(...newTools);
          // Progress message removed - no longer showing facet discovery updates
        }

        const currentBatchTools = remainingTools.splice(0, maxToolsPerBatch);

        // Progress message removed - no longer showing batch analysis details

        // Prepare message for this batch
        let batchMessage;
        if (currentBatch === 1) {
          batchMessage = initialMessage;
          messageHistory.push({ role: 'user', content: batchMessage });
        } else {
          // For subsequent batches, include previous findings and ask for focused analysis
          batchMessage = `Continue discovery with additional tools.

PREVIOUS FINDINGS:
${cumulativeAnalysis}

FOCUS: Find more hidden correlations, anomalies, and business impacts using available tools.`;

          messageHistory.push({ role: 'user', content: batchMessage });
        }

        const requestBody = {
          model: 'claude-opus-4-20250514',
          max_tokens: 4096,
          messages: messageHistory,
          tools: currentBatchTools,
          system: systemPrompt,
          temperature: 0.3,
        };

        console.log(`[Anthropic API] Sending batch ${currentBatch} with ${currentBatchTools.length} tools`);
        console.log('[Anthropic API] Current batch tools:', currentBatchTools.map((t) => t.name));
        console.log('[Anthropic API] Request body tools count:', requestBody.tools?.length || 0);

        const apiKey = localStorage.getItem('anthropicApiKey') || '';
        if (!apiKey) {
          throw new Error('API key not found');
        }

        try {
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

          const data = await response.json();
          console.log(`[Anthropic API] Received batch ${currentBatch} response:`, data);

          if (data.content && data.content.length > 0) {
            let batchAnalysis = '';
            const toolCalls = [];
            const batchNumber = currentBatch; // Capture for safe use in callbacks

            // Process each content item
            data.content.forEach((item) => {
              if (item.type === 'text') {
                const text = item.text.trim();
                if (text) batchAnalysis += `${text}\n`;
              } else if (item.type === 'tool_call') {
                // Don't log tool calls to avoid cluttering the UI
                toolCalls.push(item);
              }
            });

            // Execute tool calls for this batch
            if (toolCalls.length > 0) {
              console.log(`[Anthropic API] Executing ${toolCalls.length} tool calls for batch ${batchNumber}`);

              // Progress message removed - no longer showing tool execution details

              // eslint-disable-next-line no-await-in-loop
              const batchResults = await Promise.all(
                // eslint-disable-next-line no-loop-func
                toolCalls.map(async (toolCall) => {
                  try {
                    const result = await handleDynamicFacetToolCall(
                      toolCall.name,
                      toolCall.arguments || {},
                    );

                    // Add tool result to message history
                    messageHistory.push({
                      role: 'tool',
                      tool_name: toolCall.name,
                      tool_call_id: toolCall.id,
                      content: JSON.stringify(result),
                    });

                    return { tool: toolCall.name, success: result.success, result };
                  } catch (error) {
                    console.error(`[Anthropic API] Error executing ${toolCall.name}:`, error);
                    return { tool: toolCall.name, success: false, error: error.message };
                  }
                }),
              );

              allToolResults.push(...batchResults);

              // Get Claude's analysis of this batch's tool results
              const batchFollowUpMessage = 'What hidden insights did you discover? Focus on surprising patterns with business impact.';
              messageHistory.push({ role: 'user', content: batchFollowUpMessage });

              const followUpRequestBody = {
                model: 'claude-opus-4-20250514',
                max_tokens: 4096,
                messages: messageHistory,
                system: systemPrompt,
                temperature: 0.3,
              };

              // Progress message removed - no longer showing analysis progress

              let followUpData;
              try {
                // eslint-disable-next-line no-await-in-loop
                const followUpResponse = await fetch('https://chat-bot-test.asthabhargava001.workers.dev/', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                  },
                  body: JSON.stringify(followUpRequestBody),
                });

                if (!followUpResponse.ok) {
                  throw new Error(`HTTP error! status: ${followUpResponse.status}`);
                }
                followUpData = await followUpResponse.json();
                if (followUpData.content && followUpData.content.length > 0) {
                  let batchInsights = '';
                  followUpData.content.forEach((item) => {
                    if (item.type === 'text') {
                      const text = item.text.trim();
                      if (text) batchInsights += `${text}\n`;
                    }
                  });

                  cumulativeAnalysis += `\n\n${batchInsights}`;

                  // Always continue to next batch if there are remaining tools
                  // Only stop if we've reached max batches or no more tools
                  if (remainingTools.length === 0) {
                    // Progress message removed - no longer showing completion status
                    break;
                  } else {
                    // Progress message removed - no longer showing batch continuation status
                  }
                }
              } catch (followUpError) {
                console.error(`[Anthropic API] Error in follow-up for batch ${batchNumber}:`, followUpError);
                // Continue with next batch even if follow-up fails
              }
            } else {
              // No tool calls in this batch, add the analysis to cumulative results
              cumulativeAnalysis += `\n\n${batchAnalysis}`;

              // Continue to next batch if we have more tools
              if (remainingTools.length > 0) {
                // Progress message removed - no longer showing batch continuation status
              } else {
                // Progress message removed - no longer showing completion status
                break;
              }
            }
          }
        } catch (error) {
          console.error(`[Anthropic API] Error in batch ${currentBatch}:`, error);
          break;
        }
      }

      // Final comprehensive analysis
      // Progress message removed - no longer showing final analysis preparation

      const finalMessage = await getFinalAnalysisTemplate(cumulativeAnalysis);

      messageHistory.push({ role: 'user', content: finalMessage });

      const finalRequestBody = {
        model: 'claude-opus-4-20250514',
        max_tokens: 4096,
        messages: messageHistory,
        system: systemPrompt,
        temperature: 0.3,
      };

      const finalApiKey = localStorage.getItem('anthropicApiKey') || '';
      if (!finalApiKey) {
        throw new Error('API key not found');
      }

      const finalResponse = await fetch('https://chat-bot-test.asthabhargava001.workers.dev/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': finalApiKey,
        },
        body: JSON.stringify(finalRequestBody),
      });

      if (finalResponse.ok) {
        const finalData = await finalResponse.json();
        if (finalData.content && finalData.content.length > 0) {
          let finalAnalysis = '';
          finalData.content.forEach((item) => {
            if (item.type === 'text') {
              const text = item.text.trim();
              if (text) finalAnalysis += `${text}\n`;
            }
          });

          const result = finalAnalysis || cumulativeAnalysis;
          // Cache the result for future use
          cacheAnalysisResult(result, currentDashboardHash);
          return result;
        }
      }

      const result = cumulativeAnalysis || 'Analysis completed across multiple batches.';
      // Cache the result for future use
      cacheAnalysisResult(result, currentDashboardHash);
      return result;
    }

    // Fallback for follow-up calls or when no tools are available
    const enhancedMessage = `${message}

Analyze the following RUM data from the dashboard:

Overall Metrics:
${Object.entries(dashboardData.metrics)
    .map(([metric, value]) => `- ${metric}: ${value}`)
    .join('\n')}

Segment Analysis:
${Object.entries(dashboardData.segments)
    .map(([segment, items]) => `
${segment}:
${items.map((item) => `- ${item.value}: ${item.count} requests
  ${Object.entries(item.metrics)
    .map(([metric, value]) => `  ${metric}: ${value}`)
    .join('\n  ')}
`).join('')}
`).join('\n')}

Analyze this data and provide:
1. Key performance patterns across different segments
2. Critical performance issues in specific segments
3. Recommendations for improvement
4. Specific metrics that need attention`;

    messageHistory.push({ role: 'user', content: enhancedMessage });

    const systemPrompt = await getFallbackSystemPrompt();

    const requestBody = {
      model: 'claude-opus-4-20250514',
      max_tokens: 4096,
      messages: messageHistory,
      tools: facetTools,
      system: systemPrompt,
      temperature: 0.7,
    };

    const apiKey = localStorage.getItem('anthropicApiKey') || '';
    if (!apiKey) {
      throw new Error('API key not found');
    }

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

    const data = await response.json();
    console.log('[Anthropic API] Received response:', data);

    if (data.content && data.content.length > 0) {
      let assistantMessage = '';

      data.content.forEach((item) => {
        if (item.type === 'text') {
          const text = item.text.trim();
          if (text) assistantMessage += `${text}\n`;
        }
      });

      const result = assistantMessage || 'No significant issues found in the analysis.';
      // Cache the fallback result as well
      if (!isFollowUp) {
        cacheAnalysisResult(result, currentDashboardHash);
      }
      return result;
    }

    throw new Error('Unexpected API response format');
  } catch (error) {
    console.error('[Anthropic API] Error in API call:', error);
    throw error;
  }
}

export default async function decorate(block) {
  messageHistory = [];

  const chatInterface = document.createElement('div');
  chatInterface.className = 'chat-interface';

  chatInterface.innerHTML = `
    <div class="chat-header">
      <h2>RUM Insights</h2>
      <div class="header-buttons">
        <button class="download-button" disabled title="Download insights as PDF (available after analysis)">📄 Download</button>
        <button class="close-button" title="Close chat">×</button>
      </div>
    </div>
    <div id="messages" class="messages"></div>
    <div id="api-key-section" class="api-key-section">
      <div class="api-key-input">
        <label for="api-key">Enter Anthropic API Key:</label>
        <input type="password" id="api-key" placeholder="sk-ant-...">
        <button id="save-api-key">Save Key</button>
      </div>
      <div class="analysis-section" style="display: none;">
        <button id="start-analysis" class="primary-button" style="padding: 6px 10px;" title="">Show Insights</button>
      </div>
    </div>
  `;

  block.textContent = '';
  block.appendChild(chatInterface);

  const downloadButton = block.querySelector('.download-button');
  const closeButton = block.querySelector('.close-button');
  const messagesDiv = block.querySelector('#messages');
  const apiKeySection = block.querySelector('#api-key-section');
  const apiKeyInput = block.querySelector('#api-key');
  const saveApiKeyButton = block.querySelector('#save-api-key');
  const analysisSection = block.querySelector('.analysis-section');
  const startAnalysisButton = block.querySelector('#start-analysis');

  // Variable to store analysis content for PDF generation
  let analysisContent = '';

  // Download functionality
  const generatePDF = () => {
    if (!analysisContent) {
      // eslint-disable-next-line no-alert
      alert('No analysis content available for download.');
      return;
    }

    // Create a clean HTML content for printing
    const cleanContent = analysisContent
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace HTML entities
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();

    // Create a new window with printable content
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>RUM Insights Analysis Report</title>
        <link rel="stylesheet" href="/blocks/rum-chat/rum-chat.css">
      </head>
      <body class="rum-insights-print">
        <button class="print-button no-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
        <h1>RUM Insights Analysis Report</h1>
        <div class="timestamp">Generated on: ${new Date().toLocaleString()}</div>
        <div class="content">${cleanContent}</div>
        <script>
          // Auto-focus for better UX
          window.focus();
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  downloadButton.addEventListener('click', generatePDF);

  // Function to update cache status in UI
  const updateCacheStatus = () => {
    const cacheStatus = getCacheStatus();
    if (cacheStatus) {
      const analysisCache = getAnalysisCache();
      const minutesAgo = Math.floor((Date.now() - analysisCache.timestamp) / (60 * 1000));
      const timeText = minutesAgo === 0 ? 'just now' : `${minutesAgo} min${minutesAgo > 1 ? 's' : ''} ago`;

      startAnalysisButton.textContent = 'Show Insights *';
      startAnalysisButton.title = `Results cached from ${timeText}. Ctrl+click to clear cache.`;
    } else {
      startAnalysisButton.textContent = 'Show Insights';
      startAnalysisButton.title = '';
    }
  };

  // Add a flag to prevent accidental analysis triggering
  let isProcessingCacheClear = false;

  // Add right-click handler for cache clearing
  startAnalysisButton.addEventListener('contextmenu', (e) => {
    const cacheStatus = getCacheStatus();
    if (cacheStatus && e.ctrlKey) { // Require Ctrl+right-click
      e.preventDefault(); // Prevent default context menu
      e.stopPropagation(); // Stop event bubbling
      e.stopImmediatePropagation(); // Stop all other event handlers

      isProcessingCacheClear = true; // Set flag to prevent immediate analysis

      clearAnalysisCache();
      updateCacheStatus();
      messagesDiv.innerHTML = '';
      messageHistory = [];

      // Reset download button
      analysisContent = '';
      downloadButton.disabled = true;
      downloadButton.title = 'Download insights as PDF (available after analysis)';

      console.log('[UI] Cache cleared by Ctrl+click');

      // Add a brief visual feedback
      const originalText = startAnalysisButton.textContent;
      startAnalysisButton.textContent = 'Cache Cleared';
      startAnalysisButton.disabled = true;

      setTimeout(() => {
        startAnalysisButton.textContent = originalText.replace(' *', '');
        startAnalysisButton.disabled = false;
        updateCacheStatus();
        isProcessingCacheClear = false; // Reset flag after UI update
      }, 1000);
    }
  });

  const createMessageElement = (text, className) => {
    const div = document.createElement('div');
    div.className = `message ${className}`;
    div.innerHTML = text.replace(/\n/g, '<br>');
    return div;
  };

  closeButton.addEventListener('click', () => {
    const chatContainer = block.closest('.rum-chat-container');
    if (chatContainer) {
      chatContainer.classList.remove('show');
    } else {
      block.style.display = 'none';
    }
    messagesDiv.innerHTML = '';
    messageHistory = [];

    // Reset download button
    analysisContent = '';
    downloadButton.disabled = true;
    downloadButton.title = 'Download insights as PDF (available after analysis)';

    // Reset facet manipulation state but keep cache for persistence across reloads
    cachedFacetTools = null;
    console.log('[Cleanup] Reset facet manipulation state (cache preserved for next session)');

    apiKeySection.style.display = 'block';
    if (localStorage.getItem('anthropicApiKey')) {
      analysisSection.style.display = 'block';
    }

    // Reload the page
    window.location.reload();
  });

  const existingApiKey = localStorage.getItem('anthropicApiKey');
  if (existingApiKey) {
    apiKeyInput.value = existingApiKey;
    apiKeyInput.disabled = true;
    saveApiKeyButton.textContent = 'Key Saved';
    saveApiKeyButton.disabled = true;
    analysisSection.style.display = 'block';
    updateCacheStatus(); // Update cache status when showing analysis section
  }

  saveApiKeyButton.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
      localStorage.setItem('anthropicApiKey', apiKey);
      apiKeyInput.disabled = true;
      saveApiKeyButton.textContent = 'Key Saved';
      saveApiKeyButton.disabled = true;
      analysisSection.style.display = 'block';
      updateCacheStatus(); // Update cache status when showing analysis section
    } else {
      alert('Please enter a valid API key');
    }
  });

  startAnalysisButton.addEventListener('click', async () => {
    // Prevent analysis if we're in the middle of clearing cache
    if (isProcessingCacheClear) {
      console.log('[UI] Ignoring click during cache clear process');
      return;
    }

    apiKeySection.style.display = 'none';

    const addProgressMessage = (message) => {
      if (message.trim()) {
        messagesDiv.appendChild(createMessageElement(message, 'claude-message'));
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
      }
    };

    try {
      // Check if we have cached results first
      const cacheStatus = getCacheStatus();
      if (cacheStatus) {
        addProgressMessage(`${cacheStatus}`);
        // If we have cached results, we should also enable download if content exists
        const cachedResult = getAnalysisCache();
        if (cachedResult && cachedResult.result) {
          analysisContent = cachedResult.result;
          downloadButton.disabled = false;
          downloadButton.title = 'Download insights as PDF';
        }
      } else {
        addProgressMessage('🔍 Analyzing RUM dashboard...');
      }

      // Add a small delay to allow any ongoing operations to complete
      // This helps prevent performance violations from overlapping operations
      await new Promise((resolve) => {
        setTimeout(() => {
          console.log('[Insights] Initializing facet manipulation for analysis...');
          initializeDynamicFacets();
          resolve();
        }, 200);
      });

      if (!cacheStatus) {
        const facetTools = extractFacetsFromExplorer();

        if (facetTools.length > 0) {
          addProgressMessage('📊 Extracting data from dashboard based on facets analysis...');
        } else {
          addProgressMessage('⚠️ No facet tools found, proceeding with basic dashboard analysis...');
        }
      }

      const response = await callAnthropicAPI('Analyze the RUM data from the dashboard.', false);
      if (response.trim()) {
        if (cacheStatus) {
          addProgressMessage('✨ Cached analysis loaded! Here are the insights:');
        } else {
          addProgressMessage('✨ Analysis complete! Here are the insights:');
        }
        addProgressMessage(response);

        // Store analysis content and enable download button
        analysisContent = response;
        downloadButton.disabled = false;
        downloadButton.title = 'Download insights as PDF';

        updateCacheStatus(); // Update cache status after analysis
      } else {
        addProgressMessage('Unable to generate insights. Please try again.');
      }
    } catch (error) {
      console.error('[Agent] Error during analysis:', error);
      addProgressMessage(`❌ Error during analysis: ${error.message}`);
      apiKeySection.style.display = 'block';
    }
  });
}
