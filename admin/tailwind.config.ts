import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── Build One brand (kept for mobile & non-dashboard pages) ──
        brand:        '#9A7A4E',
        'brand-dark': '#836439',
        'brand-light':'#C7AB82',
        ink:          '#2D2A26',
        muted:        '#8A857C',
        faint:        '#B4AEA3',
        stone:        '#F2F0EA',
        line:         '#ECEAE4',
        paper:        '#F7F6F2',
        // ── Dashboard SaaS palette (BuildOne: bronze + coffee) ──
        primary:      '#16A34A',   // Green 600 — solid actions
        'primary-50': '#E9F9EF',
        accent:       '#22C55E',   // Green 500 — accent / links
        'accent-50':  '#E9F9EF',
        coffee:       '#6F5B45',   // Espresso brown — secondary data
        'coffee-dark':'#5A4A38',
        'coffee-50':  '#F0EBE3',
        gold:         '#F5B33E',   // Amber accent
        'gold-50':    '#FCF3E2',
        tan:          '#D2C5AE',   // Neutral data
        espresso:     '#2B2722',   // Sidebar active pill
        surface:      '#F7F6F2',
      },
      boxShadow: {
        card:         '0 1px 3px 0 rgba(43,39,34,0.06), 0 1px 2px -1px rgba(43,39,34,0.04)',
        'card-hover': '0 8px 24px -4px rgba(43,39,34,0.10), 0 2px 8px -2px rgba(43,39,34,0.06)',
        'glow-brand': '0 0 20px rgba(154,122,78,0.25)',
        modal:        '0 24px 64px -12px rgba(43,39,34,0.25)',
      },
    },
  },
  plugins: [],
}

export default config
