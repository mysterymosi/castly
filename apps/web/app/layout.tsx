import type { Metadata } from "next"
import { Geist, Geist_Mono, Outfit } from "next/font/google"

import "@workspace/ui/globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { siteUrl } from "@/lib/env"
import { initWebSentry } from "@/lib/sentry"
import { cn } from "@workspace/ui/lib/utils";

initWebSentry()

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: "Castly",
}

const outfit = Outfit({subsets:['latin'],variable:'--font-sans'})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", outfit.variable)}
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
