import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Fraunces, Libre_Franklin } from "next/font/google";
import { Suspense } from "react";
import { Header } from "@/components/header";
import "./globals.css";

// Two typefaces only, as in Bucket List: Fraunces for headings and big numbers,
// Libre Franklin for everything else.
const fraunces = Fraunces({ subsets: ["latin"], axes: ["opsz"], variable: "--font-fraunces" });
const franklin = Libre_Franklin({ subsets: ["latin"], variable: "--font-franklin" });

export const metadata: Metadata = {
  title: { default: "Can I Play Right Now?", template: "%s · Can I Play?" },
  description: "Live golf conditions at Chicago's public courses and ranges, updated on their own.",
};

export const viewport: Viewport = { themeColor: "#f8f2e4" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fraunces.variable} ${franklin.variable} antialiased`}>
      <body className="min-h-dvh bg-page text-ink">
        <ClerkProvider>
          <a href="#main" className="sr-only z-50 rounded-md bg-green px-4 py-3 font-semibold text-on-green focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
            Skip to content
          </a>
          <Suspense fallback={<div className="h-16 border-b border-cream-deep bg-cream" />}>
            <Header />
          </Suspense>
          <main id="main" className="mx-auto w-full max-w-[90rem] px-4 pb-20 pt-6 sm:px-6 sm:pt-10 lg:px-12">
            {children}
          </main>
        </ClerkProvider>
      </body>
    </html>
  );
}
