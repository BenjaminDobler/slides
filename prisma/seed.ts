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
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
