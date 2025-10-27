import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "server-only";
import { getSiteUrl } from "@/utils/site-url";
import { ThemeProvider } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NextTopLoader from 'nextjs-toploader'
import { SITE_NAME, SITE_DESCRIPTION, SITE_URL } from "@/constants";
import { AgenticDevStudioStickyBanner } from "@/components/startup-studio-sticky-banner";
import type { Metadata } from "next";
export const dynamic = "force-dynamic";

const inter = Inter({ subsets: ["latin"] });
const SITE = getSiteUrl();
export const metadata: Metadata = {
  title: {
    default: SITE_NAME,
    template: `%s - ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  // ✅ 关键：用带协议的站点 URL 构造 metadataBase，避免构建期 Invalid URL
  metadataBase: new URL(SITE),
  keywords: ["SaaS", "Next.js", "React", "TypeScript", "Cloudflare Workers", "Edge Computing"],
  authors: [{ name: "Lubomir Georgiev" }],
  creator: "Lubomir Georgiev",
  openGraph: {
    type: "website",
    locale: "en_US",
    // ✅ 同样使用安全 URL
    url: SITE,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    creator: "@LubomirGeorg",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function BaseLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <NextTopLoader
          initialPosition={0.15}
          shadow="0 0 10px #000, 0 0 5px #000"
          height={4}
        />
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
        >
          <TooltipProvider
            delayDuration={100}
            skipDelayDuration={50}
          >
            {children}
          </TooltipProvider>
        </ThemeProvider>
        <Toaster richColors closeButton position="top-right" expand duration={7000} />
        <AgenticDevStudioStickyBanner />
      </body>
    </html>
  );
}
