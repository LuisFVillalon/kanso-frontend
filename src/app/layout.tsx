import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./context/AuthContext";
import { AppDataProvider } from "./context/AppDataProvider";
import { ToastProvider } from "./context/ToastContext";

const inter = Inter({
  variable: "--font-heading",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kanso-web-app.vercel.app";
const DESCRIPTION =
  "Tasks, notes, habits and a daily debrief in one calm workspace. " +
  "A full-stack Next.js + FastAPI + Postgres app. Try the demo, no signup needed.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "kanso · clarity on the go",
    template: "%s · kanso",
  },
  description: DESCRIPTION,
  applicationName: "kanso",
  openGraph: {
    type: "website",
    siteName: "kanso",
    title: "kanso · clarity on the go",
    description: DESCRIPTION,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "kanso · clarity on the go",
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    /*
     * suppressHydrationWarning is required because the anti-flash script below
     * may add the .dark class to <html> before React hydrates, causing a
     * mismatch between server-rendered HTML and the client DOM.
     */
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${geistMono.variable} antialiased`}>
        {/*
         * Anti-flash script — runs synchronously before the first paint.
         * Follows the OS dark-mode preference and sets .dark on <html> so the
         * correct CSS variables are active before any component renders,
         * preventing the flash of the wrong theme. There is no manual
         * light/dark toggle in the app today — this only mirrors the OS setting.
         */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(window.matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.classList.add('dark')}catch(e){}})()`,
          }}
        />
        {/*
         * Same anti-flash approach, but for the user's chosen accent color
         * (Settings → Appearance). Mirrors the luminance check in
         * src/app/lib/theme.ts so the correct --tm-accent-text is set before
         * first paint.
         */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var c=localStorage.getItem('tm_theme_accent');if(!c)return;var s=document.documentElement.style;s.setProperty('--tm-accent',c);s.setProperty('--tm-accent-hover','color-mix(in srgb, '+c+' 88%, white)');s.setProperty('--tm-accent-subtle','color-mix(in srgb, '+c+' 12%, white)');var r=parseInt(c.slice(1,3),16)/255,g=parseInt(c.slice(3,5),16)/255,b=parseInt(c.slice(5,7),16)/255;var lin=function(v){return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};var lum=0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);s.setProperty('--tm-accent-text',lum>0.45?'#171717':'#FFFFFF')}catch(e){}})()`,
          }}
        />
        {/*
         * Same anti-flash approach, but for the user's chosen notebook page
         * ruling (Settings → Appearance). Stamps data-page-style on <html>
         * before first paint so the correct background pattern is active
         * from the start — see the [data-page-style] selectors in globals.css.
         */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=localStorage.getItem('tm_page_style');if(p)document.documentElement.setAttribute('data-page-style',p)}catch(e){}})()`,
          }}
        />
        <AuthProvider>
          <ToastProvider>
            <AppDataProvider>{children}</AppDataProvider>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
