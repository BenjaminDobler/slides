import type { AIProvider, GenerateOptions, ModelInfo } from './ai-provider.interface';

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

  async listModels(): Promise<ModelInfo[]> {
    // Use the REST API directly since the SDK doesn't expose listModels well
    const baseUrl = this.baseUrl || 'https://generativelanguage.googleapis.com';
    const response = await fetch(`${baseUrl}/v1beta/models?key=${this.apiKey}`);

    if (!response.ok) {
      throw new Error(`Failed to list models: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    // Filter to only include generative models (gemini-*)
    return (data.models || [])
      .filter((model: any) => model.name?.includes('gemini'))
      .map((model: any) => {
        // name is like "models/gemini-1.5-pro", extract just the model id
        const id = model.name?.replace('models/', '') || model.name;
        return {
          id,
          displayName: model.displayName || id,
          createdAt: undefined,
        };
      });
  }
}
