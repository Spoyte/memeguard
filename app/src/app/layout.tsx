import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MemeGuard — AI Meme Token Security Auditor",
  description:
    "Real-time AI-powered security auditor for BSC meme tokens. Detects rug pulls, honeypots, and hidden mint functions before you invest.",
  keywords: [
    "BSC",
    "BNB Chain",
    "meme token",
    "rug pull detector",
    "honeypot checker",
    "smart contract audit",
    "AI security",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrains.variable} h-full dark`}
    >
      <body className="min-h-full flex flex-col bg-[#0a0a0f] text-white antialiased font-[family-name:var(--font-inter)]">
        {children}
      </body>
    </html>
  );
}
