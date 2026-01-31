import type { AIProvider, GenerateOptions } from './ai-provider.interface';

export class OpenAIProvider implements AIProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateContent(prompt: string, options?: GenerateOptions): Promise<string> {
    // Dynamic import to avoid requiring the package if not used
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: this.apiKey });

    const response = await client.chat.completions.create({
      model: options?.model || 'gpt-4o',
      messages: [
        { role: 'system', content: options?.systemPrompt || 'You are a presentation assistant that generates markdown slides separated by ---.' },
        { role: 'user', content: prompt },
      ],
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 2000,
    });

    return response.choices[0]?.message?.content || '';
  }
}
