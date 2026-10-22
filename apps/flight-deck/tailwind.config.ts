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
        surface: '#111114',
        surfaceElevated: '#18181c',
        surfaceHover: '#222228',
        surfaceActive: '#272730',
        borderSubtle: '#202024',
        borderDefault: '#2c2c32',
        borderStrong: '#3f3f48',
        borderFocus: '#71717a',
        card: '#111114',
        cardBorder: '#2c2c32',
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
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace']
      }
    }
  },
  plugins: []
};

export default config;
