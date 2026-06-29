/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // ── BuildOne monochrome identity (black / white / grey) ───
        brand: {
          DEFAULT: '#1C1A16',   // near-black — primary accent / actions
          dark:    '#000000',   // pure black — hover / pressed
          light:   '#6B7280',   // mid grey — light accent
        },
        // ── Neutrals ─────────────────────────────────────────────
        ink:   '#18181B',       // primary text
        muted: '#71717A',       // secondary text
        faint: '#A1A1AA',       // placeholder / tertiary
        stone: '#F4F4F5',       // subtle fills / hover
        line:  '#E4E4E7',       // borders / dividers
        paper: '#F4F4F5',       // app background
      },
    },
  },
  plugins: [],
};
