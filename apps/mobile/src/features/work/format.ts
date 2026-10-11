import type { AssignmentStatus, EventStatus, TaskStatus } from '@teampilot/shared';

type Tone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

export const humanize = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

export function statusTone(status: TaskStatus | EventStatus | AssignmentStatus): Tone {
  switch (status) {
    case 'COMPLETED':
    case 'FULLY_STAFFED':
    case 'ACCEPTED':
      return 'success';
    case 'CANCELLED':
    case 'REASSIGNMENT_REQUIRED':
      return 'danger';
    case 'NEEDS_MANAGER_ATTENTION':
    case 'PARTIALLY_STAFFED':
    case 'ASSIGNED':
      return 'warning';
    case 'DRAFT':
      return 'neutral';
    default:
      return 'info';
  }
}

const timeFmt = (tz?: string) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: tz });
const dayFmt = (tz?: string) => new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz });

export const formatDay = (iso: string, tz?: string) => dayFmt(tz).format(new Date(iso));
export const formatTime = (iso: string, tz?: string) => timeFmt(tz).format(new Date(iso));
export const formatDateTime = (iso: string, tz?: string) => `${formatDay(iso, tz)}, ${formatTime(iso, tz)}`;

export function formatRange(startIso: string, endIso: string, tz?: string) {
  const sameDay = formatDay(startIso, tz) === formatDay(endIso, tz);
  return sameDay
    ? `${formatDay(startIso, tz)}, ${formatTime(startIso, tz)} – ${formatTime(endIso, tz)}`
    : `${formatDateTime(startIso, tz)} – ${formatDateTime(endIso, tz)}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "YYYY-MM-DD HH:mm" in the device's local time. */
export function toLocalInput(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parses "YYYY-MM-DD HH:mm" as device-local time; returns an ISO string or null if invalid. */
export function parseLocalInput(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const date = new Date(y, mo - 1, d, h, mi);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d || h > 23 || mi > 59) return null;
  return date.toISOString();
}

export const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
