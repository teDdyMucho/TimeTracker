import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── BuildOne monochrome identity (black / white / grey) ──
        brand:        '#1C1A16',   // near-black — primary actions, active states
        'brand-dark': '#000000',   // pure black — hover/pressed
        'brand-light':'#6B7280',   // mid grey
        ink:          '#18181B',   // primary text
        muted:        '#71717A',   // secondary text
        faint:        '#A1A1AA',   // tertiary text
        stone:        '#F4F4F5',   // neutral page surface
        line:         '#E4E4E7',   // borders / dividers
        paper:        '#F4F4F5',   // page background
        // ── Dashboard palette (monochrome greyscale) ──
        primary:      '#1C1A16',   // near-black — solid actions
        'primary-50': '#F4F4F5',
        accent:       '#3F3F46',   // dark grey — accent / links
        'accent-50':  '#F4F4F5',
        coffee:       '#52525B',   // grey — secondary data
        'coffee-dark':'#3F3F46',
        'coffee-50':  '#F4F4F5',
        gold:         '#A1A1AA',   // light grey accent (was amber)
        'gold-50':    '#FAFAFA',
        tan:          '#D4D4D8',   // neutral data
        espresso:     '#1C1A16',   // sidebar active pill
        surface:      '#FFFFFF',
      },
      boxShadow: {
        card:         '0 1px 3px 0 rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.04)',
        'card-hover': '0 8px 24px -4px rgba(0,0,0,0.10), 0 2px 8px -2px rgba(0,0,0,0.06)',
        'glow-brand': '0 0 20px rgba(28,26,22,0.20)',
        modal:        '0 24px 64px -12px rgba(0,0,0,0.25)',
      },
    },
  },
  plugins: [],
}

export default config
