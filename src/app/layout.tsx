import type { Metadata, Viewport } from "next";
// Fonts are bundled with the app (npm packages) instead of next/font/google:
// that downloaded them from Google during every build, and a failed download
// failed the whole production build. The same two families as before: Noto
// Sans Hebrew (all weights; hebrew, latin, latin-ext, greek-ext...) and
// Manrope 300/400 (latin, greek...), each with its own unicode-range subsets.
import "@fontsource-variable/noto-sans-hebrew/wght.css";
import "@fontsource/manrope/300.css";
import "@fontsource/manrope/400.css";
import { getLocale, LOCALE_INFO } from "@/lib/i18n/locale";
import { PwaBootstrap } from "@/components/pwa-bootstrap";
import "./globals.css";

export const metadata: Metadata = {
  title: "MYS FLEET",
  description: "Charter yacht fleet management system",
  appleWebApp: {
    capable: true,
    title: "MYS FLEET",
    statusBarStyle: "black-translucent",
  },
};

// Without this, some Android browsers auto-invert the whole page under
// their own "force dark" heuristic when the phone is in dark mode - it
// doesn't know the site's colors were deliberately chosen, so it flips
// the light navy/paper theme into a black background with shifted,
// unreadable accent colors instead of leaving it alone. themeColor is a
// second, independent signal some browsers (Samsung Internet in
// particular) also check when deciding whether to auto-dark a page.
export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f8f8f7",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const { dir } = LOCALE_INFO[locale];

  return (
    <html lang={locale} dir={dir} className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-fleet-paper text-fleet-navy">
        <PwaBootstrap />
        {children}
      </body>
    </html>
  );
}
