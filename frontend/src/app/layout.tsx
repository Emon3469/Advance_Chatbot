import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-mono-code",
  subsets: ["latin"],
  display: "swap",
});

const appName = process.env.NEXT_PUBLIC_APP_NAME || "Nexio AI";

export const metadata: Metadata = {
  title: {
    default: `${appName} | Your AI Assistant`,
    template: `%s | ${appName}`,
  },
  description:
    "An agentic AI assistant with real-time streaming, web search, document Q&A and automatic multi-model fallback.",
  applicationName: appName,
  openGraph: {
    title: appName,
    description: "Agentic AI assistant with streaming answers, tools and document Q&A.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#071330",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${jakarta.variable} ${mono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
