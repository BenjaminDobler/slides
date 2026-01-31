export interface GenerateOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  /** Base64-encoded image to include with the prompt (for vision models) */
  imageBase64?: string;
  imageMimeType?: string;
}

export interface AIProvider {
  generateContent(prompt: string, options?: GenerateOptions): Promise<string>;
}
