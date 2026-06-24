import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "HTXpunk Productions",
  description: "AI-powered music video generator by HTXpunk Productions"
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-voodoo-black text-white min-h-screen">{children}</body>
    </html>
  )
}
