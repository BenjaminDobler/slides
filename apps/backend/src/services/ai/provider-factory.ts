import type { AIProvider } from './ai-provider.interface';
import { OpenAIProvider } from './openai.provider';
import { AnthropicProvider } from './anthropic.provider';
import { GeminiProvider } from './gemini.provider';

export function createAIProvider(providerName: string, apiKey: string, baseUrl?: string): AIProvider {
  switch (providerName) {
    case 'openai':
      return new OpenAIProvider(apiKey, baseUrl);
    case 'anthropic':
      return new AnthropicProvider(apiKey, baseUrl);
    case 'gemini':
      return new GeminiProvider(apiKey, baseUrl);
    default:
      throw new Error(`Unknown AI provider: ${providerName}`);
  }
}
