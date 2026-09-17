import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers/Providers";
import { PwaRegistrar } from "@/components/pwa/PwaRegistrar";
import "./globals.css";

export const metadata: Metadata = {
  title: "SRH Ops — Terrain",
  description: "Console terrain SRH Recyclage : collectes, photos, signature et rapport, utilisable hors-ligne.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SRH Ops",
  },
  icons: {
    icon: "/icons/icon-512x512.png",
    shortcut: "/icons/icon-192x192.png",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    other: [
      { rel: "mask-icon", url: "/icons/icon-maskable-512x512.png", color: "#0d631b" },
      { rel: "manifest", url: "/manifest.webmanifest" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#0d631b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
          rel="stylesheet"
        />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="antialiased">
        <Providers>
          {children}
          <PwaRegistrar />
        </Providers>
      </body>
    </html>
  );
}
