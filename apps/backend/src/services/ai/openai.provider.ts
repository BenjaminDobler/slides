import type { AIProvider, GenerateOptions } from './ai-provider.interface';

export class OpenAIProvider implements AIProvider {
  private apiKey: string;
  private baseUrl?: string;
  private defaultModel: string;

  constructor(apiKey: string, baseUrl?: string, model?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.defaultModel = model || 'gpt-4o';
  }

  async generateContent(prompt: string, options?: GenerateOptions): Promise<string> {
    // Dynamic import to avoid requiring the package if not used
    const { default: OpenAI } = await import('openai');
    const clientOptions: { apiKey: string; baseURL?: string } = { apiKey: this.apiKey };
    if (this.baseUrl) {
      clientOptions.baseURL = this.baseUrl;
    }
    const client = new OpenAI(clientOptions);

    const userContent: any[] = [{ type: 'text', text: prompt }];
    if (options?.imageBase64) {
      userContent.push({
        type: 'image_url',
        image_url: { url: `data:${options.imageMimeType || 'image/png'};base64,${options.imageBase64}` },
      });
    }

    const response = await client.chat.completions.create({
      model: options?.model || this.defaultModel,
      messages: [
        { role: 'system', content: options?.systemPrompt || 'You are a presentation assistant that generates markdown slides separated by ---.' },
        { role: 'user', content: userContent },
      ],
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 2000,
    });

    return response.choices[0]?.message?.content || '';
  }
}
