import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "HTXpunk Studio v2",
  description: "Music video production desk",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
