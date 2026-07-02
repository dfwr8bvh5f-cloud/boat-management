import type { Metadata } from "next";
import { Noto_Sans_Hebrew } from "next/font/google";
import { getLocale, LOCALE_INFO } from "@/lib/i18n/locale";
import "./globals.css";

const notoSansHebrew = Noto_Sans_Hebrew({
  variable: "--font-noto-sans-hebrew",
  subsets: ["hebrew", "latin", "greek-ext"],
});

export const metadata: Metadata = {
  title: "MYS FLEET",
  description: "מערכת ניהול לצי סירות שכירות (charter)",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const { dir } = LOCALE_INFO[locale];

  return (
    <html lang={locale} dir={dir} className={`${notoSansHebrew.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-fleet-paper text-fleet-navy">{children}</body>
    </html>
  );
}
