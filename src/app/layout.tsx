import type { Metadata, Viewport } from "next";
import { Noto_Sans_Hebrew, Poppins } from "next/font/google";
import { getLocale, LOCALE_INFO } from "@/lib/i18n/locale";
import "./globals.css";

const notoSansHebrew = Noto_Sans_Hebrew({
  variable: "--font-noto-sans-hebrew",
  subsets: ["hebrew", "latin", "greek-ext"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400"],
});

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
// unreadable accent colors instead of leaving it alone.
export const viewport: Viewport = {
  colorScheme: "light",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const { dir } = LOCALE_INFO[locale];

  return (
    <html lang={locale} dir={dir} className={`${notoSansHebrew.variable} ${poppins.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-fleet-paper text-fleet-navy">{children}</body>
    </html>
  );
}
