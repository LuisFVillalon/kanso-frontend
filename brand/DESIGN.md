# kanso brand identity · v3

The source of truth for kanso's look, voice and logo. It applies to **kanso-frontend** (the app) and the **landing site**. Where this file and older styles disagree, this file wins.

## The idea

kanso is a calm, notebook-like workspace that turns an overwhelming to-do pile into one clear next step. The feeling it should give is relief and clarity. Primary tagline: **Keep it kanso.** Secondary line: **Ctrl + Zen** (focus mode shortcut, 404 page, social posts).

Who it's for: first, college students in demanding majors who procrastinate from overwhelm, not laziness. Then, anyone who works at a laptop and wants to optimize themselves.

## Logo: the k key

The mark is a single keyboard key in key red with a lowercase **k** set in Fraunces. The k stands for kanso. The key says "one key press to calm the chaos" and ties to Ctrl + Zen.

Files are in `logo/`. Every letter is outlined into a shape, so no font is needed to display them.

| File | Use |
| --- | --- |
| `kanso-mark.svg` | Default mark on paper or light backgrounds |
| `kanso-mark-dark.svg` | Mark on dark (ink) backgrounds |
| `kanso-mark-ink.svg` | One-color version, when red would clash (for example on a user's accent color) |
| `kanso-mark-pressed.svg` | The key pressed down: the end frame of the key-press animation |
| `kanso-mark-flat.svg` | Flat, bolder version for favicons and anything under 48 px |
| `kanso-lockup-horizontal(-dark).svg` | Key + wordmark: app header, landing nav, README |
| `kanso-lockup-stacked(-dark).svg` | Key above wordmark: sign-in and sign-up screens, square spaces |
| `kanso-wordmark(-light).svg` | Wordmark alone, where the key already appears nearby |

Rules:
- Keep clear space of at least a quarter of the key's width on every side.
- Never put anything on the key except the k. Never recolor the key outside the files provided, stretch it, rotate it or add effects.
- Use the flat mark below 48 px. Use the 3D key at 48 px and up.
- Always write the product name in lowercase: kanso.
- The old app mark (lucide's notebook-pen, `kanso-icon.svg`) is retired. Replace every use of it.

Icons are in `icons/`: `favicon.ico`, `favicon.svg`, `favicon-16/32/48/64.png`, `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`, `icon-512-dark.png`, `icon-maskable-512.png`, `kanso-mark-1024.png` and `og-image.png` (1200×630 social preview).

### The key press

The brand's signature motion. The key moves down by 8% of its height (16 units in the 200-unit viewBox), the side strip disappearing under it, then springs back.
- Use it when the user finishes their day's plan (the daily debrief is fully checked off) and when they enter focus mode (Ctrl + Zen).
- Timing: 120 ms down (ease-in), 180 ms back up (ease-out). Play it once, never loop.
- With `prefers-reduced-motion: reduce`, skip the motion and show the pressed frame for 300 ms.
- Copy for the day-complete moment: "Done. Your day, settled."

## Color

Tokens are in `tokens/tokens.css` (CSS variables using the existing `--tm-*` names) and `tokens/tokens.json`. The palette is named after stationery: paper, ink, pencil and the ruled line.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--tm-bg` Paper | #F4EFE4 | #191817 | Page canvas. Never pure white. |
| `--tm-surface` | #FBF8F1 | #24221F | Cards and panels |
| `--tm-text-primary` Ink | #191817 | #EDE6D6 | Headings, key copy, wordmark |
| `--tm-text-secondary` | #4A4640 | #CFC7B8 | Body text |
| `--tm-text-muted` | #6B655C | #B5AEA2 | Helper text, meta (5:1 or better) |
| `--tm-pencil` | #8A847A | #8A847A | Icons and dividers, not text |
| `--tm-rule` | #D6DEE3 | low-alpha | Notebook ruling, grid lines |
| `--kanso-key` Key red | #C8402F | #D4533F | Brand only (see below) |

Rough proportion on a typical screen: paper 60%, ink 25%, rule 8%, pencil 4%, key red 3% or less.

**Key red is brand-only.** Use it for the logo, marketing and the key-press moment. Never use it for buttons, links, errors, overdue tasks or small text.

**Buttons and links still follow the user's accent.** `--tm-accent`, `--tm-accent-hover`, `--tm-accent-subtle` and `--tm-accent-text` stay user-overridable from Settings → Appearance, exactly as today. Keep `DEFAULT_ACCENT` in `lib/theme.ts` unless told otherwise.

### Status colors

Always pair a status color with an icon and a word, never color alone.

| State | Name | Chip fill / text | Icon | Example label |
| --- | --- | --- | --- | --- |
| Completed | Leaf #7FB069 | #E4F0DC / #2F5A22 | check | "Done" |
| Due in a few days | Highlighter #E6B422 | #FAEFC8 / #5C4300 | clock | "In 3 days" |
| Due today or tomorrow | Marker orange #E0813A | #FBE1CE / #7A3510 | exclamation | "Due today" |
| Overdue | Slipped | #ECE7DD / #4A4640, with an 8 px #D9A441 dot | dot | "Slipped" |

Overdue is deliberately gentle. kanso never shows red for missed work.

## Typography

- **Fraunces** (variable, `SOFT` 100, `WONK` 0) for the wordmark, display text, H1 and H2. Its soft serifs feel like a printed notebook cover. Italic is used for the tagline.
- **M PLUS Rounded 1c** (400, 500, 700) for body text, UI, labels and H3. It's rounded and friendly for long reading.
- This replaces Inter. Keep Geist Mono for code-like strings only.
- Load both with `next/font` (see `snippets/fonts.ts`) and apply both variables on `<html>`.

| Style | Font | Size / line height | Weight |
| --- | --- | --- | --- |
| Display | Fraunces | 64 / 72 | 400 |
| H1 | Fraunces | 40 / 48 | 500 |
| H2 | Fraunces | 28 / 36 | 500 |
| H3 | M PLUS Rounded 1c | 18 / 26 | 700 |
| Body | M PLUS Rounded 1c | 16 / 26 | 400 |
| Small | M PLUS Rounded 1c | 13 / 20 | 500 |

The in-app body size can stay at 14 px where density matters, as long as line height stays at 1.6 or more.

## Shape

Radii: 4 px small, 8 px buttons and inputs, 12 px cards and modals, pills for chips only. Separate cards with a 1 px `--tm-border` hairline instead of shadows. The paper ruling styles (graph, dot grid, college rule, wide rule, isometric, blank) stay as they are; the ruling color comes from `--tm-rule`.

## Voice: a gentle friend

Calm, not loud. Honest, not hype. Kind, never guilt.

| Moment | Say | Not |
| --- | --- | --- |
| Streak breaks | "Fresh page. Pick up where it feels easy." | "You broke your 12-day streak." |
| Tasks slip | "3 things slipped. Start with this one." | "You have 3 overdue tasks!" |
| Day complete | "Done. Your day, settled." | "Crushed it!!! Keep grinding." |

Use short sentences in the second person, sentence case for headings and buttons, and no emoji in UI copy.

## Accessibility

- Every text color above holds 4.5:1 or better on its background in both themes.
- The k on the key is large display text: paper on key red is 4.3:1, which passes for its size. Never put small text on key red.
- Keep the existing focus style: a `--tm-accent` edge plus a 3 px `--tm-accent-subtle` ring.
- Respect `prefers-reduced-motion` for the key press and any decorative motion.
