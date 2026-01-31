// === Parsed Slides ===

export interface ParsedSlide {
  content: string;
  html: string;
  notes?: string;
}

export interface ParsedPresentation {
  slides: ParsedSlide[];
}

// === API DTOs ===

export interface PresentationDto {
  id: string;
  title: string;
  content: string;
  theme: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePresentationDto {
  title: string;
  content: string;
  theme?: string;
}

export interface UpdatePresentationDto {
  title?: string;
  content?: string;
  theme?: string;
}

export interface ThemeDto {
  id: string;
  name: string;
  displayName: string;
  cssContent: string;
  isDefault?: boolean;
  userId?: string | null;
}

export interface CreateThemeDto {
  name: string;
  displayName: string;
  cssContent: string;
}

export interface UpdateThemeDto {
  displayName?: string;
  cssContent?: string;
}

export interface AiGenerateThemeDto {
  description: string;
  provider: string;
  existingCss?: string;
}

// === Auth ===

export interface LoginDto {
  email: string;
  password: string;
}

export interface RegisterDto {
  email: string;
  password: string;
  name?: string;
}

export interface AuthResponse {
  token: string;
  user: { id: string; email: string; name?: string };
}

// === AI ===

export interface AiProviderConfigDto {
  id: string;
  providerName: string;
  model?: string;
  hasKey: boolean;
}

export interface CreateAiProviderConfigDto {
  providerName: string;
  apiKey: string;
  model?: string;
}

export interface AiGenerateDto {
  prompt: string;
  provider: string;
  context?: string;
}

export interface AiSuggestStyleDto {
  content: string;
  provider: string;
}

export interface AiImproveDto {
  slideContent: string;
  provider: string;
  instruction?: string;
}

export interface AiSpeakerNotesDto {
  slideContent: string;
  provider: string;
}

export interface AiGenerateDiagramDto {
  description: string;
  provider: string;
}

export interface AiRewriteDto {
  slideContent: string;
  provider: string;
  audience: 'technical' | 'executive' | 'casual';
}

export interface AiOutlineToSlidesDto {
  outline: string;
  provider: string;
}

// === Media ===

export interface MediaDto {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  createdAt: string;
}
