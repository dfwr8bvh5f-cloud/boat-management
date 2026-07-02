import type { Metadata } from "next";
import { Noto_Sans_Hebrew } from "next/font/google";
import "./globals.css";

const notoSansHebrew = Noto_Sans_Hebrew({
  variable: "--font-noto-sans-hebrew",
  subsets: ["hebrew", "latin"],
});

export const metadata: Metadata = {
  title: "MYS FLEET",
  description: "מערכת ניהול לצי סירות שכירות (charter)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className={`${notoSansHebrew.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-fleet-paper text-fleet-navy">{children}</body>
    </html>
  );
}
