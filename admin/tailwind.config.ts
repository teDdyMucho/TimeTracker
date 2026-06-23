import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand:      '#0ABFA3',
        'brand-dark': '#089E87',
        ink:        '#0F172A',
        muted:      '#64748B',
      },
      boxShadow: {
        card:       '0 1px 3px 0 rgba(0,0,0,0.05), 0 1px 2px -1px rgba(0,0,0,0.03)',
        'card-hover':'0 8px 24px -4px rgba(0,0,0,0.1), 0 2px 8px -2px rgba(0,0,0,0.06)',
        'glow-brand':'0 0 20px rgba(10,191,163,0.25)',
        modal:      '0 24px 64px -12px rgba(0,0,0,0.25)',
      },
    },
  },
  plugins: [],
}

export default config
