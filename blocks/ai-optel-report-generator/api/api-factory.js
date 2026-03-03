/**
 * API Factory - AWS Bedrock Integration via RUM Bundler Proxy
 */

import { callBedrockAPI, hasBedrockToken } from './bedrock-api.js';

export function getApiProvider() {
  if (hasBedrockToken()) return { type: 'bedrock', hasToken: true };
  return { type: null, hasToken: false };
}

export async function callAI(params) {
  if (!hasBedrockToken()) {
    throw new Error('RUM admin token not found. Please ensure you are logged in.');
  }
  return callBedrockAPI(params);
}

export function getProviderName() {
  return hasBedrockToken() ? 'AWS Bedrock (Claude Opus 4.5)' : 'No provider configured';
}
