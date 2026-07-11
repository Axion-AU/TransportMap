import { describe, expect, it } from 'vitest';
import { allSlotKeys, currentSlot, melbourneLocal } from '../src/slots';

describe('melbourne slot grid (DST-aware)', () => {
  it('July (AEST, UTC+10): 21:00 UTC Wed = 07:00 Thu local, weekday_0700', () => {
    const d = new Date('2026-07-08T21:00:00Z');
    const local = melbourneLocal(d);
    expect(local.dateStr).toBe('2026-07-09');
    expect(local.minutesOfDay).toBe(7 * 60);
    expect(local.dayType).toBe('weekday');
    expect(currentSlot(d)).toBe('weekday_0700');
  });

  it('January (AEDT, UTC+11): 20:00 UTC = 07:00 local next day', () => {
    const d = new Date('2026-01-06T20:00:00Z');
    const local = melbourneLocal(d);
    expect(local.minutesOfDay).toBe(7 * 60);
    expect(currentSlot(d)).toBe('weekday_0700');
    // the +10 offset that was correct in July is now mid-slot-less time
    expect(currentSlot(new Date('2026-01-06T21:00:00Z'))).toBeNull(); // 08:00 local
  });

  it('weekend detection uses local day, not UTC day', () => {
    // Friday 22:00 UTC in July = Saturday 08:00 local — no wait, 08:00 isn't a
    // slot; use Saturday 09:30 local = Friday 23:30 UTC.
    const d = new Date('2026-07-10T23:30:00Z');
    const local = melbourneLocal(d);
    expect(local.dayType).toBe('weekend');
    expect(currentSlot(d)).toBe('weekend_0930');
  });

  it('ticks inside the 30-minute window match; outside do not', () => {
    expect(currentSlot(new Date('2026-07-09T02:30:00Z'))).toBe('weekday_1230'); // 12:30 local
    expect(currentSlot(new Date('2026-07-09T03:00:00Z'))).toBeNull(); // 13:00 local
  });

  it('the grid has 12 slots per platform', () => {
    expect(allSlotKeys()).toHaveLength(12);
  });
});
