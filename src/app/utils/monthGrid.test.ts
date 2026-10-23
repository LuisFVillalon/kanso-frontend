import { describe, expect, it } from 'vitest';
import { gridKeyTarget, monthCells } from './monthGrid';
import { toLocalDateStr } from './dateUtils';

const at = (y: number, m: number, d: number) => new Date(y, m, d);
const move = (from: Date, key: string) => {
  const next = gridKeyTarget(from, key);
  return next && toLocalDateStr(next);
};

describe('monthCells', () => {
  it('starts the grid on Monday and pads every month to 42 cells', () => {
    const oct = monthCells(2026, 9); // 1 Oct 2026 is a Thursday
    expect(oct).toHaveLength(42);
    expect(oct.slice(0, 3)).toEqual([null, null, null]);
    expect(toLocalDateStr(oct[3]!)).toBe('2026-10-01');
    expect(toLocalDateStr(oct[33]!)).toBe('2026-10-31');
    expect(oct.slice(34).every(c => c === null)).toBe(true);

    const feb = monthCells(2021, 1); // 1 Feb 2021 is a Monday; 28 days
    expect(feb).toHaveLength(42);
    expect(toLocalDateStr(feb[0]!)).toBe('2021-02-01');
  });
});

describe('gridKeyTarget', () => {
  it('steps days and weeks, crossing month and year edges', () => {
    expect(move(at(2026, 9, 21), 'ArrowRight')).toBe('2026-10-22');
    expect(move(at(2026, 9, 1), 'ArrowLeft')).toBe('2026-09-30');
    expect(move(at(2026, 9, 28), 'ArrowDown')).toBe('2026-11-04');
    expect(move(at(2026, 0, 3), 'ArrowUp')).toBe('2025-12-27');
  });

  it('goes to the start and end of the Monday-first week', () => {
    expect(move(at(2026, 9, 21), 'Home')).toBe('2026-10-19');
    expect(move(at(2026, 9, 21), 'End')).toBe('2026-10-25');
    expect(move(at(2026, 9, 25), 'Home')).toBe('2026-10-19');
  });

  it('pages a month, keeping the day or clamping it to the month end', () => {
    expect(move(at(2026, 9, 21), 'PageDown')).toBe('2026-11-21');
    expect(move(at(2026, 2, 31), 'PageUp')).toBe('2026-02-28');
    expect(move(at(2026, 0, 31), 'PageDown')).toBe('2026-02-28');
    expect(move(at(2026, 11, 15), 'PageDown')).toBe('2027-01-15');
    expect(move(at(2026, 0, 15), 'PageUp')).toBe('2025-12-15');
  });

  it('ignores other keys', () => {
    expect(gridKeyTarget(at(2026, 9, 21), 'Enter')).toBeNull();
    expect(gridKeyTarget(at(2026, 9, 21), 'a')).toBeNull();
  });
});
