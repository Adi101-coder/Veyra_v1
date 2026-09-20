import type { Metadata } from "next";
import { siteConfig } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: siteConfig.title,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full overflow-x-clip antialiased" data-scroll-behavior="smooth">
      <body className="flex min-h-full min-w-0 flex-col overflow-x-clip bg-background font-sans">
        {children}
      </body>
    </html>
  );
}
