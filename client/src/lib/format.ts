import type { GenderPreference, Gender, RoomType, RequestStatus, RuleId } from '../api/types';

const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹ amounts. Whole rupees stay whole; fractional ones (perMemberInr) show paise. */
export const inr = (n: number) => (Number.isInteger(n) ? inr0 : inr2).format(n);

// Dates are 'YYYY-MM-DD' in the destination's local time. Format them as calendar
// dates (UTC) so the viewer's own timezone can never shift a day.
const parse = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
};
const dm = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dmy = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: 'UTC' });

export const fmtDate = (d: string) => dm.format(parse(d));
export const fmtDateLong = (d: string) => dmy.format(parse(d));

/** "10–15 Apr" when both in the same month, else "28 Mar – 2 Apr". */
export function fmtRange(from: string, to: string) {
  const a = parse(from), b = parse(to);
  if (a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear()) {
    return `${day.format(a)}–${dm.format(b)}`;
  }
  return `${dm.format(a)} – ${dm.format(b)}`;
}

export const nightsBetween = (checkIn: string, checkOut: string) =>
  Math.round((parse(checkOut).getTime() - parse(checkIn).getTime()) / 86_400_000);

export const addDays = (d: string, n: number) => {
  const x = parse(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');

export const genderLabel = (g: Gender) => (g === 'FEMALE' ? 'Female' : 'Male');

export function preferenceLabel(p: GenderPreference, gender?: Gender) {
  if (p === 'ANY') return 'Anyone';
  if (!gender) return 'Same gender only';
  return gender === 'FEMALE' ? 'Women only' : 'Men only';
}

export const roomTypeLabel: Record<RoomType, string> = {
  SINGLE: 'Single', TWIN: 'Twin', DOUBLE: 'Double', TRIPLE: 'Triple', FAMILY: 'Family', FAMILY_SUITE: 'Family suite',
};

export const requestStatusLabel: Record<RequestStatus, string> = {
  PENDING: 'Waiting for the owner', APPROVED: 'Approved', REJECTED: 'Declined', WITHDRAWN: 'Withdrawn', CLOSED: 'Closed',
};

export const ruleLabel: Record<RuleId, string> = {
  SAME_CITY: 'Same city',
  DATES_OVERLAP: 'Dates overlap',
  BUDGET: 'Budget',
  SHARED_INTERESTS: 'Shared interests',
  GENDER: 'Gender preference',
  GROUP_SIZE: 'Group size',
};

/** A stable, palette-only colour per person for avatars. */
const AVATAR_COLOURS = ['#E5C77E', '#8DA9A0', '#D98268', '#DCE7E2', '#F6DDD3', '#F6EBCB'];
export function avatarColour(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLOURS[h % AVATAR_COLOURS.length];
}
