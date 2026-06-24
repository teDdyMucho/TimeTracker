import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BuildOne Admin',
  description: 'BuildOne — workforce management admin portal',
  icons: { icon: '/favcon.png' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
