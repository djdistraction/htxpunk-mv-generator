import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "HTXpunk MV Generator",
  description: "Music video production tool by HTXpunk Productions"
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
