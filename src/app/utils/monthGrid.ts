/**
 * Sunday-start 6×7 grid for a month: leading nulls before the 1st, the days,
 * then trailing nulls up to a fixed 42 cells. Every month renders the same
 * grid height that way — some months only need 4-5 rows, which would
 * otherwise make the card shorter and shift surrounding layout while paging.
 */
export const monthCells = (year: number, month: number): (Date | null)[] => {
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // JS getDay() is 0=Sun, which is also the grid's first column.
  const leadingBlanks = firstOfMonth.getDay();
  const result: (Date | null)[] = Array(leadingBlanks).fill(null);
  for (let day = 1; day <= daysInMonth; day++) result.push(new Date(year, month, day));
  while (result.length < 42) result.push(null);
  return result;
};

/**
 * Where a key press in a month grid moves the picked day: arrows step a day
 * or a week, Home/End go to the week's Sunday/Saturday, PageUp/PageDown step a
 * month (clamped to that month's last day). Null for any other key.
 */
export const gridKeyTarget = (date: Date, key: string): Date | null => {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  const dow = date.getDay();
  switch (key) {
    case 'ArrowLeft': return new Date(y, m, d - 1);
    case 'ArrowRight': return new Date(y, m, d + 1);
    case 'ArrowUp': return new Date(y, m, d - 7);
    case 'ArrowDown': return new Date(y, m, d + 7);
    case 'Home': return new Date(y, m, d - dow);
    case 'End': return new Date(y, m, d + 6 - dow);
    case 'PageUp':
    case 'PageDown': {
      const target = m + (key === 'PageUp' ? -1 : 1);
      const lastDay = new Date(y, target + 1, 0).getDate();
      return new Date(y, target, Math.min(d, lastDay));
    }
    default: return null;
  }
};
