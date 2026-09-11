import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#e3f2fd',
          100: '#bbdefb',
          200: '#90caf9',
          300: '#64b5f6',
          400: '#42a5f5',
          500: '#2e86c1',
          600: '#1b4d7a',
          700: '#163d5c',
          800: '#0d2137',
          900: '#0a1a2b',
        },
        accent: {
          DEFAULT: '#00b4d8',
          light: '#90e0ef',
          dark: '#0077b6',
        },
        success: '#27ae60',
        warning: '#f39c12',
        error: '#e74c3c',
      },
      fontFamily: {
        sans: ['Inter', 'Arial', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
