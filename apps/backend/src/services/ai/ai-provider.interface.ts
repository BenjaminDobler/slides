export interface GenerateOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  /** Base64-encoded image to include with the prompt (for vision models) */
  imageBase64?: string;
  imageMimeType?: string;
}

export interface ModelInfo {
  id: string;
  displayName: string;
  createdAt?: string;
}

export interface AIProvider {
  generateContent(prompt: string, options?: GenerateOptions): Promise<string>;
  listModels(): Promise<ModelInfo[]>;
}
