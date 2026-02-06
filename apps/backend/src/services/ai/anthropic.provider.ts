import type { AIProvider, GenerateOptions } from './ai-provider.interface';

export class AnthropicProvider implements AIProvider {
  private apiKey: string;
  private baseUrl?: string;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async generateContent(prompt: string, options?: GenerateOptions): Promise<string> {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const clientOptions: { apiKey: string; baseURL?: string } = { apiKey: this.apiKey };
    if (this.baseUrl) {
      clientOptions.baseURL = this.baseUrl;
    }
    const client = new Anthropic(clientOptions);

    const userContent: any[] = [];
    if (options?.imageBase64) {
      userContent.push({
        type: 'image',
        source: { type: 'base64', media_type: options.imageMimeType || 'image/png', data: options.imageBase64 },
      });
    }
    userContent.push({ type: 'text', text: prompt });

    const response = await client.messages.create({
      model: options?.model || 'claude-sonnet-4-20250514',
      max_tokens: options?.maxTokens ?? 2000,
      system: options?.systemPrompt || 'You are a presentation assistant that generates markdown slides separated by ---.',
      messages: [{ role: 'user', content: userContent }],
    });

    const block = response.content[0];
    return block.type === 'text' ? block.text : '';
  }
}
