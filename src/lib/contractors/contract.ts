import { EXPIRING_SOON_DAYS } from "./constants";

export type ContractStatus = "inactive" | "not_started" | "ended" | "expiring" | "active";

/**
 * Only contractors who can no longer sign in may be deleted, so an admin cannot
 * remove a working account by mistake (deactivate it first).
 */
export function canDeleteContractor(status: ContractStatus): boolean {
  return status === "ended" || status === "inactive";
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

const bangkokFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Current calendar date in Asia/Bangkok as YYYY-MM-DD. */
export function bangkokToday(now: Date): string {
  return bangkokFormat.format(now);
}

function toUtcDay(s: string): number {
  const m = DATE_RE.exec(s);
  if (!m) return Number.NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isValidDateString(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const d = new Date(toUtcDay(s));
  return (
    d.getUTCFullYear() === Number(m[1]) &&
    d.getUTCMonth() === Number(m[2]) - 1 &&
    d.getUTCDate() === Number(m[3])
  );
}

/** Inclusive window check against today in Asia/Bangkok. */
export function isWithinContract(
  start: string,
  end: string,
  now: Date,
): "ok" | "not_started" | "ended" {
  const today = bangkokToday(now);
  if (today < start) return "not_started";
  if (today > end) return "ended";
  return "ok";
}

export function contractStatus(
  c: { isActive: boolean; contractStart: string; contractEnd: string },
  now: Date,
): { status: ContractStatus; daysLeft: number } {
  const daysLeft = Math.round((toUtcDay(c.contractEnd) - toUtcDay(bangkokToday(now))) / DAY_MS);
  if (!c.isActive) return { status: "inactive", daysLeft };
  const window = isWithinContract(c.contractStart, c.contractEnd, now);
  if (window === "not_started") return { status: "not_started", daysLeft };
  if (window === "ended") return { status: "ended", daysLeft };
  if (daysLeft <= EXPIRING_SOON_DAYS) return { status: "expiring", daysLeft };
  return { status: "active", daysLeft };
}
