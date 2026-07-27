import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { AnalysisDataProvider } from "@/components/analysis-data-provider";
import { AnalysisParamsProvider } from "@/components/analysis-params-provider";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";

/**
 * PRD 13.3 asks for Inter-style UI type and a monospace face for numbers, and
 * requires that the app stay usable without an external font request.
 * `next/font` downloads these at build time and serves them from our own
 * origin, so nothing is fetched from a third party at runtime. The fallback
 * stacks in globals.css cover the case where the files fail to load at all.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "VN Risk Auditor — Portfolio risk intelligence",
  description:
    "Educational prototype for measuring, explaining and validating downside risk in a small Vietnamese equity portfolio. Uses simulated data.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} h-full`}>
      <body className="min-h-full font-sans antialiased">
        <AnalysisParamsProvider>
          <AnalysisDataProvider>
            <AppShell>{children}</AppShell>
          </AnalysisDataProvider>
        </AnalysisParamsProvider>
      </body>
    </html>
  );
}
