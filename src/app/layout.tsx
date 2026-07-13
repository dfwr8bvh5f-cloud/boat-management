import type { Metadata } from "next";
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
