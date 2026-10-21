// app/fonts.ts — load the two brand families with next/font (self-hosted at build time).
// Apply both variables on <html>: className={`${fraunces.variable} ${mplusRounded.variable}`}
import { Fraunces, M_PLUS_Rounded_1c } from "next/font/google";

export const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["SOFT", "WONK", "opsz"], // weight stays variable when axes are set
  variable: "--font-fraunces",
  display: "swap",
});

export const mplusRounded = M_PLUS_Rounded_1c({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mplus-rounded",
  display: "swap",
});
