const TZ = "Asia/Bangkok";

/** Thai date and time (Buddhist-era year, Bangkok time), or "-" when empty. */
export function formatThaiDateTime(value: Date | string | null | undefined): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: TZ });
}

export function formatThaiDate(value: Date | string | null | undefined): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("th-TH", { dateStyle: "medium", timeZone: TZ });
}

export const APPROVAL_LABELS: Record<string, string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  rejected: "ไม่อนุมัติ",
};

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A YYYY-MM-DD calendar date as Buddhist-era dd/mm/yy (e.g. 2026-11-03 -> 03/11/69),
 * or "-" when empty or invalid. Parsed as text, so no time-zone shift.
 */
export function formatThaiShortDate(value: string | null | undefined): string {
  const m = value ? DATE_ONLY_RE.exec(value) : null;
  if (!m) return "-";
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return "-";
  return `${m[3]}/${m[2]}/${String((year + 543) % 100).padStart(2, "0")}`;
}
