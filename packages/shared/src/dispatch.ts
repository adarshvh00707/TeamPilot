import { z } from 'zod';
import type { AttendanceVerificationStatus, AvailabilityStatus, Role } from './constants/domain';

// ---------------------------------------------------------------------------
// Availability derivation
// ---------------------------------------------------------------------------

export interface AvailabilitySignals {
  onBreak: boolean;
  /** An open UNAVAILABLE record ("pause offers"). */
  paused: boolean;
  /** Verification of the open attendance record, or null if not clocked in. */
  openAttendance: AttendanceVerificationStatus | null;
  working: boolean;
  hasOpenOffer: boolean;
}

/**
 * One place decides what a member's availability is, so the roster, the member's own screen, and the
 * dispatch engine never disagree. Not clocked in means OFF_SHIFT: nobody is treated as present without
 * an attendance record.
 */
export function deriveAvailability(s: AvailabilitySignals): { status: AvailabilityStatus; verification: AttendanceVerificationStatus } {
  const verification = s.openAttendance ?? 'UNKNOWN';
  if (!s.openAttendance) return { status: 'OFF_SHIFT', verification };
  if (s.onBreak) return { status: 'ON_BREAK', verification };
  if (s.paused) return { status: 'UNAVAILABLE', verification };
  if (s.working) return { status: 'WORKING', verification };
  if (s.hasOpenOffer) return { status: 'PENDING_ACCEPTANCE', verification };
  return { status: 'AVAILABLE', verification };
}

// ---------------------------------------------------------------------------
// Dispatch policy
// ---------------------------------------------------------------------------

export const dispatchPolicySchema = z.object({
  /** Managers and admins are offered work only when enabled. */
  includeManagers: z.boolean().default(false),
  /** Offers per wave = ceil(remaining positions x factor), capped by maxOffersPerWave. */
  overOfferFactor: z.number().min(1).max(5).default(1.5),
  maxOffersPerWave: z.number().int().min(1).max(50).default(10),
  maxWaves: z.number().int().min(1).max(10).default(3),
});
export type DispatchPolicy = z.infer<typeof dispatchPolicySchema>;
export const dispatchPolicyInputSchema = dispatchPolicySchema.partial();

export function parseDispatchPolicy(raw: unknown): DispatchPolicy {
  const parsed = dispatchPolicySchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : dispatchPolicySchema.parse({});
}

// ---------------------------------------------------------------------------
// Candidate selection
// ---------------------------------------------------------------------------

export interface WorkloadInputs {
  /** Minutes of accepted-or-later work assigned in the trailing 7 days. */
  recentMinutes: number;
  /** Assignments accepted in the trailing 24 hours. */
  acceptedToday: number;
  /** HIGH or CRITICAL assignments in the trailing 7 days. */
  highPriorityRecent: number;
}

export interface DispatchCandidate {
  userId: string;
  role: Role;
  availability: AvailabilityStatus;
  skills: string[];
  hasOpenOffer: boolean;
  alreadyOfferedThisTask: boolean;
  liveOnThisTask: boolean;
  hasConflict: boolean;
  workload: WorkloadInputs;
}

export const INELIGIBLE_REASONS = [
  'ROLE_EXCLUDED',
  'ALREADY_ASSIGNED',
  'ALREADY_OFFERED',
  'PENDING_OFFER',
  'NOT_AVAILABLE',
  'MISSING_SKILL',
  'SCHEDULE_CONFLICT',
] as const;
export type IneligibleReason = (typeof INELIGIBLE_REASONS)[number];

export interface RankedCandidate {
  userId: string;
  score: number;
  tieBreak: number;
}

export interface WavePlan {
  selected: string[];
  ranked: RankedCandidate[];
  ineligible: Array<{ userId: string; reason: IneligibleReason }>;
  waveSize: number;
}

/** Lower is fairer to pick. Weights favour spreading both time and count of recent work. */
export function workloadScore(w: WorkloadInputs): number {
  return w.recentMinutes + 20 * w.acceptedToday + 30 * w.highPriorityRecent;
}

/** FNV-1a 32-bit. Stable across runtimes, so the same seed always produces the same order. */
export function seededTieBreak(seed: string, userId: string): number {
  let h = 0x811c9dc5;
  const s = `${seed}:${userId}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function ineligibleReason(c: DispatchCandidate, requiredSkills: readonly string[], policy: DispatchPolicy): IneligibleReason | null {
  if (c.role !== 'STAFF' && !policy.includeManagers) return 'ROLE_EXCLUDED';
  if (c.liveOnThisTask) return 'ALREADY_ASSIGNED';
  if (c.alreadyOfferedThisTask) return 'ALREADY_OFFERED';
  if (c.hasOpenOffer) return 'PENDING_OFFER';
  if (c.availability !== 'AVAILABLE') return 'NOT_AVAILABLE';
  if (requiredSkills.some((s) => !c.skills.includes(s))) return 'MISSING_SKILL';
  if (c.hasConflict) return 'SCHEDULE_CONFLICT';
  return null;
}

/** Pure and deterministic: identical inputs and seed always yield the same plan. */
export function planWave(input: {
  candidates: readonly DispatchCandidate[];
  requiredSkills: readonly string[];
  remainingPositions: number;
  policy: DispatchPolicy;
  seed: string;
}): WavePlan {
  const ineligible: WavePlan['ineligible'] = [];
  const ranked: RankedCandidate[] = [];
  for (const c of input.candidates) {
    const reason = ineligibleReason(c, input.requiredSkills, input.policy);
    if (reason) ineligible.push({ userId: c.userId, reason });
    else ranked.push({ userId: c.userId, score: workloadScore(c.workload), tieBreak: seededTieBreak(input.seed, c.userId) });
  }
  ranked.sort((a, b) => a.score - b.score || a.tieBreak - b.tieBreak || (a.userId < b.userId ? -1 : 1));
  const waveSize =
    input.remainingPositions <= 0
      ? 0
      : Math.min(input.policy.maxOffersPerWave, Math.ceil(input.remainingPositions * input.policy.overOfferFactor));
  return { selected: ranked.slice(0, waveSize).map((r) => r.userId), ranked, ineligible, waveSize };
}
