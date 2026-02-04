// === Layout Rule Types ===

export interface NumericCondition {
  eq?: number;
  gte?: number;
  lte?: number;
  gt?: number;
}

export interface LayoutConditions {
  hasHeading?: boolean;
  imageCount?: NumericCondition;
  figureCount?: NumericCondition;
  h3Count?: NumericCondition;
  textParagraphCount?: NumericCondition;
  hasCards?: boolean;
  hasList?: boolean;
  hasCodeBlock?: boolean;
  hasBlockquote?: boolean;
}

// --- Transform option types ---

export interface WrapOptions {
  className: string; // e.g. "layout-hero"
}

export interface SplitTwoOptions {
  className: string; // e.g. "layout-text-image" or "layout-cards-image"
  leftSelector: 'text' | 'cards'; // what goes on the left
  rightSelector: 'media'; // what goes on the right
  leftClassName: string; // e.g. "layout-body" or "layout-cards-side"
  rightClassName: string; // e.g. "layout-media" or "layout-media-side"
}

export interface SplitTopBottomOptions {
  className: string; // e.g. "layout-image-grid"
  bottomSelector: 'media'; // what goes on the bottom
}

export interface GroupByHeadingOptions {
  headingLevel: number; // 3 for h3
  containerClassName: string; // e.g. "layout-sections"
  columnClassName: string; // e.g. "layout-section-col"
}

export interface LayoutTransform {
  type: 'wrap' | 'split-two' | 'split-top-bottom' | 'group-by-heading';
  options: WrapOptions | SplitTwoOptions | SplitTopBottomOptions | GroupByHeadingOptions;
}

// --- DTOs ---

export interface LayoutRuleDto {
  id: string;
  name: string;
  displayName: string;
  description?: string | null;
  priority: number;
  enabled: boolean;
  isDefault: boolean;
  userId?: string | null;
  conditions: LayoutConditions;
  transform: LayoutTransform;
  cssContent: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLayoutRuleDto {
  name: string;
  displayName: string;
  description?: string;
  priority?: number;
  enabled?: boolean;
  conditions: LayoutConditions;
  transform: LayoutTransform;
  cssContent: string;
}

export interface UpdateLayoutRuleDto {
  displayName?: string;
  description?: string;
  priority?: number;
  enabled?: boolean;
  conditions?: LayoutConditions;
  transform?: LayoutTransform;
  cssContent?: string;
}
