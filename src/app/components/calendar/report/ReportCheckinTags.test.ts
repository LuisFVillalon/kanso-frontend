import { describe, expect, it } from 'vitest';
import { describeTagMood } from './ReportCheckinTags';

describe('describeTagMood', () => {
  it('compares the averages as shown, so the numbers add up', () => {
    expect(describeTagMood('gym', 7, 3.94, 3.25))
      .toBe('On the 7 days you tagged “gym”, your mood averaged 3.9 (Good) — 0.6 higher than your usual 3.3.');
    expect(describeTagMood('late night', 4, 3.26, 3.34))
      .toBe('On the 4 days you tagged “late night”, your mood averaged 3.3 (Okay) — the same as your usual 3.3.');
  });
});
