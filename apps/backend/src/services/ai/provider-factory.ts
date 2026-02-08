import type { AIProvider } from './ai-provider.interface';
import { OpenAIProvider } from './openai.provider';
import { AnthropicProvider } from './anthropic.provider';
import { GeminiProvider } from './gemini.provider';

export function createAIProvider(providerName: string, apiKey: string, baseUrl?: string, model?: string): AIProvider {
  switch (providerName) {
    case 'openai':
      return new OpenAIProvider(apiKey, baseUrl, model);
    case 'anthropic':
      return new AnthropicProvider(apiKey, baseUrl, model);
    case 'gemini':
      return new GeminiProvider(apiKey, baseUrl, model);
    default:
      throw new Error(`Unknown AI provider: ${providerName}`);
  }
}
