/**
 * Static tables and small pure helpers behind the year calendar's per-month
 * "personality" cards: hues/icons/daylight per month, the abstract shape
 * compositions drawn in each month's band, and the holiday lookup (fixed
 * dates plus the floating US holidays, computed per year rather than
 * hard-coded).
 */
import type { LucideIcon } from 'lucide-react';
import {
  Snowflake,
  Heart,
  Clover,
  Flower2,
  Sprout,
  Sun,
  WavesLadder,
  ThermometerSun,
  School,
  Ghost,
  Handshake,
  CandyCane,
} from 'lucide-react';

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

interface MonthInfo {
  /** Accent hue — one of the feature colors listed below. */
  hue: string;
  icon: LucideIcon;
  /** Mid-month daylight hours for San Diego (32.7°N). */
  daylightHours: number;
}

// Hues come from one fixed set of feature colors (marigold, coral, sky wash,
// signal blue, saffron, vermillion, mocha, midnight) — no new colors.
export const MONTHS: MonthInfo[] = [
  { hue: '#62aef0', icon: Snowflake, daylightHours: 10.12 }, // January — Sky Wash
  { hue: '#f64932', icon: Heart, daylightHours: 10.9 }, // February — Coral
  { hue: '#097fe8', icon: Clover, daylightHours: 11.93 }, // March — Signal Blue
  { hue: '#62aef0', icon: Flower2, daylightHours: 12.97 }, // April — Sky Wash
  { hue: '#b18164', icon: Sprout, daylightHours: 13.78 }, // May — Mocha
  { hue: '#ffb110', icon: Sun, daylightHours: 14.22 }, // June — Marigold
  { hue: '#e89d01', icon: WavesLadder, daylightHours: 13.97 }, // July — Saffron
  { hue: '#e32d14', icon: ThermometerSun, daylightHours: 13.17 }, // August — Vermillion
  { hue: '#b18164', icon: School, daylightHours: 12.18 }, // September — Mocha
  { hue: '#e89d01', icon: Ghost, daylightHours: 11.18 }, // October — Saffron
  { hue: '#097fe8', icon: Handshake, daylightHours: 10.33 }, // November — Signal Blue
  { hue: '#02093a', icon: CandyCane, daylightHours: 9.92 }, // December — Midnight Ink
];

export interface MonthShape {
  l: string;
  t: string;
  w: number;
  h: number;
  r: string;
  /** 2px border instead of a fill. */
  ring?: boolean;
  anim: string;
  dur: number;
  delay?: number;
}

// One distinct abstract composition per month, drawn only from circles,
// rings, bars and squares. l/t are CSS values on the 34px band (percentages
// of the band, so negative tops overflow above it); w/h in px.
export const MONTH_SHAPES: MonthShape[][] = [
  // 0 January — ice diamonds
  [
    { l: '8%', t: '-30%', w: 26, h: 26, r: '4px', anim: 'tm-dia', dur: 19 },
    { l: '34%', t: '40%', w: 14, h: 14, r: '3px', anim: 'tm-dia2', dur: 13 },
    { l: '62%', t: '-10%', w: 34, h: 34, r: '5px', anim: 'tm-dia', dur: 24, delay: 3 },
    { l: '88%', t: '30%', w: 10, h: 10, r: '2px', anim: 'tm-dia2', dur: 16, delay: 1 },
  ],
  // 1 February — overlapping circles
  [
    { l: '10%', t: '-40%', w: 40, h: 40, r: '9999px', anim: 'tm-pulse', dur: 14 },
    { l: '26%', t: '25%', w: 22, h: 22, r: '9999px', anim: 'tm-pulse', dur: 11, delay: 2 },
    { l: '58%', t: '-20%', w: 52, h: 52, r: '9999px', ring: true, anim: 'tm-drift-b', dur: 26 },
    { l: '86%', t: '35%', w: 16, h: 16, r: '9999px', anim: 'tm-bob', dur: 9 },
  ],
  // 2 March — rain streaks
  [
    { l: '12%', t: '-50%', w: 5, h: 30, r: '9999px', anim: 'tm-bob', dur: 7 },
    { l: '28%', t: '-10%', w: 5, h: 22, r: '9999px', anim: 'tm-bob', dur: 9, delay: 1 },
    { l: '46%', t: '-60%', w: 5, h: 34, r: '9999px', anim: 'tm-bob', dur: 8, delay: 2 },
    { l: '68%', t: '-20%', w: 5, h: 26, r: '9999px', anim: 'tm-bob', dur: 10, delay: 0.5 },
    { l: '84%', t: '10%', w: 44, h: 44, r: '9999px', ring: true, anim: 'tm-drift-a', dur: 28 },
  ],
  // 3 April — petal scatter
  [
    { l: '6%', t: '10%', w: 18, h: 18, r: '9999px', anim: 'tm-sway', dur: 15 },
    { l: '22%', t: '-35%', w: 26, h: 26, r: '9999px', anim: 'tm-sway', dur: 19, delay: 2 },
    { l: '44%', t: '30%', w: 12, h: 12, r: '9999px', anim: 'tm-sway', dur: 12, delay: 1 },
    { l: '60%', t: '-25%', w: 34, h: 34, r: '9999px', ring: true, anim: 'tm-sway', dur: 23, delay: 3 },
    { l: '84%', t: '0%', w: 20, h: 20, r: '9999px', anim: 'tm-sway', dur: 17, delay: 4 },
  ],
  // 4 May — stems
  [
    { l: '14%', t: '20%', w: 6, h: 40, r: '9999px', anim: 'tm-bob', dur: 12 },
    { l: '24%', t: '40%', w: 6, h: 30, r: '9999px', anim: 'tm-bob', dur: 10, delay: 1 },
    { l: '34%', t: '10%', w: 6, h: 48, r: '9999px', anim: 'tm-bob', dur: 14, delay: 2 },
    { l: '58%', t: '-20%', w: 30, h: 30, r: '9999px', ring: true, anim: 'tm-drift-a', dur: 25 },
    { l: '82%', t: '25%', w: 14, h: 14, r: '9999px', anim: 'tm-pulse', dur: 9 },
  ],
  // 5 June — concentric sun rings
  [
    { l: '8%', t: '-60%', w: 56, h: 56, r: '9999px', ring: true, anim: 'tm-spin', dur: 40 },
    { l: '20%', t: '-20%', w: 34, h: 34, r: '9999px', anim: 'tm-pulse', dur: 12 },
    { l: '52%', t: '-80%', w: 72, h: 72, r: '9999px', ring: true, anim: 'tm-spin', dur: 55, delay: 2 },
    { l: '86%', t: '20%', w: 16, h: 16, r: '9999px', anim: 'tm-pulse', dur: 8, delay: 1 },
  ],
  // 6 July — wave bars
  [
    { l: '-10%', t: '10%', w: 90, h: 8, r: '9999px', anim: 'tm-drift-a', dur: 18 },
    { l: '20%', t: '50%', w: 120, h: 6, r: '9999px', anim: 'tm-drift-b', dur: 24, delay: 1 },
    { l: '8%', t: '-25%', w: 70, h: 7, r: '9999px', anim: 'tm-drift-b', dur: 21, delay: 2 },
    { l: '62%', t: '25%', w: 100, h: 5, r: '9999px', anim: 'tm-drift-a', dur: 27, delay: 3 },
  ],
  // 7 August — heat rings
  [
    { l: '62%', t: '-90%', w: 76, h: 76, r: '9999px', ring: true, anim: 'tm-pulse', dur: 16 },
    { l: '70%', t: '-50%', w: 52, h: 52, r: '9999px', ring: true, anim: 'tm-pulse', dur: 13, delay: 1 },
    { l: '78%', t: '-10%', w: 28, h: 28, r: '9999px', anim: 'tm-pulse', dur: 10, delay: 2 },
    { l: '14%', t: '20%', w: 18, h: 18, r: '9999px', anim: 'tm-drift-a', dur: 20 },
    { l: '36%', t: '-15%', w: 12, h: 12, r: '9999px', anim: 'tm-bob', dur: 11 },
  ],
  // 8 September — orchard
  [
    { l: '10%', t: '-20%', w: 30, h: 30, r: '9999px', anim: 'tm-drift-a', dur: 22 },
    { l: '40%', t: '25%', w: 18, h: 18, r: '9999px', anim: 'tm-drift-b', dur: 17, delay: 1 },
    { l: '56%', t: '-45%', w: 44, h: 44, r: '9999px', ring: true, anim: 'tm-drift-a', dur: 29, delay: 2 },
    { l: '84%', t: '5%', w: 22, h: 22, r: '6px', anim: 'tm-dia', dur: 19 },
  ],
  // 9 October — drifting ovals
  [
    { l: '12%', t: '-35%', w: 40, h: 40, r: '9999px', ring: true, anim: 'tm-sway', dur: 21 },
    { l: '34%', t: '15%', w: 24, h: 16, r: '9999px', anim: 'tm-sway', dur: 15, delay: 1 },
    { l: '58%', t: '-25%', w: 32, h: 32, r: '9999px', anim: 'tm-sway', dur: 18, delay: 2 },
    { l: '82%', t: '25%', w: 52, h: 20, r: '9999px', ring: true, anim: 'tm-sway', dur: 24, delay: 3 },
  ],
  // 10 November — utensil bars
  [
    { l: '12%', t: '-10%', w: 5, h: 34, r: '9999px', anim: 'tm-drift-a', dur: 20 },
    { l: '20%', t: '10%', w: 5, h: 26, r: '9999px', anim: 'tm-drift-a', dur: 17, delay: 1 },
    { l: '28%', t: '-30%', w: 5, h: 44, r: '9999px', anim: 'tm-drift-a', dur: 23, delay: 2 },
    { l: '56%', t: '0%', w: 5, h: 30, r: '9999px', anim: 'tm-drift-b', dur: 19 },
    { l: '64%', t: '20%', w: 5, h: 22, r: '9999px', anim: 'tm-drift-b', dur: 15, delay: 1 },
    { l: '86%', t: '-40%', w: 38, h: 38, r: '9999px', ring: true, anim: 'tm-spin', dur: 38 },
  ],
  // 11 December — gift squares and ribbon
  [
    { l: '10%', t: '-25%', w: 30, h: 30, r: '3px', anim: 'tm-dia', dur: 26 },
    { l: '34%', t: '25%', w: 16, h: 16, r: '2px', anim: 'tm-dia2', dur: 14 },
    { l: '52%', t: '40%', w: 90, h: 6, r: '2px', anim: 'tm-drift-b', dur: 22 },
    { l: '70%', t: '-45%', w: 44, h: 44, r: '4px', ring: true, anim: 'tm-dia', dur: 30, delay: 2 },
    { l: '92%', t: '10%', w: 12, h: 12, r: '2px', anim: 'tm-dia2', dur: 12, delay: 1 },
  ],
];

const YELLOW_HUES = new Set(['#ffb110', '#e89d01']);
const isYellowHue = (hue: string): boolean => YELLOW_HUES.has(hue);

/** Card/band/shape tints — mixed against the surface token, per §3. */
export const monthCardBg = (hue: string, isCurrent: boolean): string =>
  `color-mix(in srgb, ${hue} ${isCurrent ? 11 : 6}%, var(--tm-surface))`;

export const monthBandBg = (hue: string, isCurrent: boolean): string =>
  `color-mix(in srgb, ${hue} ${isCurrent ? 30 : 20}%, var(--tm-surface))`;

export const monthShapeColor = (hue: string, isCurrent: boolean): string => {
  const bandPct = isCurrent ? 30 : 20;
  return `color-mix(in srgb, ${hue} ${Math.round(bandPct * 1.9)}%, var(--tm-surface))`;
};

/**
 * Accessibility-tuned month-name ink. The yellow-family months (marigold,
 * saffron) need a deeper ink share to clear 4.5:1 at 14px bold on their own
 * tint — do not simplify to a single percentage for all hues.
 */
export const monthNameColor = (hue: string): string =>
  `color-mix(in srgb, ${hue} ${isYellowHue(hue) ? 34 : 62}%, var(--tm-text-primary))`;

export const daylightRailPct = (hours: number): number => Math.round((hours / 24) * 100);

export const formatDaylight = (hours: number): string => {
  const h = Math.floor(hours);
  const m = Math.round((hours % 1) * 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
};

export const formatHours = (hours: number): string =>
  Number.isInteger(hours) ? `${hours}` : hours.toFixed(1);

const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Today · EEE MMM d" hero pill label from a locale-safe YYYY-MM-DD string. */
export const formatHeroDate = (dateStr: string): string => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAY_ABBR[date.getDay()]} ${MONTH_NAMES[date.getMonth()].slice(0, 3)} ${date.getDate()}`;
};

// ─────────────────────────────────────────────────────────────────────────
// Holidays — fixed dates are stable; the floating US holidays are computed
// per year rather than hard-coded (MLK = 3rd Mon of Jan, Presidents' = 3rd
// Mon of Feb, Easter, Mother's Day = 2nd Sun of May, Memorial = last Mon of
// May, Labor = 1st Mon of Sep, Indigenous Peoples' = 2nd Mon of Oct,
// Thanksgiving = 4th Thu of Nov).
// ─────────────────────────────────────────────────────────────────────────

/** 1-indexed day of the nth given weekday (0=Sun..6=Sat) in a month. */
const nthWeekday = (year: number, month: number, weekday: number, n: number): number => {
  const firstWeekday = new Date(year, month, 1).getDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  return 1 + offset + (n - 1) * 7;
};

/** 1-indexed day of the last given weekday (0=Sun..6=Sat) in a month. */
const lastWeekday = (year: number, month: number, weekday: number): number => {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lastDayWeekday = new Date(year, month, daysInMonth).getDay();
  const offset = (lastDayWeekday - weekday + 7) % 7;
  return daysInMonth - offset;
};

/** Gregorian Easter Sunday (Anonymous/Meeus algorithm). Returns 0-indexed month. */
const easter = (year: number): { month: number; day: number } => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monthOneIndexed = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month: monthOneIndexed - 1, day };
};

type HolidayTable = Record<number, Record<number, string>>;

/** Month index (0-11) → day of month → holiday name, computed for the given year. */
export const getHolidays = (year: number): HolidayTable => {
  const table: HolidayTable = {
    0: { 1: "New Year's Day" },
    1: { 14: "Valentine's Day" },
    2: { 17: "St. Patrick's Day", 20: 'Spring equinox' },
    3: { 22: 'Earth Day' },
    4: { 5: 'Cinco de Mayo' },
    5: { 19: 'Juneteenth', 21: 'Summer solstice' },
    6: { 4: 'Independence Day' },
    7: {},
    8: { 22: 'Fall equinox' },
    9: { 31: 'Halloween' },
    10: { 11: 'Veterans Day' },
    11: { 21: 'Winter solstice', 25: 'Christmas Day', 31: "New Year's Eve" },
  };

  table[0][nthWeekday(year, 0, 1, 3)] = 'MLK Jr. Day';
  table[1][nthWeekday(year, 1, 1, 3)] = "Presidents' Day";
  const { month: easterMonth, day: easterDay } = easter(year);
  table[easterMonth] = { ...table[easterMonth], [easterDay]: 'Easter' };
  table[4][nthWeekday(year, 4, 0, 2)] = "Mother's Day";
  table[4][lastWeekday(year, 4, 1)] = 'Memorial Day';
  table[8][nthWeekday(year, 8, 1, 1)] = 'Labor Day';
  table[9][nthWeekday(year, 9, 1, 2)] = "Indigenous Peoples' Day";
  table[10][nthWeekday(year, 10, 4, 4)] = 'Thanksgiving';

  return table;
};
