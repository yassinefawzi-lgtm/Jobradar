import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: { default: "JobRadar", template: "%s — JobRadar" },
  description: "Veille emploi personnelle : offres scorées et expliquées.",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "JobRadar", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1013" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh">
        <Nav />
        <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4 sm:pb-10">{children}</div>
      </body>
    </html>
  );
}
