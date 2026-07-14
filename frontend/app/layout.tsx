import type { Metadata } from "next"
import "./globals.css"
import AppShell from "../components/win95/AppShell"

export const metadata: Metadata = {
  title: "HTXpunk MV Generator",
  description: "Music video production tool by HTXpunk Productions",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
