import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/design-system/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        canvas: '#09090b',
        surface: {
          DEFAULT: '#111114',
          subtle: '#0c0c0e',
          elevated: '#18181c',
          hover: '#222228',
          active: '#272730'
        },
        surfaceElevated: '#18181c',
        surfaceHover: '#222228',
        surfaceActive: '#272730',
        borderSubtle: '#202024',
        borderDefault: '#2c2c32',
        borderStrong: '#3f3f48',
        borderFocus: '#ea580c',
        card: '#111114',
        cardBorder: '#2c2c32',
        accent: {
          DEFAULT: '#ea580c',
          hover: '#f97316',
          active: '#c2410c',
          subtle: 'rgba(234, 88, 12, 0.12)',
          muted: '#9a3412',
          border: 'rgba(249, 115, 22, 0.35)',
          contrast: '#ffffff'
        },
        primary: {
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          400: '#a1a1aa',
          500: '#ffffff',
          600: '#71717a',
          700: '#52525b',
          800: '#3f3f46',
          900: '#18181b',
          950: '#09090b'
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif']
      },
      borderRadius: {
        xs: '2px',
        sm: '4px',
        md: '6px',
        lg: '8px'
      },
      transitionDuration: {
        fast: '100ms',
        normal: '150ms',
        slow: '250ms'
      }
    }
  },
  plugins: []
};

export default config;
