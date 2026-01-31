import type { AIProvider, GenerateOptions } from './ai-provider.interface';

export class GeminiProvider implements AIProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateContent(prompt: string, options?: GenerateOptions): Promise<string> {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(this.apiKey);

    const model = genAI.getGenerativeModel({
      model: options?.model || 'gemini-2.0-flash',
      systemInstruction: options?.systemPrompt || 'You are a presentation assistant that generates markdown slides separated by ---.',
    });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: options?.temperature ?? 0.7,
        maxOutputTokens: options?.maxTokens ?? 2000,
      },
    });

    return result.response.text();
  }
}
