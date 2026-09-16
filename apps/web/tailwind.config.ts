import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './hooks/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        canvas: {
          light: '#fbfbfa',
          dark: '#0c0e12'
        },
        panel: {
          light: '#ffffff',
          dark: '#181b24'
        },
        ink: {
          light: '#0f172a',
          dark: '#f1f5f9'
        },
        dots: {
          light: '#94a3b8',
          dark: '#334155'
        },
        border: {
          light: '#e2e8f0',
          dark: '#272b37'
        },
        accent: {
          light: '#2563eb',
          dark: '#3b82f6'
        }
      }
    }
  },
  plugins: []
};

export default config;
