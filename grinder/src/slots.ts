import type { DayType } from './types';

/**
 * Slot grid (§7.1): {weekday, weekend} x {0700, 0930, 1230, 1700, 1930, 2100}
 * local time, Australia/Melbourne, DST-aware via Intl. 12 slots per platform.
 */

export const TIMEZONE = 'Australia/Melbourne';
export const SLOT_MINUTES: number[] = [
  7 * 60, // 0700
  9 * 60 + 30, // 0930
  12 * 60 + 30, // 1230
  17 * 60, // 1700
  19 * 60 + 30, // 1930
  21 * 60, // 2100
];
export const SLOT_WIDTH_MINUTES = 30; // one 30-minute cron tick per slot

export interface LocalTime {
  dateStr: string; // YYYY-MM-DD local
  minutesOfDay: number;
  dayType: DayType;
}

export function melbourneLocal(d: Date, timeZone: string = TIMEZONE): LocalTime {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone,
    hour12: false,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  // Intl can render midnight as "24"; normalise.
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  const weekday = get('weekday');
  const dayType: DayType = weekday === 'Sat' || weekday === 'Sun' ? 'weekend' : 'weekday';
  return {
    dateStr: `${get('year')}-${get('month')}-${get('day')}`,
    minutesOfDay: hour * 60 + minute,
    dayType,
  };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function slotKey(dayType: DayType, slotMinutes: number): string {
  return `${dayType}_${pad(Math.floor(slotMinutes / 60))}${pad(slotMinutes % 60)}`;
}

/**
 * Returns the slot key when `d` falls inside a slot's firing window
 * ([slot, slot + 30min)), else null. Cron ticks land at :00/:30 so each slot
 * fires on exactly one tick.
 */
export function currentSlot(d: Date, timeZone: string = TIMEZONE): string | null {
  const local = melbourneLocal(d, timeZone);
  for (const s of SLOT_MINUTES) {
    if (local.minutesOfDay >= s && local.minutesOfDay < s + SLOT_WIDTH_MINUTES) {
      return slotKey(local.dayType, s);
    }
  }
  return null;
}

export function allSlotKeys(): string[] {
  const out: string[] = [];
  for (const dt of ['weekday', 'weekend'] as DayType[]) {
    for (const s of SLOT_MINUTES) out.push(slotKey(dt, s));
  }
  return out;
}
