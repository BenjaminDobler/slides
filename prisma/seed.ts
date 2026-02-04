import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const themes = [
  {
    name: 'default',
    displayName: 'Default',
    isDefault: true,
    cssContent: `
.slide-content[data-theme="default"], [data-theme="default"] .slide-content, [data-theme="default"] .slide {
  --slide-bg: #ffffff; --slide-text: #333333; --slide-heading: #1a1a1a; --slide-accent: #0066cc;
  background: var(--slide-bg); color: var(--slide-text); font-family: 'Inter', sans-serif;
}
[data-theme="default"] h1, [data-theme="default"] h2, [data-theme="default"] h3 {
  font-family: 'Poppins', sans-serif; color: var(--slide-heading);
}
[data-theme="default"] code { background: #f5f5f5; padding: 0.2em 0.4em; border-radius: 3px; }
[data-theme="default"] a { color: var(--slide-accent); }
`,
  },
  {
    name: 'dark',
    displayName: 'Dark Mode',
    isDefault: false,
    cssContent: `
.slide-content[data-theme="dark"], [data-theme="dark"] .slide-content, [data-theme="dark"] .slide {
  --slide-bg: #1e1e2e; --slide-text: #cdd6f4; --slide-heading: #cba6f7; --slide-accent: #89b4fa;
  background: var(--slide-bg); color: var(--slide-text); font-family: 'Inter', sans-serif;
}
[data-theme="dark"] h1, [data-theme="dark"] h2, [data-theme="dark"] h3 {
  font-family: 'Poppins', sans-serif; color: var(--slide-heading);
}
[data-theme="dark"] code { background: #313244; padding: 0.2em 0.4em; border-radius: 3px; color: #a6e3a1; }
[data-theme="dark"] a { color: var(--slide-accent); }
`,
  },
  {
    name: 'minimal',
    displayName: 'Minimal',
    isDefault: false,
    cssContent: `
.slide-content[data-theme="minimal"], [data-theme="minimal"] .slide-content, [data-theme="minimal"] .slide {
  --slide-bg: #fafafa; --slide-text: #222; --slide-heading: #000; --slide-accent: #555;
  background: var(--slide-bg); color: var(--slide-text); font-family: 'Inter', sans-serif; padding: 4rem;
}
[data-theme="minimal"] h1 { font-size: 3rem; font-weight: 300; letter-spacing: -0.02em; }
[data-theme="minimal"] h2 { font-size: 2rem; font-weight: 300; }
[data-theme="minimal"] code { background: #eee; padding: 0.2em 0.4em; border-radius: 3px; }
`,
  },
  {
    name: 'corporate',
    displayName: 'Corporate',
    isDefault: false,
    cssContent: `
.slide-content[data-theme="corporate"], [data-theme="corporate"] .slide-content, [data-theme="corporate"] .slide {
  --slide-bg: #ffffff; --slide-text: #2c3e50; --slide-heading: #1a365d; --slide-accent: #2b6cb0;
  background: var(--slide-bg); color: var(--slide-text); font-family: 'Inter', sans-serif;
  border-top: 4px solid var(--slide-accent);
}
[data-theme="corporate"] h1, [data-theme="corporate"] h2 {
  font-family: 'Poppins', sans-serif; color: var(--slide-heading); border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem;
}
[data-theme="corporate"] code { background: #edf2f7; padding: 0.2em 0.4em; border-radius: 3px; }
`,
  },
  {
    name: 'creative',
    displayName: 'Creative',
    isDefault: false,
    cssContent: `
.slide-content[data-theme="creative"], [data-theme="creative"] .slide-content, [data-theme="creative"] .slide {
  --slide-bg: #0f0c29; --slide-text: #e0e0e0; --slide-heading: #f857a6; --slide-accent: #ff5858;
  background: linear-gradient(135deg, #0f0c29, #302b63, #24243e); color: var(--slide-text); font-family: 'Inter', sans-serif;
}
[data-theme="creative"] h1, [data-theme="creative"] h2 {
  font-family: 'Poppins', sans-serif; color: var(--slide-heading);
  background: linear-gradient(90deg, #f857a6, #ff5858); -webkit-background-clip: text; -webkit-text-fill-color: transparent;
}
[data-theme="creative"] code { background: rgba(255,255,255,0.1); padding: 0.2em 0.4em; border-radius: 3px; }
[data-theme="creative"] a { color: var(--slide-accent); }
`,
  },
  {
    name: 'ocean',
    displayName: 'Ocean',
    isDefault: false,
    cssContent: `
.slide-content[data-theme="ocean"], [data-theme="ocean"] .slide-content, [data-theme="ocean"] .slide {
  --slide-bg: #0b1929; --slide-text: #b2c8df; --slide-heading: #5eead4; --slide-accent: #38bdf8;
  background: linear-gradient(180deg, #0b1929 0%, #0d2137 100%); color: var(--slide-text); font-family: 'Inter', sans-serif;
}
[data-theme="ocean"] h1, [data-theme="ocean"] h2, [data-theme="ocean"] h3 {
  font-family: 'Poppins', sans-serif; color: var(--slide-heading);
}
[data-theme="ocean"] code { background: rgba(56,189,248,0.1); padding: 0.2em 0.4em; border-radius: 3px; color: #7dd3fc; }
[data-theme="ocean"] a { color: var(--slide-accent); }
[data-theme="ocean"] blockquote { border-left: 3px solid #5eead4; padding-left: 1rem; color: #7dd3fc; }
`,
  },
  {
    name: 'sunset',
    displayName: 'Sunset',
    isDefault: false,
    cssContent: `
.slide-content[data-theme="sunset"], [data-theme="sunset"] .slide-content, [data-theme="sunset"] .slide {
  --slide-bg: #1c1017; --slide-text: #e8d5ce; --slide-heading: #fb923c; --slide-accent: #f472b6;
  background: linear-gradient(135deg, #1c1017 0%, #2a1520 50%, #1e1422 100%); color: var(--slide-text); font-family: 'Inter', sans-serif;
}
[data-theme="sunset"] h1, [data-theme="sunset"] h2, [data-theme="sunset"] h3 {
  font-family: 'Poppins', sans-serif; color: var(--slide-heading);
}
[data-theme="sunset"] h1 { background: linear-gradient(90deg, #fb923c, #f472b6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
[data-theme="sunset"] code { background: rgba(251,146,60,0.12); padding: 0.2em 0.4em; border-radius: 3px; color: #fdba74; }
[data-theme="sunset"] a { color: var(--slide-accent); }
`,
  },
  {
    name: 'forest',
    displayName: 'Forest',
    isDefault: false,
    cssContent: `
.slide-content[data-theme="forest"], [data-theme="forest"] .slide-content, [data-theme="forest"] .slide {
  --slide-bg: #0f1a0f; --slide-text: #c8d6c0; --slide-heading: #4ade80; --slide-accent: #86efac;
  background: linear-gradient(180deg, #0f1a0f 0%, #162016 100%); color: var(--slide-text); font-family: 'Inter', sans-serif;
}
[data-theme="forest"] h1, [data-theme="forest"] h2, [data-theme="forest"] h3 {
  font-family: 'Poppins', sans-serif; color: var(--slide-heading);
}
[data-theme="forest"] code { background: rgba(74,222,128,0.1); padding: 0.2em 0.4em; border-radius: 3px; color: #86efac; }
[data-theme="forest"] a { color: var(--slide-accent); }
[data-theme="forest"] strong { color: #bbf7d0; }
`,
  },
  {
    name: 'noir',
    displayName: 'Noir',
    isDefault: false,
    cssContent: `
.slide-content[data-theme="noir"], [data-theme="noir"] .slide-content, [data-theme="noir"] .slide {
  --slide-bg: #0a0a0a; --slide-text: #a3a3a3; --slide-heading: #fafafa; --slide-accent: #e5e5e5;
  background: var(--slide-bg); color: var(--slide-text); font-family: 'Inter', sans-serif;
}
[data-theme="noir"] h1, [data-theme="noir"] h2, [data-theme="noir"] h3 {
  font-family: 'Poppins', sans-serif; color: var(--slide-heading); font-weight: 700; letter-spacing: -0.02em;
}
[data-theme="noir"] h1 { font-size: 3.2rem; }
[data-theme="noir"] code { background: #1a1a1a; padding: 0.2em 0.4em; border-radius: 3px; color: #d4d4d4; }
[data-theme="noir"] a { color: var(--slide-accent); text-decoration: underline; }
[data-theme="noir"] blockquote { border-left: 3px solid #404040; padding-left: 1rem; color: #d4d4d4; }
`,
  },
  {
    name: 'lavender',
    displayName: 'Lavender',
    isDefault: false,
    cssContent: `
.slide-content[data-theme="lavender"], [data-theme="lavender"] .slide-content, [data-theme="lavender"] .slide {
  --slide-bg: #faf5ff; --slide-text: #4a3563; --slide-heading: #7c3aed; --slide-accent: #a78bfa;
  background: var(--slide-bg); color: var(--slide-text); font-family: 'Inter', sans-serif;
}
[data-theme="lavender"] h1, [data-theme="lavender"] h2, [data-theme="lavender"] h3 {
  font-family: 'Poppins', sans-serif; color: var(--slide-heading);
}
[data-theme="lavender"] code { background: #ede9fe; padding: 0.2em 0.4em; border-radius: 3px; color: #6d28d9; }
[data-theme="lavender"] a { color: var(--slide-accent); }
[data-theme="lavender"] blockquote { border-left: 3px solid #c4b5fd; padding-left: 1rem; }
`,
  },
  {
    name: 'cyberpunk',
    displayName: 'Cyberpunk',
    isDefault: false,
    cssContent: `
.slide-content[data-theme="cyberpunk"], [data-theme="cyberpunk"] .slide-content, [data-theme="cyberpunk"] .slide {
  --slide-bg: #0a0014; --slide-text: #d4d4d8; --slide-heading: #e4ff1a; --slide-accent: #06b6d4;
  background: var(--slide-bg); color: var(--slide-text); font-family: 'JetBrains Mono', 'Fira Code', monospace;
}
[data-theme="cyberpunk"] h1, [data-theme="cyberpunk"] h2, [data-theme="cyberpunk"] h3 {
  color: var(--slide-heading); text-transform: uppercase; letter-spacing: 0.05em;
}
[data-theme="cyberpunk"] h1 { text-shadow: 0 0 20px rgba(228,255,26,0.3); }
[data-theme="cyberpunk"] code { background: rgba(6,182,212,0.12); padding: 0.2em 0.4em; border-radius: 3px; color: #22d3ee; }
[data-theme="cyberpunk"] a { color: var(--slide-accent); }
[data-theme="cyberpunk"] strong { color: #e4ff1a; }
`,
  },
];

const layoutRules = [
  {
    name: 'sections',
    displayName: 'Sections',
    description: 'Groups content by h3 headings into equal columns',
    priority: 10,
    isDefault: true,
    conditions: JSON.stringify({
      h3Count: { gte: 2 },
      imageCount: { eq: 0 },
      hasCards: false,
    }),
    transform: JSON.stringify({
      type: 'group-by-heading',
      options: {
        headingLevel: 3,
        containerClassName: 'layout-sections',
        columnClassName: 'layout-section-col',
      },
    }),
    cssContent: `
.slide-content .layout-sections {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
  gap: 2rem;
  flex: 1;
  min-height: 0;
}
.slide-content .layout-section-col h3 {
  margin-top: 0;
}
.slide-content .layout-section-col ul,
.slide-content .layout-section-col ol {
  padding-left: 1.2em;
}
`,
  },
  {
    name: 'hero',
    displayName: 'Hero',
    description: 'Centered title slide with optional subtitle',
    priority: 20,
    isDefault: true,
    conditions: JSON.stringify({
      hasHeading: true,
      imageCount: { eq: 0 },
      hasCards: false,
      hasList: false,
      hasCodeBlock: false,
      hasBlockquote: false,
      textParagraphCount: { lte: 1 },
    }),
    transform: JSON.stringify({
      type: 'wrap',
      options: {
        className: 'layout-hero',
      },
    }),
    cssContent: `
.slide-content .layout-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  height: 100%;
}
.slide-content .layout-hero h1 { font-size: 3rem; }
.slide-content .layout-hero h2 { font-size: 2.2rem; }
`,
  },
  {
    name: 'cards-image',
    displayName: 'Cards + Image',
    description: 'Card grid on the left, image on the right',
    priority: 30,
    isDefault: true,
    conditions: JSON.stringify({
      hasCards: true,
      imageCount: { gt: 0 },
    }),
    transform: JSON.stringify({
      type: 'split-two',
      options: {
        className: 'layout-cards-image',
        leftSelector: 'cards',
        rightSelector: 'media',
        leftClassName: 'layout-cards-side',
        rightClassName: 'layout-media-side',
      },
    }),
    cssContent: `
.slide-content .layout-cards-image {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  align-items: start;
  height: 100%;
}
.slide-content .layout-media-side img,
.slide-content .layout-media-side figure img {
  width: 100%;
  height: auto;
  border-radius: 8px;
  display: block;
}
`,
  },
  {
    name: 'image-grid',
    displayName: 'Image Grid',
    description: 'Text on top, multiple images in a grid below',
    priority: 40,
    isDefault: true,
    conditions: JSON.stringify({
      hasHeading: true,
      imageCount: { gte: 2 },
    }),
    transform: JSON.stringify({
      type: 'split-top-bottom',
      options: {
        className: 'layout-image-grid',
        bottomSelector: 'media',
      },
    }),
    cssContent: `
.slide-content .layout-image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
  margin: 1rem 0;
}
.slide-content .layout-image-grid img {
  width: 100%;
  height: auto;
  border-radius: 8px;
  display: block;
}
.slide-content .layout-image-grid figure {
  margin: 0;
}
`,
  },
  {
    name: 'text-image',
    displayName: 'Text + Image',
    description: 'Text on the left, single image on the right',
    priority: 50,
    isDefault: true,
    conditions: JSON.stringify({
      hasHeading: true,
      imageCount: { eq: 1 },
    }),
    transform: JSON.stringify({
      type: 'split-two',
      options: {
        className: 'layout-text-image',
        leftSelector: 'text',
        rightSelector: 'media',
        leftClassName: 'layout-body',
        rightClassName: 'layout-media',
      },
    }),
    cssContent: `
.slide-content .layout-text-image {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  align-items: center;
  height: 100%;
}
.slide-content .layout-media img,
.slide-content .layout-media figure img {
  width: 100%;
  height: auto;
  border-radius: 8px;
  display: block;
}
`,
  },
];

async function main() {
  for (const theme of themes) {
    await prisma.theme.upsert({
      where: { name: theme.name },
      update: { cssContent: theme.cssContent, displayName: theme.displayName },
      create: theme,
    });
  }
  console.log('Seeded themes');

  for (const rule of layoutRules) {
    await prisma.layoutRule.upsert({
      where: { name: rule.name },
      update: {
        displayName: rule.displayName,
        description: rule.description,
        priority: rule.priority,
        conditions: rule.conditions,
        transform: rule.transform,
        cssContent: rule.cssContent,
      },
      create: rule,
    });
  }
  console.log('Seeded layout rules');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
