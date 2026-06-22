import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: '#0ABFA3',
        ink: '#1E293B',
        muted: '#64748B',
      },
    },
  },
  plugins: [],
}

export default config
