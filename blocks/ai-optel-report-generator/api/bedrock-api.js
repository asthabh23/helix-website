/**
 * AWS Bedrock API Integration via RUM Bundler Proxy
 */

import { AI_MODELS, BEDROCK_CONFIG } from '../config.js';
import { getAdminToken, hasAdminToken } from '../rum-admin-auth.js';

const MAX_RETRIES = 3;
const ENDPOINT = BEDROCK_CONFIG.PROXY_ENDPOINT;

/** Transform content item to Messages API format */
function transformContentItem(item) {
  if (item.type === 'text') return { type: 'text', text: item.text };
  if (item.type === 'tool_use') {
    return {
      type: 'tool_use',
      id: item.id,
      name: item.name,
      input: item.input || {},
    };
  }
  if (item.type === 'tool_result') {
    return {
      type: 'tool_result',
      tool_use_id: item.tool_use_id,
      content: item.content,
      is_error: item.is_error,
    };
  }
  return { type: 'text', text: JSON.stringify(item) };
}

/** Transform message to Messages API format */
function transformMessage(msg) {
  let content;
  if (typeof msg.content === 'string') {
    content = msg.content;
  } else if (Array.isArray(msg.content)) {
    content = msg.content.map(transformContentItem);
  } else {
    content = String(msg.content);
  }
  return { role: msg.role, content };
}

/** Build request body for Messages API via proxy */
function buildRequestBody(params) {
  const {
    messages,
    system,
    max_tokens: maxTokens = BEDROCK_CONFIG.MAX_TOKENS,
    temperature = BEDROCK_CONFIG.TEMPERATURE,
    tools,
  } = params;

  const body = {
    modelId: AI_MODELS.BEDROCK_MODEL_ID,
    messages: messages.map(transformMessage),
    max_tokens: maxTokens,
    temperature,
  };

  if (system) body.system = system;
  if (tools?.length) body.tools = tools;

  return body;
}

/** Call Bedrock API via RUM Bundler Proxy with retry logic */
export async function callBedrockAPI(params) {
  const token = getAdminToken();
  if (!token) throw new Error('RUM admin token not found. Please ensure you are logged in.');

  const requestBody = buildRequestBody(params);
  let lastError;

  console.log('[Bedrock] Making request to:', ENDPOINT);
  console.log('[Bedrock] Request body:', JSON.stringify(requestBody, null, 2));

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    });

    console.log('[Bedrock] Response status:', response.status);

    if (response.ok) {
      // eslint-disable-next-line no-await-in-loop
      const data = await response.json();
      console.log('[Bedrock] Response data:', data);
      return {
        id: data.id || `bedrock-${Date.now()}`,
        type: 'message',
        role: 'assistant',
        content: data.content,
        model: data.model || AI_MODELS.BEDROCK_MODEL_ID,
        stop_reason: data.stop_reason,
        usage: data.usage,
      };
    }

    // Handle auth errors immediately
    if (response.status === 401 || response.status === 403) {
      const authError = new Error('Invalid or expired RUM admin token. Please log in again.');
      authError.isAuthError = true;
      throw authError;
    }

    const xError = response.headers.get('x-error') || '';
    // eslint-disable-next-line no-await-in-loop
    const errorText = await response.text();
    lastError = `Bedrock API error: ${response.status} ${xError || errorText}`;
    console.log('[Bedrock] Error:', lastError);

    // Handle service unavailable - should not retry
    if (response.status === 502 || response.status === 503) {
      const serviceError = new Error(lastError);
      serviceError.isFatalError = true;
      throw serviceError;
    }

    // Retry on rate limit
    if (response.status === 429 && attempt < MAX_RETRIES - 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => { setTimeout(r, (2 ** attempt) * 1000); });
    } else {
      break;
    }
  }

  throw new Error(lastError || 'Bedrock API request failed');
}

export { getAdminToken as getBedrockToken, hasAdminToken as hasBedrockToken };
