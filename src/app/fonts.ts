// The two brand families, self-hosted at build time by next/font
// (brand/snippets/fonts.ts). Both variables go on <html> in layout.tsx;
// globals.css maps them to --font-display and --font-sans.
import { Fraunces, Geist_Mono, M_PLUS_Rounded_1c } from "next/font/google";

/** Wordmark, display text, H1 and H2. */
export const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["SOFT", "WONK", "opsz"], // weight stays variable when axes are set
  variable: "--font-fraunces",
  display: "swap",
});

/** Body text, UI, labels and H3. */
export const mplusRounded = M_PLUS_Rounded_1c({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mplus-rounded",
  display: "swap",
});

/** Code-like strings only. */
export const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});
