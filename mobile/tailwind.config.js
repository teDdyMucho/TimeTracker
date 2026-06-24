/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // ── Build One brand palette ───────────────────────────────
        brand: {
          DEFAULT: '#9A7A4E',   // Bronze 500 — primary accent
          dark:    '#836439',   // Bronze 600 — hover
          light:   '#C7AB82',   // Bronze 300 — light accent
        },
        // ── Neutrals ─────────────────────────────────────────────
        ink:   '#1F1D1A',       // Charcoal — primary text
        muted: '#76716A',       // Muted — secondary text
        faint: '#A39C90',       // Faint — placeholder / tertiary
        stone: '#EFEAE1',       // Stone — subtle fills / hover
        line:  '#E7E2D8',       // Line — borders / dividers
        paper: '#F6F4EF',       // Paper — app background
      },
    },
  },
  plugins: [],
};
