import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://site.example.com"),
  title: "Poker Lab · 德州扑克胜率计算器",
  description: "精确枚举与大样本蒙特卡洛结合，计算德州扑克多人胜率、分池权益和牌型概率。",
  openGraph: {
    title: "Poker Lab · 德州扑克胜率计算器",
    description: "精确枚举结合 50 万次多人蒙特卡洛，计算胜率、底池权益和牌型分布。",
    type: "website",
    images: [{ url: "https://site.example.com/og.png", width: 1200, height: 630, alt: "Poker Lab 德州扑克胜率计算器" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Poker Lab · 德州扑克胜率计算器",
    description: "精确枚举结合 50 万次多人蒙特卡洛，计算胜率、底池权益和牌型分布。",
    images: ["https://site.example.com/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
