import type { AIProvider, GenerateOptions } from './ai-provider.interface';

export class GeminiProvider implements AIProvider {
  private apiKey: string;
  private baseUrl?: string;
  private defaultModel: string;

  constructor(apiKey: string, baseUrl?: string, model?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.defaultModel = model || 'gemini-2.0-flash';
  }

  async generateContent(prompt: string, options?: GenerateOptions): Promise<string> {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    // Note: GoogleGenerativeAI doesn't support custom baseUrl in the same way
    // For Gemini proxies, users would need to use a different approach
    const genAI = new GoogleGenerativeAI(this.apiKey);

    const model = genAI.getGenerativeModel({
      model: options?.model || this.defaultModel,
      systemInstruction: options?.systemPrompt || 'You are a presentation assistant that generates markdown slides separated by ---.',
    });

    const parts: any[] = [{ text: prompt }];
    if (options?.imageBase64) {
      parts.push({
        inlineData: { mimeType: options.imageMimeType || 'image/png', data: options.imageBase64 },
      });
    }

    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: options?.temperature ?? 0.7,
        maxOutputTokens: options?.maxTokens ?? 2000,
      },
    });

    return result.response.text();
  }
}
