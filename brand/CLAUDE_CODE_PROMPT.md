# Prompt for Claude Code

Unzip this kit to `brand/` at the root of the repo, then paste the prompt below into Claude Code. Run it once in **kanso-frontend** and once in the **landing site** repo.

---

Implement the kanso brand identity in `brand/`. Read `brand/DESIGN.md` first; it is the source of truth and wins over older styles and over any earlier design notes in this repo.

Work in this order, and show me a plan before editing:

1. **Tokens.** Add `brand/tokens/tokens.css` to the global stylesheet (copy it into `app/` or import it from `globals.css`). Update the existing `--tm-*` values in `:root` and add the `.dark` block so both themes match the file. Leave the user-overridable accent system (`--tm-accent*`, `accent-option-*`, `DEFAULT_ACCENT` in `lib/theme.ts`) working exactly as it does now. If the project uses Tailwind v4, add `brand/snippets/tailwind-theme.css` after the tokens; if it uses v3, map the same variables in `tailwind.config`.
2. **Fonts.** Replace Inter with Fraunces (display) and M PLUS Rounded 1c (body/UI) using `brand/snippets/fonts.ts` and `next/font`. Apply both CSS variables on `<html>`. Keep Geist Mono for code. Apply the type scale in DESIGN.md: Fraunces for the wordmark, display, H1 and H2; M PLUS Rounded 1c for everything else.
3. **Logo and icons.** Retire the lucide notebook-pen mark (`kanso-icon.svg`) everywhere. Use `brand/logo/kanso-lockup-horizontal.svg` (and the `-dark` version in dark mode) in the app header and landing nav, and `kanso-lockup-stacked.svg` on the sign-in and sign-up cards. Inline the SVGs or import them as React components so they swap cleanly between themes. Install the icons with Next.js file conventions: `app/favicon.ico`, `app/icon.svg` (from `favicon.svg`), `app/apple-icon.png` (from `apple-touch-icon.png`). Copy `icon-192.png`, `icon-512.png` and `icon-maskable-512.png` to `public/` and add `brand/snippets/manifest.webmanifest` as `app/manifest.webmanifest` (or `app/manifest.ts`). On the landing site, replace the generated Open Graph image with `brand/icons/og-image.png` (as `app/opengraph-image.png`, removing the old `opengraph-image` route) and use the same image for Twitter cards.
4. **Status colors.** Update task due-date and completion chips to the four states in DESIGN.md (Done, In N days, Due today, Slipped), each with an icon and a label. Overdue must never be red.
5. **Key-press moment.** Add the key-press animation from DESIGN.md: when every task in today's plan is completed, show the mark pressing down once with the copy "Done. Your day, settled."; also play it when entering focus mode. Honor `prefers-reduced-motion`.
6. **Copy.** Update user-facing copy that conflicts with the voice table in DESIGN.md (streak breaks, overdue tasks, day complete). Use "Keep it kanso." as the tagline on the landing hero and footer.
7. **Clean up.** Remove references to the old blue-on-white identity, the old mark and Inter. Remove any Japanese characters or the Japanese-character gloss from UI, metadata and docs; the name stays "kanso".

When you're done, run the build and lint, check both themes in the browser, and list every file you changed. Don't change the accent picker, the paper-style options or any data logic.
