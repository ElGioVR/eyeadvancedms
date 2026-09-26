import type { Config } from 'tailwindcss';
import colors from 'tailwindcss/colors';

/**
 * Sistema de diseño EyeAdvanced
 * - Tokens semánticos (surface, line, fg, muted, canvas...) definidos como
 *   variables CSS en globals.css; cambian automáticamente entre light y dark.
 * - `gray` apunta a `slate` para un tono clínico, frío y moderno.
 */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        gray: colors.slate,
        primary: {
          50: '#eef7fc',
          100: '#d7ecf8',
          200: '#b3dbf1',
          300: '#7fc2e6',
          400: '#43a3d7',
          500: '#1f86c2',
          600: '#166ba5',
          700: '#155686',
          800: '#16486e',
          900: '#173d5c',
          950: '#0f273d',
        },
        accent: {
          DEFAULT: '#00b4d8',
          light: '#90e0ef',
          dark: '#0077b6',
        },
        success: '#16a34a',
        warning: '#f59e0b',
        error: '#ef4444',
        // Tokens semánticos (light/dark automáticos)
        canvas: token('canvas'),
        surface: {
          DEFAULT: token('surface'),
          2: token('surface-2'),
          3: token('surface-3'),
        },
        line: {
          DEFAULT: token('line'),
          strong: token('line-strong'),
        },
        fg: {
          DEFAULT: token('fg'),
          2: token('fg-2'),
        },
        muted: token('muted'),
        brand: token('brand'),
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        soft: '0 1px 2px rgb(15 23 42 / 0.04), 0 1px 3px rgb(15 23 42 / 0.06)',
        card: '0 1px 2px rgb(15 23 42 / 0.04), 0 4px 16px -4px rgb(15 23 42 / 0.08)',
        pop: '0 12px 40px -8px rgb(15 23 42 / 0.25), 0 2px 6px rgb(15 23 42 / 0.08)',
      },
      keyframes: {
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        sheetUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        popIn: {
          '0%': { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        slideUp: 'slideUp 0.4s ease-out',
        sheetUp: 'sheetUp 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
        fadeIn: 'fadeIn 0.2s ease-out',
        popIn: 'popIn 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
