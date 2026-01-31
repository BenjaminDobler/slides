export interface GenerateOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface AIProvider {
  generateContent(prompt: string, options?: GenerateOptions): Promise<string>;
}
