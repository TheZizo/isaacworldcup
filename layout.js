import "./globals.css"

export const metadata = {
  title: "World Cup 2026 Predictions",
  description: "Predict every match of the 2026 World Cup and climb the leaderboard.",
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
