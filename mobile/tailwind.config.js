/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0ABFA3',
          dark: '#089080',
          surface: '#062B26',
        },
        ink: '#101113',
        muted: '#6B7280',
      },
    },
  },
  plugins: [],
};
